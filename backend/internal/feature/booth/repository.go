package booth

import (
	"context"
	"errors"
	"fmt"
	"math"
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
