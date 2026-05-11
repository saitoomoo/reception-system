package visitor

import (
	"context"
	"errors"
	"fmt"
	"strings"

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
	return &Repository{
		pool:    pool,
		queries: db.New(pool),
	}
}

type CreateResult struct {
	VisitorID       int64
	ReceptionNumber string
}

// Create registers a new visitor and assigns a reception number (R-001).
// Retries up to 3 times on unique constraint violation during reception number allocation.
func (r *Repository) Create(ctx context.Context, nickname, pin string) (CreateResult, error) {
	pinHash, err := bcrypt.GenerateFromPassword([]byte(pin), bcrypt.DefaultCost)
	if err != nil {
		return CreateResult{}, fmt.Errorf("visitor repository: hash pin: %w", err)
	}

	for range 3 {
		next, err := r.nextReceptionNumber(ctx)
		if err != nil {
			return CreateResult{}, fmt.Errorf("visitor repository: next reception number: %w", err)
		}

		v, err := r.queries.CreateVisitor(ctx, db.CreateVisitorParams{
			ReceptionNumber: next,
			Nickname:        nickname,
			PinHash:         string(pinHash),
		})
		if err != nil {
			// Retry on reception_number unique constraint violation.
			if isUniqueViolation(err) {
				continue
			}
			return CreateResult{}, fmt.Errorf("visitor repository: create: %w", err)
		}
		return CreateResult{VisitorID: v.ID, ReceptionNumber: v.ReceptionNumber}, nil
	}
	return CreateResult{}, fmt.Errorf("visitor repository: create: reception number conflict after retries")
}

// Authenticate validates reception_number + PIN and returns the visitor ID.
func (r *Repository) Authenticate(ctx context.Context, receptionNumber, pin string) (int64, error) {
	v, err := r.queries.GetVisitorByReceptionNumber(ctx, receptionNumber)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, connecterr.ErrUnauthorized
		}
		return 0, fmt.Errorf("visitor repository: get by reception number: %w", err)
	}

	if err := bcrypt.CompareHashAndPassword([]byte(v.PinHash), []byte(pin)); err != nil {
		return 0, connecterr.ErrUnauthorized
	}

	if err := r.queries.UpdateLastSeenAt(ctx, v.ID); err != nil {
		return 0, fmt.Errorf("visitor repository: update last seen: %w", err)
	}

	return v.ID, nil
}

// GetByID retrieves a visitor by ID.
func (r *Repository) GetByID(ctx context.Context, id int64) (db.Visitor, error) {
	v, err := r.queries.GetVisitorByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return db.Visitor{}, connecterr.ErrNotFound
		}
		return db.Visitor{}, fmt.Errorf("visitor repository: get by id: %w", err)
	}
	return v, nil
}

// UpsertPushSubscription saves or updates the visitor's Web Push subscription.
func (r *Repository) UpsertPushSubscription(ctx context.Context, visitorID int64, endpoint, p256dh, auth string) error {
	err := r.queries.UpsertPushSubscription(ctx, db.UpsertPushSubscriptionParams{
		VisitorID: visitorID,
		Endpoint:  endpoint,
		P256dhKey: p256dh,
		AuthKey:   auth,
	})
	if err != nil {
		return fmt.Errorf("visitor repository: upsert push subscription: %w", err)
	}
	return nil
}

// nextReceptionNumber fetches the current maximum reception number from the DB
// and delegates computation to incrementReceptionNumber.
func (r *Repository) nextReceptionNumber(ctx context.Context) (string, error) {
	last, err := r.queries.GetLastReceptionNumber(ctx)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			last = ""
		} else {
			return "", fmt.Errorf("get last reception number: %w", err)
		}
	}
	return incrementReceptionNumber(last)
}

func isUniqueViolation(err error) bool {
	msg := err.Error()
	return strings.Contains(msg, "unique") || strings.Contains(msg, "23505")
}
