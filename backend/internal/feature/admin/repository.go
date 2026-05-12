package admin

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
	"reception-system/internal/db"
	"reception-system/internal/pkg/connecterr"
)

// ErrBoothHasActiveTickets is returned when deleting a booth that still has active tickets.
var ErrBoothHasActiveTickets = errors.New("booth has active tickets")

type Repository struct {
	pool    *pgxpool.Pool
	queries *db.Queries
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool, queries: db.New(pool)}
}

// BoothStats is the per-booth summary returned by GetDashboard.
type BoothStats struct {
	BoothID      int64
	BoothName    string
	WaitingCount int32
	PendingCount int32
	// AdmittedToday counts admissions created today (midnight UTC onwards).
	AdmittedToday int32
}

// AuthenticateGlobalAdmin verifies name and password against global_admins.
func (r *Repository) AuthenticateGlobalAdmin(ctx context.Context, name, password string) (db.GlobalAdmin, error) {
	row, err := r.queries.GetGlobalAdminByName(ctx, name)
	if errors.Is(err, pgx.ErrNoRows) {
		return db.GlobalAdmin{}, connecterr.ErrUnauthorized
	}
	if err != nil {
		return db.GlobalAdmin{}, fmt.Errorf("admin repository: get global admin: %w", err)
	}
	if err := bcrypt.CompareHashAndPassword([]byte(row.PasswordHash), []byte(password)); err != nil {
		return db.GlobalAdmin{}, connecterr.ErrUnauthorized
	}
	return row, nil
}

// GetDashboard returns per-booth stats for all booths.
func (r *Repository) GetDashboard(ctx context.Context) ([]BoothStats, error) {
	booths, err := r.queries.ListBooths(ctx)
	if err != nil {
		return nil, fmt.Errorf("admin repository: list booths: %w", err)
	}

	// Midnight UTC today for the admitted-today count.
	now := time.Now().UTC()
	midnight := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	tomorrow := midnight.Add(24 * time.Hour)
	afterMidnight := pgtype.Timestamptz{Time: midnight, Valid: true}
	beforeTomorrow := pgtype.Timestamptz{Time: tomorrow, Valid: true}

	stats := make([]BoothStats, len(booths))
	for i, b := range booths {
		counts, err := r.queries.GetBoothStatusCounts(ctx, b.ID)
		if err != nil {
			return nil, fmt.Errorf("admin repository: booth status counts for %d: %w", b.ID, err)
		}
		admissions, err := r.queries.ListAdmissionsByBooth(ctx, db.ListAdmissionsByBoothParams{
			BoothID:      b.ID,
			AdmittedAt:   afterMidnight,
			AdmittedAt_2: beforeTomorrow,
		})
		if err != nil {
			return nil, fmt.Errorf("admin repository: admissions for booth %d: %w", b.ID, err)
		}
		stats[i] = BoothStats{
			BoothID:       b.ID,
			BoothName:     b.Name,
			WaitingCount:  counts.WaitingCount,
			PendingCount:  counts.PendingCount,
			AdmittedToday: int32(len(admissions)),
		}
	}
	return stats, nil
}

// UpdateBooth updates mutable booth settings.
func (r *Repository) UpdateBooth(ctx context.Context, p db.UpdateBoothParams) error {
	if err := r.queries.UpdateBooth(ctx, p); err != nil {
		return fmt.Errorf("admin repository: update booth: %w", err)
	}
	return nil
}

// ListAllBooths returns all booths including archived ones.
func (r *Repository) ListAllBooths(ctx context.Context) ([]db.Booth, error) {
	booths, err := r.queries.ListAllBooths(ctx)
	if err != nil {
		return nil, fmt.Errorf("admin repository: list all booths: %w", err)
	}
	return booths, nil
}

// CreateBooth inserts a new booth record.
func (r *Repository) CreateBooth(ctx context.Context, p db.CreateBoothParams) (db.Booth, error) {
	booth, err := r.queries.CreateBooth(ctx, p)
	if err != nil {
		return db.Booth{}, fmt.Errorf("admin repository: create booth: %w", err)
	}
	return booth, nil
}

// ArchiveBooth soft-deletes a booth.
func (r *Repository) ArchiveBooth(ctx context.Context, boothID int64) error {
	if err := r.queries.ArchiveBooth(ctx, boothID); err != nil {
		return fmt.Errorf("admin repository: archive booth: %w", err)
	}
	return nil
}

// UnarchiveBooth restores an archived booth.
func (r *Repository) UnarchiveBooth(ctx context.Context, boothID int64) error {
	if err := r.queries.UnarchiveBooth(ctx, boothID); err != nil {
		return fmt.Errorf("admin repository: unarchive booth: %w", err)
	}
	return nil
}

// DeleteBooth permanently deletes a booth; fails if active tickets exist.
func (r *Repository) DeleteBooth(ctx context.Context, boothID int64) error {
	count, err := r.queries.GetBoothActiveTicketCount(ctx, boothID)
	if err != nil {
		return fmt.Errorf("admin repository: get active ticket count: %w", err)
	}
	if count > 0 {
		return ErrBoothHasActiveTickets
	}
	if err := r.queries.DeleteBooth(ctx, boothID); err != nil {
		return fmt.Errorf("admin repository: delete booth: %w", err)
	}
	return nil
}

// GetRiskExplanation returns the current singleton risk explanation. Returns empty body if none exists.
func (r *Repository) GetRiskExplanation(ctx context.Context) (db.RiskExplanation, error) {
	row, err := r.queries.GetRiskExplanation(ctx)
	if errors.Is(err, pgx.ErrNoRows) {
		return db.RiskExplanation{}, nil
	}
	if err != nil {
		return db.RiskExplanation{}, fmt.Errorf("admin repository: get risk explanation: %w", err)
	}
	return row, nil
}

// SetRiskExplanation updates the singleton row, inserting it if it doesn't exist yet.
func (r *Repository) SetRiskExplanation(ctx context.Context, body string) (db.RiskExplanation, error) {
	existing, err := r.queries.GetRiskExplanation(ctx)
	if errors.Is(err, pgx.ErrNoRows) {
		row, err := r.queries.InsertRiskExplanation(ctx, body)
		if err != nil {
			return db.RiskExplanation{}, fmt.Errorf("admin repository: insert risk explanation: %w", err)
		}
		return row, nil
	}
	if err != nil {
		return db.RiskExplanation{}, fmt.Errorf("admin repository: get risk explanation: %w", err)
	}
	row, err := r.queries.UpdateRiskExplanationBody(ctx, db.UpdateRiskExplanationBodyParams{
		ID:   existing.ID,
		Body: body,
	})
	if err != nil {
		return db.RiskExplanation{}, fmt.Errorf("admin repository: update risk explanation: %w", err)
	}
	return row, nil
}

// UpdateBoothPassword sets a new bcrypt-hashed staff password for the booth.
func (r *Repository) UpdateBoothPassword(ctx context.Context, boothID int64, newPassword string) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("admin repository: hash password: %w", err)
	}
	if err := r.queries.UpdateBoothPassword(ctx, db.UpdateBoothPasswordParams{
		ID:               boothID,
		StaffPasswordHash: string(hash),
	}); err != nil {
		return fmt.Errorf("admin repository: update booth password: %w", err)
	}
	return nil
}
