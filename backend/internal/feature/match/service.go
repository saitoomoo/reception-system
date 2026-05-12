package match

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"reception-system/internal/db"
	"reception-system/internal/pkg/connecterr"
)

var (
	ErrInsufficientParticipants = errors.New("insufficient participants for match")
	ErrNotMatchmakingBooth      = errors.New("booth is not a matchmaking booth")
	ErrNoPrivateSession         = errors.New("ticket has no private match session")
)

// Service handles matchmaking business logic across the tickets and match_sessions tables.
type Service struct {
	repo   *Repository
	logger *slog.Logger
}

func NewService(repo *Repository, logger *slog.Logger) *Service {
	return &Service{repo: repo, logger: logger}
}

// MatchQueueStatus is returned by GetMatchQueueStatus.
type MatchQueueStatus struct {
	PublicWaiting      []db.ListWaitingPublicTicketsByBoothRow
	PublicWaitingTotal int32
	TargetPartySize    int32
	MinPartySize       int32
	PrivateWaiting     []db.ListWaitingPrivateTicketsByBoothRow
	ActiveSessions     []db.MatchSession
}

// selectMatchGroup applies the accumulation algorithm to find which tickets form a match.
// Returns selected ticket IDs, total participant count, and whether a match was formed.
// Stops at the first group that would overflow target_party_size (MVP spec: no group splitting).
func selectMatchGroup(tickets []db.ListWaitingPublicTicketsByBoothRow, target int32) ([]int64, int32, bool) {
	var total int32
	var ids []int64
	for _, t := range tickets {
		if total+t.ParticipantCount > target {
			break
		}
		total += t.ParticipantCount
		ids = append(ids, t.ID)
		if total == target {
			return ids, total, true
		}
	}
	return nil, 0, false
}

// CheckAndExecuteMatch checks if a public auto-match can be formed for the booth.
// If target_party_size participants are accumulated, creates a session and calls the tickets.
// Returns nil (no error, no match) if participants are insufficient or overflow occurs.
func (s *Service) CheckAndExecuteMatch(ctx context.Context, boothID int64) error {
	booth, err := s.repo.GetBoothByID(ctx, boothID)
	if err != nil {
		return fmt.Errorf("match service: check and execute: %w", err)
	}
	if booth.ExperienceType != "matchmaking" || booth.TargetPartySize == nil {
		return nil
	}

	tickets, err := s.repo.ListWaitingPublicTickets(ctx, boothID)
	if err != nil {
		return fmt.Errorf("match service: list public tickets: %w", err)
	}

	ids, total, ok := selectMatchGroup(tickets, *booth.TargetPartySize)
	if !ok {
		return nil
	}

	if _, err := s.repo.CreateSessionCallAndStart(ctx, boothID, "public", total, ids); err != nil {
		return fmt.Errorf("match service: create session: %w", err)
	}

	s.logger.Info("auto-match formed",
		slog.Int64("booth_id", boothID),
		slog.Int("tickets", len(ids)),
		slog.Int("participants", int(total)),
	)
	return nil
}

// CreatePrivateMatchSession creates a waiting match session for a private ticket.
// Called immediately after a private ticket is created.
func (s *Service) CreatePrivateMatchSession(ctx context.Context, ticketID, boothID int64, participantCount int32) error {
	if _, err := s.repo.CreateSessionAndAssign(ctx, boothID, "private", participantCount, []int64{ticketID}); err != nil {
		return fmt.Errorf("match service: create private session: %w", err)
	}
	return nil
}

// ForceStartMatch force-starts a match session with all current public waiting tickets.
// Requires total participants >= min_party_size.
// Returns the new session ID.
func (s *Service) ForceStartMatch(ctx context.Context, boothID int64) (int64, error) {
	booth, err := s.repo.GetBoothByID(ctx, boothID)
	if err != nil {
		return 0, fmt.Errorf("match service: force start: %w", err)
	}
	if booth.ExperienceType != "matchmaking" || booth.MinPartySize == nil {
		return 0, ErrNotMatchmakingBooth
	}

	tickets, err := s.repo.ListWaitingPublicTickets(ctx, boothID)
	if err != nil {
		return 0, fmt.Errorf("match service: list public tickets: %w", err)
	}

	var total int32
	ids := make([]int64, 0, len(tickets))
	for _, t := range tickets {
		total += t.ParticipantCount
		ids = append(ids, t.ID)
	}

	if total < *booth.MinPartySize {
		return 0, fmt.Errorf("%w: have %d, need %d", ErrInsufficientParticipants, total, *booth.MinPartySize)
	}

	session, err := s.repo.CreateSessionCallAndStart(ctx, boothID, "public", total, ids)
	if err != nil {
		return 0, fmt.Errorf("match service: create force session: %w", err)
	}

	s.logger.Info("force-start match",
		slog.Int64("booth_id", boothID),
		slog.Int64("session_id", session.ID),
		slog.Int("participants", int(total)),
	)
	return session.ID, nil
}

// CallPrivateMatch calls all tickets in the private match session associated with ticketID.
func (s *Service) CallPrivateMatch(ctx context.Context, ticketID, boothID int64) error {
	ticket, err := s.repo.GetTicketByID(ctx, ticketID)
	if err != nil {
		return fmt.Errorf("match service: get ticket: %w", err)
	}
	if ticket.BoothID != boothID {
		return connecterr.ErrForbidden
	}
	if ticket.MatchSessionID == nil {
		return ErrNoPrivateSession
	}
	if err := s.repo.CallSessionTickets(ctx, *ticket.MatchSessionID, boothID); err != nil {
		return fmt.Errorf("match service: call private session: %w", err)
	}
	return nil
}

// CompleteMatchSession admits all tickets in the session and marks it completed.
func (s *Service) CompleteMatchSession(ctx context.Context, sessionID, boothID int64) error {
	if err := s.repo.CompleteSession(ctx, sessionID, boothID); err != nil {
		return fmt.Errorf("match service: complete session: %w", err)
	}
	return nil
}

// GetMatchQueueStatus returns the current match queue for a matchmaking booth.
func (s *Service) GetMatchQueueStatus(ctx context.Context, boothID int64) (*MatchQueueStatus, error) {
	booth, err := s.repo.GetBoothByID(ctx, boothID)
	if err != nil {
		return nil, fmt.Errorf("match service: get booth: %w", err)
	}

	public, err := s.repo.ListWaitingPublicTickets(ctx, boothID)
	if err != nil {
		return nil, fmt.Errorf("match service: list public: %w", err)
	}

	private, err := s.repo.ListWaitingPrivateTickets(ctx, boothID)
	if err != nil {
		return nil, fmt.Errorf("match service: list private: %w", err)
	}

	active, err := s.repo.ListMatchSessionsByBooth(ctx, boothID, []string{"waiting", "in_progress"})
	if err != nil {
		return nil, fmt.Errorf("match service: list active sessions: %w", err)
	}

	var publicTotal int32
	for _, t := range public {
		publicTotal += t.ParticipantCount
	}

	var target, min int32
	if booth.TargetPartySize != nil {
		target = *booth.TargetPartySize
	}
	if booth.MinPartySize != nil {
		min = *booth.MinPartySize
	}

	return &MatchQueueStatus{
		PublicWaiting:      public,
		PublicWaitingTotal: publicTotal,
		TargetPartySize:    target,
		MinPartySize:       min,
		PrivateWaiting:     private,
		ActiveSessions:     active,
	}, nil
}
