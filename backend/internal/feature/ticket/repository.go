package ticket

import (
	"context"
	"errors"
	"fmt"
	"net/netip"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"reception-system/internal/db"
	"reception-system/internal/pkg/connecterr"
)

type Repository struct {
	pool    *pgxpool.Pool
	queries *db.Queries
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool, queries: db.New(pool)}
}

// ParticipantInput holds one participant's age and optional name.
type ParticipantInput struct {
	Age  int32
	Name string
}

// ParentalConsentInput holds guardian consent data for participants aged 10–12 (R-005-2).
type ParentalConsentInput struct {
	GuardianName        string
	ConsentTextSnapshot string
	UserAgent           string
	IPAddress           string
}

// CreateTicketRequest is the input for the CreateTicket operation.
type CreateTicketRequest struct {
	VisitorID       int64
	BoothID         int64
	Participants    []ParticipantInput
	MatchMode       string
	ParentalConsent *ParentalConsentInput
}

// CreateTicketResult is returned on successful ticket creation.
type CreateTicketResult struct {
	TicketID         int64
	Status           string
	SequenceInBooth  int32
	Position         int32
	MatchMode        string // "public", "private", or "" for non-matchmaking
	ParticipantCount int32
}

// MatchmakingInfo holds queue context for matchmaking booth tickets.
type MatchmakingInfo struct {
	MatchMode          string
	PublicWaitingCount int32
	TargetPartySize    int32
}

// TicketStatusResult contains status and queue position for a ticket.
type TicketStatusResult struct {
	Ticket          db.Ticket
	Booth           db.Booth
	Position        int32
	MatchmakingInfo *MatchmakingInfo
}

func (r *Repository) CreateTicket(ctx context.Context, req CreateTicketRequest) (CreateTicketResult, error) {
	if len(req.Participants) == 0 {
		return CreateTicketResult{}, fmt.Errorf("ticket repository: at least one participant required")
	}

	// Age checks (R-005): before hitting the DB.
	for _, p := range req.Participants {
		if p.Age < 7 {
			return CreateTicketResult{}, connecterr.ErrUnderAge
		}
		if p.Age < 10 {
			return CreateTicketResult{}, connecterr.ErrSpecialFlowRequired
		}
	}

	// Parental consent check: any participant aged 10–12 requires consent (R-005).
	needsConsent := false
	for _, p := range req.Participants {
		if p.Age < 13 {
			needsConsent = true
			break
		}
	}
	if needsConsent && req.ParentalConsent == nil {
		return CreateTicketResult{}, connecterr.ErrConsentRequired
	}

	// Fetch booth and validate accepting status + operating hours.
	booth, err := r.queries.GetBoothByID(ctx, req.BoothID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return CreateTicketResult{}, connecterr.ErrNotFound
		}
		return CreateTicketResult{}, fmt.Errorf("ticket repository: get booth: %w", err)
	}
	if !booth.IsAccepting {
		return CreateTicketResult{}, connecterr.ErrBoothClosed
	}
	now := time.Now()
	if booth.OpenAt.Valid && booth.CloseAt.Valid {
		if now.Before(booth.OpenAt.Time) || now.After(booth.CloseAt.Time) {
			return CreateTicketResult{}, connecterr.ErrBoothOutOfHours
		}
	}

	// Private match participant count check (R-016): reject before creating anything.
	if req.MatchMode == "private" && booth.MinPartySize != nil && int32(len(req.Participants)) < *booth.MinPartySize {
		return CreateTicketResult{}, fmt.Errorf("ticket repository: private match requires at least %d participants: %w",
			*booth.MinPartySize, connecterr.ErrInsufficientParticipants)
	}

	// Cooldown check (R-007).
	if booth.CooldownMinutes > 0 {
		lastAdmitted, err := r.queries.GetLastAdmittedAtForVisitorBooth(ctx, db.GetLastAdmittedAtForVisitorBoothParams{
			VisitorID: req.VisitorID,
			BoothID:   req.BoothID,
		})
		if err == nil && lastAdmitted.Valid {
			cooldown := time.Duration(booth.CooldownMinutes) * time.Minute
			if time.Since(lastAdmitted.Time) < cooldown {
				return CreateTicketResult{}, connecterr.ErrCooldownActive
			}
		}
	}

	// Duplicate active ticket check (R-007).
	// The unique index is the hard constraint; this pre-check gives a better error.
	activeTickets, err := r.queries.ListTicketsByBoothID(ctx, db.ListTicketsByBoothIDParams{
		BoothID: req.BoothID,
		Column2: []string{"waiting", "called", "pending"},
	})
	if err != nil {
		return CreateTicketResult{}, fmt.Errorf("ticket repository: list active tickets: %w", err)
	}
	for _, t := range activeTickets {
		if t.VisitorID == req.VisitorID {
			return CreateTicketResult{}, connecterr.ErrAlreadyHasTicket
		}
	}

	// Transaction: CreateTicket → CreateTicketGroup → UpdateTicketGroupID → Participants → Consents.
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return CreateTicketResult{}, fmt.Errorf("ticket repository: begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	qtx := r.queries.WithTx(tx)

	seq, err := qtx.GetNextSequenceInBooth(ctx, req.BoothID)
	if err != nil {
		return CreateTicketResult{}, fmt.Errorf("ticket repository: next sequence: %w", err)
	}

	var matchMode *string
	if req.MatchMode != "" {
		matchMode = &req.MatchMode
	}

	// Step 1: Insert ticket with placeholder ticket_group_id=0 (DEFERRABLE FK).
	ticket, err := qtx.CreateTicket(ctx, db.CreateTicketParams{
		VisitorID:       req.VisitorID,
		BoothID:         req.BoothID,
		TicketGroupID:   0,
		SequenceInBooth: seq,
		Status:          "waiting",
		MatchMode:       matchMode,
	})
	if err != nil {
		if isUniqueViolation(err) {
			return CreateTicketResult{}, connecterr.ErrAlreadyHasTicket
		}
		return CreateTicketResult{}, fmt.Errorf("ticket repository: create ticket: %w", err)
	}

	// Step 2: Insert ticket_group referencing the ticket.
	group, err := qtx.CreateTicketGroup(ctx, db.CreateTicketGroupParams{
		TicketID:         ticket.ID,
		ParticipantCount: int32(len(req.Participants)),
	})
	if err != nil {
		return CreateTicketResult{}, fmt.Errorf("ticket repository: create ticket group: %w", err)
	}

	// Step 3: Update ticket's ticket_group_id (resolves DEFERRABLE FK cycle).
	if err := qtx.UpdateTicketGroupID(ctx, db.UpdateTicketGroupIDParams{
		ID:            ticket.ID,
		TicketGroupID: group.ID,
	}); err != nil {
		return CreateTicketResult{}, fmt.Errorf("ticket repository: update ticket_group_id: %w", err)
	}

	// Step 4: Insert participants.
	for _, p := range req.Participants {
		name := &p.Name
		if p.Name == "" {
			name = nil
		}
		participant, err := qtx.CreateParticipant(ctx, db.CreateParticipantParams{
			TicketGroupID: group.ID,
			Name:          name,
			Age:           p.Age,
		})
		if err != nil {
			return CreateTicketResult{}, fmt.Errorf("ticket repository: create participant: %w", err)
		}

		// Step 5: Insert parental consent for participants aged 10–12.
		if p.Age < 13 && req.ParentalConsent != nil {
			ip, err := netip.ParseAddr(req.ParentalConsent.IPAddress)
			if err != nil {
				return CreateTicketResult{}, fmt.Errorf("ticket repository: parse ip address: %w", err)
			}
			if _, err := qtx.CreateParentalConsent(ctx, db.CreateParentalConsentParams{
				ParticipantID:       participant.ID,
				ConsentMethod:       "digital_level25",
				ConsentTextSnapshot: req.ParentalConsent.ConsentTextSnapshot,
				GuardianName:        req.ParentalConsent.GuardianName,
				Column5:             ip,
				UserAgent:           req.ParentalConsent.UserAgent,
				PaperFormID:         nil,
			}); err != nil {
				return CreateTicketResult{}, fmt.Errorf("ticket repository: create parental consent: %w", err)
			}
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return CreateTicketResult{}, fmt.Errorf("ticket repository: commit: %w", err)
	}

	position, err := r.queries.GetTicketPosition(ctx, ticket.ID)
	if err != nil {
		return CreateTicketResult{}, fmt.Errorf("ticket repository: get position: %w", err)
	}

	return CreateTicketResult{
		TicketID:         ticket.ID,
		Status:           ticket.Status,
		SequenceInBooth:  ticket.SequenceInBooth,
		Position:         position,
		MatchMode:        req.MatchMode,
		ParticipantCount: int32(len(req.Participants)),
	}, nil
}

func (r *Repository) GetTicketStatus(ctx context.Context, ticketID int64) (TicketStatusResult, error) {
	ticket, err := r.queries.GetTicketByID(ctx, ticketID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return TicketStatusResult{}, connecterr.ErrNotFound
		}
		return TicketStatusResult{}, fmt.Errorf("ticket repository: get ticket: %w", err)
	}

	booth, err := r.queries.GetBoothByID(ctx, ticket.BoothID)
	if err != nil {
		return TicketStatusResult{}, fmt.Errorf("ticket repository: get booth: %w", err)
	}

	position, err := r.queries.GetTicketPosition(ctx, ticketID)
	if err != nil {
		return TicketStatusResult{}, fmt.Errorf("ticket repository: get position: %w", err)
	}

	result := TicketStatusResult{Ticket: ticket, Booth: booth, Position: position}

	if booth.ExperienceType == "matchmaking" && ticket.MatchMode != nil {
		publicRows, err := r.queries.ListWaitingPublicTicketsByBooth(ctx, booth.ID)
		if err != nil {
			return TicketStatusResult{}, fmt.Errorf("ticket repository: list public waiting: %w", err)
		}
		var publicCount int32
		for _, row := range publicRows {
			publicCount += row.ParticipantCount
		}
		targetSize := int32(0)
		if booth.TargetPartySize != nil {
			targetSize = *booth.TargetPartySize
		}
		result.MatchmakingInfo = &MatchmakingInfo{
			MatchMode:          *ticket.MatchMode,
			PublicWaitingCount: publicCount,
			TargetPartySize:    targetSize,
		}
	}

	return result, nil
}

func (r *Repository) ListByVisitorID(ctx context.Context, visitorID int64) ([]TicketStatusResult, error) {
	tickets, err := r.queries.ListTicketsByVisitorID(ctx, visitorID)
	if err != nil {
		return nil, fmt.Errorf("ticket repository: list by visitor: %w", err)
	}

	results := make([]TicketStatusResult, len(tickets))
	for i, t := range tickets {
		booth, err := r.queries.GetBoothByID(ctx, t.BoothID)
		if err != nil {
			return nil, fmt.Errorf("ticket repository: get booth %d: %w", t.BoothID, err)
		}
		position, err := r.queries.GetTicketPosition(ctx, t.ID)
		if err != nil {
			return nil, fmt.Errorf("ticket repository: get position for ticket %d: %w", t.ID, err)
		}
		results[i] = TicketStatusResult{Ticket: t, Booth: booth, Position: position}
	}
	return results, nil
}

func (r *Repository) Cancel(ctx context.Context, ticketID, visitorID int64) error {
	ticket, err := r.queries.GetTicketByID(ctx, ticketID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return connecterr.ErrNotFound
		}
		return fmt.Errorf("ticket repository: get ticket for cancel: %w", err)
	}

	// Ownership check.
	if ticket.VisitorID != visitorID {
		return connecterr.ErrNotFound
	}

	// R-014: only waiting / called / pending can be cancelled by the visitor.
	switch ticket.Status {
	case "waiting", "called", "pending":
	default:
		return connecterr.ErrCancelNotAllowed
	}

	if err := r.queries.UpdateTicketStatus(ctx, db.UpdateTicketStatusParams{
		ID:     ticketID,
		Status: "cancelled",
	}); err != nil {
		return fmt.Errorf("ticket repository: cancel: %w", err)
	}
	return nil
}

// TicketStatusByReceptionResult is returned by GetTicketStatusByReceptionNumber.
type TicketStatusByReceptionResult struct {
	Ticket          db.Ticket
	Booth           db.Booth
	Position        int32
	ReceptionNumber string
}

// GetTicketStatusByReceptionNumber returns the most recent non-cancelled ticket
// for the given visitor (identified by reception number) at the given booth.
// This is a read-only, PIN-free lookup (ticket.md §6 / R-019).
func (r *Repository) GetTicketStatusByReceptionNumber(
	ctx context.Context, boothID int64, receptionNumber string,
) (TicketStatusByReceptionResult, error) {
	ticket, err := r.queries.GetActiveTicketByBoothAndReceptionNumber(ctx,
		db.GetActiveTicketByBoothAndReceptionNumberParams{
			BoothID:         boothID,
			ReceptionNumber: receptionNumber,
		})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return TicketStatusByReceptionResult{}, connecterr.ErrNotFound
		}
		return TicketStatusByReceptionResult{}, fmt.Errorf("ticket repository: get by reception number: %w", err)
	}

	booth, err := r.queries.GetBoothByID(ctx, boothID)
	if err != nil {
		return TicketStatusByReceptionResult{}, fmt.Errorf("ticket repository: get booth: %w", err)
	}

	position, err := r.queries.GetTicketPosition(ctx, ticket.ID)
	if err != nil {
		return TicketStatusByReceptionResult{}, fmt.Errorf("ticket repository: get position: %w", err)
	}

	return TicketStatusByReceptionResult{
		Ticket:          ticket,
		Booth:           booth,
		Position:        position,
		ReceptionNumber: receptionNumber,
	}, nil
}

func isUniqueViolation(err error) bool {
	msg := err.Error()
	return strings.Contains(msg, "unique") || strings.Contains(msg, "23505")
}
