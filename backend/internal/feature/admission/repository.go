package admission

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"reception-system/internal/db"
	"reception-system/internal/pkg/connecterr"
)

// Outcome describes the result of an admit attempt.
type Outcome int

const (
	OutcomeAdmitted                  Outcome = iota + 1
	OutcomeRestoredToPriorityCall
	OutcomeWaitingConfirmationNeeded
	OutcomeAlreadyAdmitted
	OutcomeNotFound
)

// AdmitResult is returned by AdmitByQR and AdmitManually.
type AdmitResult struct {
	Outcome  Outcome
	TicketID int64
}

type Repository struct {
	pool    *pgxpool.Pool
	queries *db.Queries
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool, queries: db.New(pool)}
}

// AdmitByQR looks up a visitor by reception_number at the given booth and
// applies the 5-outcome logic described in admin.md §6-2.
func (r *Repository) AdmitByQR(ctx context.Context, boothID int64, receptionNumber string) (AdmitResult, error) {
	return r.admit(ctx, boothID, receptionNumber, false)
}

// AdmitManually is the same as AdmitByQR but force=true admits a waiting ticket directly.
func (r *Repository) AdmitManually(ctx context.Context, boothID int64, receptionNumber string, force bool) (AdmitResult, error) {
	return r.admit(ctx, boothID, receptionNumber, force)
}

// CancelTicketByStaff cancels a ticket if it belongs to boothID.
// Returns ErrNotFound if the ticket doesn't exist or belongs to a different booth.
func (r *Repository) CancelTicketByStaff(ctx context.Context, ticketID, boothID int64) error {
	err := r.queries.CancelTicketByStaff(ctx, db.CancelTicketByStaffParams{
		ID:      ticketID,
		BoothID: boothID,
	})
	if err != nil {
		return fmt.Errorf("admission repository: cancel ticket by staff: %w", err)
	}

	// CancelTicketByStaff is :exec — verify the row was actually updated.
	var status string
	err = r.pool.QueryRow(ctx, `SELECT status FROM tickets WHERE id = $1`, ticketID).Scan(&status)
	if errors.Is(err, pgx.ErrNoRows) {
		return connecterr.ErrNotFound
	}
	if err != nil {
		return fmt.Errorf("admission repository: verify cancel: %w", err)
	}
	if status != "cancelled" {
		// The UPDATE matched no row (wrong booth_id or already admitted).
		return connecterr.ErrNotFound
	}
	return nil
}

// ListAdmissions returns all admission records for a booth today.
func (r *Repository) ListAdmissions(ctx context.Context, boothID int64) ([]db.ListAdmissionsByBoothRow, error) {
	epoch := pgtype.Timestamptz{Time: time.Unix(0, 0), Valid: true}
	far := pgtype.Timestamptz{Time: time.Date(9999, 12, 31, 23, 59, 59, 0, time.UTC), Valid: true}

	rows, err := r.queries.ListAdmissionsByBooth(ctx, db.ListAdmissionsByBoothParams{
		BoothID:      boothID,
		AdmittedAt:   epoch,
		AdmittedAt_2: far,
	})
	if err != nil {
		return nil, fmt.Errorf("admission repository: list: %w", err)
	}
	return rows, nil
}

// admit implements the shared 5-outcome logic.
func (r *Repository) admit(ctx context.Context, boothID int64, receptionNumber string, force bool) (AdmitResult, error) {
	// Look up the most recent non-cancelled ticket for this visitor at this booth.
	ticket, err := r.queries.GetActiveTicketByBoothAndReceptionNumber(ctx,
		db.GetActiveTicketByBoothAndReceptionNumberParams{
			BoothID:         boothID,
			ReceptionNumber: receptionNumber,
		},
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return AdmitResult{Outcome: OutcomeNotFound}, nil
	}
	if err != nil {
		return AdmitResult{}, fmt.Errorf("admission repository: look up ticket: %w", err)
	}

	switch ticket.Status {
	case "admitted":
		return AdmitResult{Outcome: OutcomeAlreadyAdmitted, TicketID: ticket.ID}, nil

	case "waiting":
		if !force {
			return AdmitResult{Outcome: OutcomeWaitingConfirmationNeeded, TicketID: ticket.ID}, nil
		}
		// force=true: admit directly from waiting.
		return r.admitTicket(ctx, ticket.ID, boothID, true)

	case "pending":
		// Restore to called with is_priority_call=true. No admission record yet (R-013).
		restored, err := r.queries.ReturnFromPending(ctx, db.ReturnFromPendingParams{
			ID:      ticket.ID,
			BoothID: boothID,
		})
		if errors.Is(err, pgx.ErrNoRows) {
			// Concurrent update beat us — treat as already processed.
			return AdmitResult{Outcome: OutcomeAlreadyAdmitted, TicketID: ticket.ID}, nil
		}
		if err != nil {
			return AdmitResult{}, fmt.Errorf("admission repository: return from pending: %w", err)
		}
		return AdmitResult{Outcome: OutcomeRestoredToPriorityCall, TicketID: restored.ID}, nil
	}

	// status is "called": transition to admitted.
	return r.admitTicket(ctx, ticket.ID, boothID, false)
}

// admitTicket transitions ticket to admitted and creates the admission record atomically.
// fromWaiting=true uses ForceAdmitTicket (accepts waiting/called/pending);
// fromWaiting=false uses AdmitTicketByStaff (accepts called/pending only).
func (r *Repository) admitTicket(ctx context.Context, ticketID, boothID int64, fromWaiting bool) (AdmitResult, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return AdmitResult{}, fmt.Errorf("admission repository: begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	q := r.queries.WithTx(tx)

	var admitted db.Ticket
	if fromWaiting {
		admitted, err = q.ForceAdmitTicket(ctx, db.ForceAdmitTicketParams{
			ID:      ticketID,
			BoothID: boothID,
		})
	} else {
		admitted, err = q.AdmitTicketByStaff(ctx, db.AdmitTicketByStaffParams{
			ID:      ticketID,
			BoothID: boothID,
		})
	}
	if errors.Is(err, pgx.ErrNoRows) {
		// Ticket already processed by a concurrent request.
		return AdmitResult{Outcome: OutcomeAlreadyAdmitted, TicketID: ticketID}, nil
	}
	if err != nil {
		return AdmitResult{}, fmt.Errorf("admission repository: admit ticket: %w", err)
	}

	_, err = q.CreateAdmission(ctx, db.CreateAdmissionParams{
		TicketID:  admitted.ID,
		VisitorID: admitted.VisitorID,
		BoothID:   boothID,
		Method:    "qr_scan",
	})
	if err != nil {
		return AdmitResult{}, fmt.Errorf("admission repository: create admission: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return AdmitResult{}, fmt.Errorf("admission repository: commit: %w", err)
	}

	return AdmitResult{Outcome: OutcomeAdmitted, TicketID: admitted.ID}, nil
}
