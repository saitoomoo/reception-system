package booth

import (
	"context"
	"errors"
	"fmt"
	"math"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
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

type BoothWithCount struct {
	Booth                db.Booth
	WaitingCount         int32
	EstimatedWaitMinutes int32
}

func (r *Repository) ListBooths(ctx context.Context) ([]BoothWithCount, error) {
	booths, err := r.queries.ListBooths(ctx)
	if err != nil {
		return nil, fmt.Errorf("booth repository: list: %w", err)
	}

	result := make([]BoothWithCount, len(booths))
	for i, b := range booths {
		count, err := r.queries.GetBoothWaitingCount(ctx, b.ID)
		if err != nil {
			return nil, fmt.Errorf("booth repository: waiting count for booth %d: %w", b.ID, err)
		}
		result[i] = BoothWithCount{
			Booth:                b,
			WaitingCount:         count,
			EstimatedWaitMinutes: estimatedWaitMinutes(b, count),
		}
	}
	return result, nil
}

func (r *Repository) GetBoothByID(ctx context.Context, boothID int64) (BoothWithCount, error) {
	b, err := r.queries.GetBoothByID(ctx, boothID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return BoothWithCount{}, connecterr.ErrNotFound
		}
		return BoothWithCount{}, fmt.Errorf("booth repository: get by id: %w", err)
	}

	count, err := r.queries.GetBoothWaitingCount(ctx, boothID)
	if err != nil {
		return BoothWithCount{}, fmt.Errorf("booth repository: waiting count: %w", err)
	}

	return BoothWithCount{
		Booth:                b,
		WaitingCount:         count,
		EstimatedWaitMinutes: estimatedWaitMinutes(b, count),
	}, nil
}

// BoothStatus is the real-time queue snapshot returned by GetBoothStatus.
type BoothStatus struct {
	Booth                db.Booth
	WaitingCount         int32
	PendingCount         int32
	CalledSequence       int32
	EstimatedWaitMinutes int32
	IsOpen               bool
}

func (r *Repository) GetBoothStatus(ctx context.Context, boothID int64) (BoothStatus, error) {
	b, err := r.queries.GetBoothByID(ctx, boothID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return BoothStatus{}, connecterr.ErrNotFound
		}
		return BoothStatus{}, fmt.Errorf("booth repository: get booth status: %w", err)
	}

	counts, err := r.queries.GetBoothStatusCounts(ctx, boothID)
	if err != nil {
		return BoothStatus{}, fmt.Errorf("booth repository: get status counts: %w", err)
	}

	now := time.Now()
	isOpen := b.OpenAt.Valid && b.CloseAt.Valid &&
		!now.Before(b.OpenAt.Time) && now.Before(b.CloseAt.Time)

	return BoothStatus{
		Booth:                b,
		WaitingCount:         counts.WaitingCount,
		PendingCount:         counts.PendingCount,
		CalledSequence:       counts.CalledSequence,
		EstimatedWaitMinutes: estimatedWaitMinutes(b, counts.WaitingCount),
		IsOpen:               isOpen,
	}, nil
}

// AuthenticateStaff verifies the staff password for a booth.
// Returns the booth row on success so the caller can build a session.
func (r *Repository) AuthenticateStaff(ctx context.Context, boothID int64, password string) (db.Booth, error) {
	b, err := r.queries.AuthenticateStaff(ctx, boothID)
	if errors.Is(err, pgx.ErrNoRows) {
		return db.Booth{}, connecterr.ErrNotFound
	}
	if err != nil {
		return db.Booth{}, fmt.Errorf("booth repository: authenticate staff: %w", err)
	}
	if err := bcrypt.CompareHashAndPassword([]byte(b.StaffPasswordHash), []byte(password)); err != nil {
		return db.Booth{}, connecterr.ErrUnauthorized
	}
	return b, nil
}

// CallNextTickets transitions up to count waiting tickets (by sequence) to called.
// Returns the IDs of the tickets that were updated.
func (r *Repository) CallNextTickets(ctx context.Context, boothID int64, count int32) ([]int64, error) {
	if count <= 0 {
		return nil, nil
	}
	tickets, err := r.queries.CallNextTickets(ctx, db.CallNextTicketsParams{
		BoothID: boothID,
		Limit:   count,
	})
	if err != nil {
		return nil, fmt.Errorf("booth repository: call next tickets: %w", err)
	}
	ids := make([]int64, len(tickets))
	for i, t := range tickets {
		ids[i] = t.ID
	}
	return ids, nil
}

// CallTicket transitions a single waiting ticket to called (booth_id guard included in SQL).
func (r *Repository) CallTicket(ctx context.Context, ticketID, boothID int64) error {
	err := r.queries.CallTicket(ctx, db.CallTicketParams{
		ID:      ticketID,
		BoothID: boothID,
	})
	if err != nil {
		return fmt.Errorf("booth repository: call ticket: %w", err)
	}
	// Verify that the row was actually updated (wrong booth_id or wrong status = no-op).
	var status string
	err = r.pool.QueryRow(ctx, `SELECT status FROM tickets WHERE id = $1`, ticketID).Scan(&status)
	if errors.Is(err, pgx.ErrNoRows) {
		return connecterr.ErrNotFound
	}
	if err != nil {
		return fmt.Errorf("booth repository: verify call ticket: %w", err)
	}
	if status != "called" {
		return connecterr.ErrNotFound
	}
	return nil
}

// ListTicketsForStaff returns all non-cancelled tickets for a booth with visitor and group info.
func (r *Repository) ListTicketsForStaff(ctx context.Context, boothID int64) ([]db.ListTicketsByBoothForStaffRow, error) {
	rows, err := r.queries.ListTicketsByBoothForStaff(ctx, boothID)
	if err != nil {
		return nil, fmt.Errorf("booth repository: list tickets for staff: %w", err)
	}
	return rows, nil
}

func estimatedWaitMinutes(b db.Booth, waitingCount int32) int32 {
	if waitingCount == 0 {
		return 0
	}
	switch b.ExperienceType {
	case "sequential", "individual":
		if b.EstimatedMinutesPerPerson != nil {
			return waitingCount * *b.EstimatedMinutesPerPerson
		}
	case "parallel":
		if b.EstimatedMinutesPerSession != nil && b.ConcurrentCapacity > 0 {
			sessions := int32(math.Ceil(float64(waitingCount) / float64(b.ConcurrentCapacity)))
			return sessions * *b.EstimatedMinutesPerSession
		}
	case "matchmaking":
		if b.EstimatedMinutesPerSession != nil && b.TargetPartySize != nil && *b.TargetPartySize > 0 {
			sessions := int32(math.Ceil(float64(waitingCount) / float64(*b.TargetPartySize)))
			return sessions * *b.EstimatedMinutesPerSession
		}
	}
	return 0
}
