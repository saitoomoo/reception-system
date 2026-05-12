package admin

import (
	"context"
	"errors"
	"fmt"
	"net/netip"
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
		ID:                boothID,
		StaffPasswordHash: string(hash),
	}); err != nil {
		return fmt.Errorf("admin repository: update booth password: %w", err)
	}
	return nil
}

// ExportData bundles all export rows into ExportResult for CSV generation.
type ExportResult struct {
	Visitors      []db.ListAllVisitorsForExportRow
	Tickets       []db.ListAllTicketsForExportRow
	Admissions    []db.ListAllAdmissionsForExportRow
	BoothSummary  []db.GetBoothSummaryRow
	HourlyStats   []db.GetHourlyStatsRow
	MatchSessions []db.ListAllMatchSessionsForExportRow
}

func (r *Repository) ListVisitorsForExport(ctx context.Context) ([]db.ListAllVisitorsForExportRow, error) {
	rows, err := r.queries.ListAllVisitorsForExport(ctx)
	if err != nil {
		return nil, fmt.Errorf("admin repository: list visitors for export: %w", err)
	}
	return rows, nil
}

func (r *Repository) ListTicketsForExport(ctx context.Context) ([]db.ListAllTicketsForExportRow, error) {
	rows, err := r.queries.ListAllTicketsForExport(ctx)
	if err != nil {
		return nil, fmt.Errorf("admin repository: list tickets for export: %w", err)
	}
	return rows, nil
}

func (r *Repository) ListAdmissionsForExport(ctx context.Context) ([]db.ListAllAdmissionsForExportRow, error) {
	rows, err := r.queries.ListAllAdmissionsForExport(ctx)
	if err != nil {
		return nil, fmt.Errorf("admin repository: list admissions for export: %w", err)
	}
	return rows, nil
}

func (r *Repository) GetBoothSummary(ctx context.Context) ([]db.GetBoothSummaryRow, error) {
	rows, err := r.queries.GetBoothSummary(ctx)
	if err != nil {
		return nil, fmt.Errorf("admin repository: get booth summary: %w", err)
	}
	return rows, nil
}

func (r *Repository) GetHourlyStats(ctx context.Context) ([]db.GetHourlyStatsRow, error) {
	rows, err := r.queries.GetHourlyStats(ctx)
	if err != nil {
		return nil, fmt.Errorf("admin repository: get hourly stats: %w", err)
	}
	return rows, nil
}

func (r *Repository) ListMatchSessionsForExport(ctx context.Context) ([]db.ListAllMatchSessionsForExportRow, error) {
	rows, err := r.queries.ListAllMatchSessionsForExport(ctx)
	if err != nil {
		return nil, fmt.Errorf("admin repository: list match sessions for export: %w", err)
	}
	return rows, nil
}

// ResetEventData deletes all event data in FK-safe order within a single transaction.
// Preserved: booths, global_admins, notification_templates, risk_explanations.
func (r *Repository) ResetEventData(ctx context.Context) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("admin repository: begin reset transaction: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	q := r.queries.WithTx(tx)

	steps := []struct {
		name string
		fn   func() error
	}{
		{"delete parental consents", func() error { return q.DeleteAllParentalConsents(ctx) }},
		{"delete participants", func() error { return q.DeleteAllParticipants(ctx) }},
		{"delete ticket groups", func() error { return q.DeleteAllTicketGroups(ctx) }},
		{"delete admissions", func() error { return q.DeleteAllAdmissions(ctx) }},
		{"delete notification logs", func() error { return q.DeleteAllNotificationLogs(ctx) }},
		{"delete tickets", func() error { return q.DeleteAllTickets(ctx) }},
		{"delete match sessions", func() error { return q.DeleteAllMatchSessions(ctx) }},
		{"delete push subscriptions", func() error { return q.DeleteAllPushSubscriptions(ctx) }},
		{"delete visitors", func() error { return q.DeleteAllVisitors(ctx) }},
	}

	for _, step := range steps {
		if err := step.fn(); err != nil {
			return fmt.Errorf("admin repository: reset: %s: %w", step.name, err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("admin repository: commit reset: %w", err)
	}
	return nil
}

// ManualTicketInput holds the validated data for CreateTicketManual.
type ManualTicketInput struct {
	VisitorID           int64
	BoothID             int64
	Participants        []ManualParticipant
	GuardianName        string
	PaperFormID         string
	ConsentTextSnapshot string
	StaffIPAddress      netip.Addr // IP of the staff tablet; used as proxy for the digital consent record
	StaffUserAgent      string
}

// ManualParticipant represents one participant in a manual ticket issuance.
type ManualParticipant struct {
	Age  int32
	Name string
}

// ManualTicketResult holds the created ticket details.
type ManualTicketResult struct {
	TicketID        int64
	SequenceInBooth int32
}

// GetBoothByID returns the raw booth record for the given ID.
func (r *Repository) GetBoothByID(ctx context.Context, boothID int64) (db.Booth, error) {
	booth, err := r.queries.GetBoothByID(ctx, boothID)
	if errors.Is(err, pgx.ErrNoRows) {
		return db.Booth{}, connecterr.ErrNotFound
	}
	if err != nil {
		return db.Booth{}, fmt.Errorf("admin repository: get booth: %w", err)
	}
	return booth, nil
}

// GetVisitorByReceptionNumber looks up a visitor for manual ticket issuance.
func (r *Repository) GetVisitorByReceptionNumberForManual(ctx context.Context, receptionNumber string) (db.GetVisitorByReceptionNumberForManualRow, error) {
	row, err := r.queries.GetVisitorByReceptionNumberForManual(ctx, receptionNumber)
	if errors.Is(err, pgx.ErrNoRows) {
		return db.GetVisitorByReceptionNumberForManualRow{}, connecterr.ErrNotFound
	}
	if err != nil {
		return db.GetVisitorByReceptionNumberForManualRow{}, fmt.Errorf("admin repository: get visitor: %w", err)
	}
	return row, nil
}

// HasActiveTicket returns true if the visitor already has a waiting/called/pending ticket at the booth.
func (r *Repository) HasActiveTicket(ctx context.Context, visitorID, boothID int64) (bool, error) {
	_, err := r.queries.GetActiveTicketForManualCheck(ctx, db.GetActiveTicketForManualCheckParams{
		VisitorID: visitorID,
		BoothID:   boothID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("admin repository: check active ticket: %w", err)
	}
	return true, nil
}

// IsInCooldown returns true if the visitor is within the booth's cooldown window.
func (r *Repository) IsInCooldownForManual(ctx context.Context, visitorID, boothID int64, cooldownMinutes int32) (bool, error) {
	if cooldownMinutes == 0 {
		return false, nil
	}
	admittedAt, err := r.queries.GetLastAdmittedForCooldownCheck(ctx, db.GetLastAdmittedForCooldownCheckParams{
		VisitorID: visitorID,
		BoothID:   boothID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("admin repository: cooldown check: %w", err)
	}
	if !admittedAt.Valid {
		return false, nil
	}
	expiry := admittedAt.Time.Add(time.Duration(cooldownMinutes) * time.Minute)
	return time.Now().Before(expiry), nil
}

// CreateManualTicket issues a ticket via the staff special flow (paper_and_digital consent).
// Runs in a single transaction.
func (r *Repository) CreateManualTicket(ctx context.Context, input ManualTicketInput) (ManualTicketResult, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return ManualTicketResult{}, fmt.Errorf("admin repository: begin manual ticket tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	q := r.queries.WithTx(tx)

	// Sequence number.
	seq, err := q.GetNextSequenceInBooth(ctx, input.BoothID)
	if err != nil {
		return ManualTicketResult{}, fmt.Errorf("admin repository: next sequence: %w", err)
	}

	// Create a placeholder ticket_group_id=0 first (FK requires it to exist).
	// We use a two-step: create ticket with dummy group ID, create group with ticket ID, then update.
	// To satisfy the NOT NULL FK, we create the ticket_group first with ticket_id=0 then fix it.
	// Actually, the cleanest approach: create ticket group referencing ticket, but ticket doesn't exist yet.
	// The schema has ticket_groups.ticket_id → tickets.id. So create ticket first with a placeholder group ID.
	// But ticket.ticket_group_id → ticket_groups.id is also a FK.
	// Use DEFERRABLE constraints or create both in right order without FKs.
	// Looking at CreateTicket in ticket repo for the pattern...
	// ticket repo creates ticket first with group_id=0 (deferred FK), then ticket_group, then updates ticket.
	// Let's follow the same pattern.
	ticketRow, err := q.CreateManualTicket(ctx, db.CreateManualTicketParams{
		VisitorID:       input.VisitorID,
		BoothID:         input.BoothID,
		TicketGroupID:   0, // will be updated
		SequenceInBooth: seq,
	})
	if err != nil {
		return ManualTicketResult{}, fmt.Errorf("admin repository: create ticket: %w", err)
	}

	groupID, err := q.CreateTicketGroupForManual(ctx, db.CreateTicketGroupForManualParams{
		TicketID:         ticketRow.ID,
		ParticipantCount: int32(len(input.Participants)),
	})
	if err != nil {
		return ManualTicketResult{}, fmt.Errorf("admin repository: create ticket group: %w", err)
	}

	if err := q.UpdateManualTicketGroupID(ctx, db.UpdateManualTicketGroupIDParams{
		ID:            ticketRow.ID,
		TicketGroupID: groupID,
	}); err != nil {
		return ManualTicketResult{}, fmt.Errorf("admin repository: update ticket group id: %w", err)
	}

	// Create participants and parental consents where required.
	for _, p := range input.Participants {
		name := p.Name
		participantID, err := q.CreateParticipantForManual(ctx, db.CreateParticipantForManualParams{
			TicketGroupID: groupID,
			Name:          &name,
			Age:           p.Age,
		})
		if err != nil {
			return ManualTicketResult{}, fmt.Errorf("admin repository: create participant: %w", err)
		}

		// Parental consent required for participants < 13.
		if p.Age < 13 {
			method := "paper_and_digital"
			if p.Age >= 10 {
				method = "digital_level25"
			}
			paperFormID := input.PaperFormID
			if err := q.CreateParentalConsentForManual(ctx, db.CreateParentalConsentForManualParams{
				ParticipantID:       participantID,
				ConsentMethod:       method,
				ConsentTextSnapshot: input.ConsentTextSnapshot,
				GuardianName:        input.GuardianName,
				IpAddress:           input.StaffIPAddress,
				UserAgent:           input.StaffUserAgent,
				PaperFormID:         &paperFormID,
			}); err != nil {
				return ManualTicketResult{}, fmt.Errorf("admin repository: create parental consent: %w", err)
			}
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return ManualTicketResult{}, fmt.Errorf("admin repository: commit manual ticket: %w", err)
	}

	return ManualTicketResult{
		TicketID:        ticketRow.ID,
		SequenceInBooth: seq,
	}, nil
}
