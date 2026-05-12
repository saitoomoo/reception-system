package match

import (
	"context"
	"errors"
	"fmt"

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

func (r *Repository) GetBoothByID(ctx context.Context, boothID int64) (db.Booth, error) {
	b, err := r.queries.GetBoothByID(ctx, boothID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return db.Booth{}, connecterr.ErrNotFound
		}
		return db.Booth{}, fmt.Errorf("match repository: get booth: %w", err)
	}
	return b, nil
}

func (r *Repository) GetTicketByID(ctx context.Context, ticketID int64) (db.Ticket, error) {
	t, err := r.queries.GetTicketByID(ctx, ticketID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return db.Ticket{}, connecterr.ErrNotFound
		}
		return db.Ticket{}, fmt.Errorf("match repository: get ticket: %w", err)
	}
	return t, nil
}

func (r *Repository) ListWaitingPublicTickets(ctx context.Context, boothID int64) ([]db.ListWaitingPublicTicketsByBoothRow, error) {
	rows, err := r.queries.ListWaitingPublicTicketsByBooth(ctx, boothID)
	if err != nil {
		return nil, fmt.Errorf("match repository: list waiting public tickets: %w", err)
	}
	return rows, nil
}

func (r *Repository) ListWaitingPrivateTickets(ctx context.Context, boothID int64) ([]db.ListWaitingPrivateTicketsByBoothRow, error) {
	rows, err := r.queries.ListWaitingPrivateTicketsByBooth(ctx, boothID)
	if err != nil {
		return nil, fmt.Errorf("match repository: list waiting private tickets: %w", err)
	}
	return rows, nil
}

// CreateSessionAndAssign creates a waiting match session and assigns the given tickets to it.
// Does NOT call the tickets. Used for private ticket creation.
func (r *Repository) CreateSessionAndAssign(ctx context.Context, boothID int64, mode string, participantCount int32, ticketIDs []int64) (db.MatchSession, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return db.MatchSession{}, fmt.Errorf("match repository: begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	qtx := r.queries.WithTx(tx)

	session, err := qtx.CreateMatchSession(ctx, db.CreateMatchSessionParams{
		BoothID:          boothID,
		Mode:             mode,
		ParticipantCount: participantCount,
	})
	if err != nil {
		return db.MatchSession{}, fmt.Errorf("match repository: create session: %w", err)
	}

	sid := session.ID
	if err := qtx.AssignTicketsToMatchSession(ctx, db.AssignTicketsToMatchSessionParams{
		Column1:        ticketIDs,
		MatchSessionID: &sid,
	}); err != nil {
		return db.MatchSession{}, fmt.Errorf("match repository: assign tickets: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return db.MatchSession{}, fmt.Errorf("match repository: commit: %w", err)
	}
	return session, nil
}

// CreateSessionCallAndStart creates a session, assigns tickets, calls them,
// and marks the session in_progress — all in one transaction.
// Used for public auto-match and force-start.
func (r *Repository) CreateSessionCallAndStart(ctx context.Context, boothID int64, mode string, participantCount int32, ticketIDs []int64) (db.MatchSession, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return db.MatchSession{}, fmt.Errorf("match repository: begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	qtx := r.queries.WithTx(tx)

	session, err := qtx.CreateMatchSession(ctx, db.CreateMatchSessionParams{
		BoothID:          boothID,
		Mode:             mode,
		ParticipantCount: participantCount,
	})
	if err != nil {
		return db.MatchSession{}, fmt.Errorf("match repository: create session: %w", err)
	}

	sid := session.ID
	if err := qtx.AssignTicketsToMatchSession(ctx, db.AssignTicketsToMatchSessionParams{
		Column1:        ticketIDs,
		MatchSessionID: &sid,
	}); err != nil {
		return db.MatchSession{}, fmt.Errorf("match repository: assign tickets: %w", err)
	}

	if _, err := qtx.BulkCallMatchTickets(ctx, ticketIDs); err != nil {
		return db.MatchSession{}, fmt.Errorf("match repository: bulk call tickets: %w", err)
	}

	if err := qtx.UpdateMatchSessionStatus(ctx, db.UpdateMatchSessionStatusParams{
		ID:     session.ID,
		Status: "in_progress",
	}); err != nil {
		return db.MatchSession{}, fmt.Errorf("match repository: set in_progress: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return db.MatchSession{}, fmt.Errorf("match repository: commit: %w", err)
	}
	return session, nil
}

// CallSessionTickets transitions all waiting tickets in a session to called
// and sets the session to in_progress.
func (r *Repository) CallSessionTickets(ctx context.Context, sessionID, boothID int64) error {
	tickets, err := r.queries.GetTicketsByMatchSession(ctx, &sessionID)
	if err != nil {
		return fmt.Errorf("match repository: get session tickets: %w", err)
	}
	if len(tickets) == 0 {
		return connecterr.ErrNotFound
	}
	for _, t := range tickets {
		if t.BoothID != boothID {
			return connecterr.ErrForbidden
		}
	}

	ids := make([]int64, len(tickets))
	for i, t := range tickets {
		ids[i] = t.ID
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("match repository: begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	qtx := r.queries.WithTx(tx)

	if _, err := qtx.BulkCallMatchTickets(ctx, ids); err != nil {
		return fmt.Errorf("match repository: bulk call: %w", err)
	}

	if err := qtx.UpdateMatchSessionStatus(ctx, db.UpdateMatchSessionStatusParams{
		ID:     sessionID,
		Status: "in_progress",
	}); err != nil {
		return fmt.Errorf("match repository: set in_progress: %w", err)
	}

	return tx.Commit(ctx)
}

// CompleteSession admits all non-cancelled tickets in the session and marks it completed.
func (r *Repository) CompleteSession(ctx context.Context, sessionID, boothID int64) error {
	session, err := r.queries.GetMatchSessionByID(ctx, sessionID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return connecterr.ErrNotFound
		}
		return fmt.Errorf("match repository: get session: %w", err)
	}
	if session.BoothID != boothID {
		return connecterr.ErrForbidden
	}

	tickets, err := r.queries.GetTicketsByMatchSession(ctx, &sessionID)
	if err != nil {
		return fmt.Errorf("match repository: get session tickets: %w", err)
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("match repository: begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	qtx := r.queries.WithTx(tx)

	for _, t := range tickets {
		if err := qtx.UpdateTicketStatus(ctx, db.UpdateTicketStatusParams{
			ID:     t.ID,
			Status: "admitted",
		}); err != nil {
			return fmt.Errorf("match repository: admit ticket %d: %w", t.ID, err)
		}
	}

	if err := qtx.UpdateMatchSessionStatus(ctx, db.UpdateMatchSessionStatusParams{
		ID:     sessionID,
		Status: "completed",
	}); err != nil {
		return fmt.Errorf("match repository: complete session: %w", err)
	}

	return tx.Commit(ctx)
}

func (r *Repository) GetMatchSessionByID(ctx context.Context, sessionID int64) (db.MatchSession, error) {
	s, err := r.queries.GetMatchSessionByID(ctx, sessionID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return db.MatchSession{}, connecterr.ErrNotFound
		}
		return db.MatchSession{}, fmt.Errorf("match repository: get session: %w", err)
	}
	return s, nil
}

func (r *Repository) ListMatchSessionsByBooth(ctx context.Context, boothID int64, statuses []string) ([]db.MatchSession, error) {
	sessions, err := r.queries.ListMatchSessionsByBooth(ctx, db.ListMatchSessionsByBoothParams{
		BoothID: boothID,
		Column2: statuses,
	})
	if err != nil {
		return nil, fmt.Errorf("match repository: list sessions: %w", err)
	}
	return sessions, nil
}
