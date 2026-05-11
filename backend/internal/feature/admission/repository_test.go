//go:build integration

package admission

import (
	"context"
	"errors"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/pgx/v5"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
	"reception-system/internal/pkg/connecterr"
)

func setupPostgres(t *testing.T) *pgxpool.Pool {
	t.Helper()
	ctx := context.Background()

	container, err := postgres.Run(ctx,
		"postgres:16",
		postgres.WithDatabase("testdb"),
		postgres.WithUsername("testuser"),
		postgres.WithPassword("testpass"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").WithOccurrence(2),
		),
	)
	if err != nil {
		t.Fatalf("start postgres container: %v", err)
	}
	t.Cleanup(func() {
		if err := container.Terminate(ctx); err != nil {
			t.Logf("terminate container: %v", err)
		}
	})

	connStr, err := container.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatalf("get connection string: %v", err)
	}

	_, filename, _, _ := runtime.Caller(0)
	migrationsDir := filepath.Join(filepath.Dir(filename), "..", "..", "..", "migrations")
	m, err := migrate.New("file://"+migrationsDir, "pgx5://"+connStr[len("postgres://"):])
	if err != nil {
		t.Fatalf("create migrator: %v", err)
	}
	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		t.Fatalf("run migrations: %v", err)
	}

	pool, err := pgxpool.New(ctx, connStr)
	if err != nil {
		t.Fatalf("create pool: %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}

func seedVisitor(t *testing.T, pool *pgxpool.Pool, receptionNumber string) int64 {
	t.Helper()
	var id int64
	err := pool.QueryRow(context.Background(),
		`INSERT INTO visitors (reception_number, nickname, pin_hash) VALUES ($1, 'テスト', 'hash') RETURNING id`,
		receptionNumber,
	).Scan(&id)
	if err != nil {
		t.Fatalf("seed visitor: %v", err)
	}
	return id
}

func seedBooth(t *testing.T, pool *pgxpool.Pool) int64 {
	t.Helper()
	var id int64
	err := pool.QueryRow(context.Background(),
		`INSERT INTO booths (
			name, description, location, open_at, close_at,
			experience_type, staff_password_hash, cooldown_minutes
		) VALUES (
			'テストブース', '説明', '会場A',
			now() - interval '1 hour', now() + interval '8 hours',
			'sequential', '$2a$10$dummy', 0
		) RETURNING id`,
	).Scan(&id)
	if err != nil {
		t.Fatalf("seed booth: %v", err)
	}
	return id
}

// seedTicket inserts a ticket with the given status and returns its ID.
// Uses DEFERRABLE FK so ticket_group is committed atomically.
func seedTicket(t *testing.T, pool *pgxpool.Pool, visitorID, boothID int64, status string) int64 {
	t.Helper()
	ctx := context.Background()

	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin tx: %v", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var seq int64
	_ = tx.QueryRow(ctx,
		`SELECT COALESCE(MAX(sequence_in_booth), 0) + 1 FROM tickets WHERE booth_id = $1`, boothID,
	).Scan(&seq)

	var ticketID int64
	var calledAt, pendingAt, returnedAt, admittedAt interface{}
	switch status {
	case "called":
		calledAt = time.Now()
	case "pending":
		calledAt = time.Now().Add(-20 * time.Minute)
		pendingAt = time.Now()
	case "admitted":
		calledAt = time.Now().Add(-30 * time.Minute)
		admittedAt = time.Now()
	}
	err = tx.QueryRow(ctx,
		`INSERT INTO tickets
		 (visitor_id, booth_id, ticket_group_id, sequence_in_booth, status,
		  called_at, pending_at, returned_at, admitted_at)
		 VALUES ($1, $2, 0, $3, $4, $5, $6, $7, $8) RETURNING id`,
		visitorID, boothID, seq, status,
		calledAt, pendingAt, returnedAt, admittedAt,
	).Scan(&ticketID)
	if err != nil {
		t.Fatalf("seed ticket: %v", err)
	}

	var groupID int64
	err = tx.QueryRow(ctx,
		`INSERT INTO ticket_groups (ticket_id, participant_count) VALUES ($1, 1) RETURNING id`, ticketID,
	).Scan(&groupID)
	if err != nil {
		t.Fatalf("seed ticket_group: %v", err)
	}

	_, err = tx.Exec(ctx, `UPDATE tickets SET ticket_group_id = $2 WHERE id = $1`, ticketID, groupID)
	if err != nil {
		t.Fatalf("update ticket_group_id: %v", err)
	}

	if err := tx.Commit(ctx); err != nil {
		t.Fatalf("commit: %v", err)
	}
	return ticketID
}

// -------------------------------- AdmitByQR tests --------------------------------

// Outcome 1: called → admitted
func TestAdmitByQR_Called_Admitted(t *testing.T) {
	pool := setupPostgres(t)
	repo := NewRepository(pool)
	ctx := context.Background()

	boothID := seedBooth(t, pool)
	visitorID := seedVisitor(t, pool, "A-001")
	ticketID := seedTicket(t, pool, visitorID, boothID, "called")

	result, err := repo.AdmitByQR(ctx, boothID, "A-001")
	if err != nil {
		t.Fatalf("AdmitByQR() error = %v", err)
	}
	if result.Outcome != OutcomeAdmitted {
		t.Errorf("Outcome = %v, want %v", result.Outcome, OutcomeAdmitted)
	}
	if result.TicketID != ticketID {
		t.Errorf("TicketID = %d, want %d", result.TicketID, ticketID)
	}

	var status string
	_ = pool.QueryRow(ctx, `SELECT status FROM tickets WHERE id = $1`, ticketID).Scan(&status)
	if status != "admitted" {
		t.Errorf("ticket status = %q, want %q", status, "admitted")
	}

	var admissionCount int
	_ = pool.QueryRow(ctx, `SELECT COUNT(*) FROM admissions WHERE ticket_id = $1`, ticketID).Scan(&admissionCount)
	if admissionCount != 1 {
		t.Errorf("admissions count = %d, want 1", admissionCount)
	}
}

// Outcome 2: pending → called with is_priority_call=true (no admission record yet)
func TestAdmitByQR_Pending_RestoredToPriorityCall(t *testing.T) {
	pool := setupPostgres(t)
	repo := NewRepository(pool)
	ctx := context.Background()

	boothID := seedBooth(t, pool)
	visitorID := seedVisitor(t, pool, "A-002")
	ticketID := seedTicket(t, pool, visitorID, boothID, "pending")

	result, err := repo.AdmitByQR(ctx, boothID, "A-002")
	if err != nil {
		t.Fatalf("AdmitByQR() error = %v", err)
	}
	if result.Outcome != OutcomeRestoredToPriorityCall {
		t.Errorf("Outcome = %v, want %v", result.Outcome, OutcomeRestoredToPriorityCall)
	}
	if result.TicketID != ticketID {
		t.Errorf("TicketID = %d, want %d", result.TicketID, ticketID)
	}

	var status string
	var isPriority bool
	_ = pool.QueryRow(ctx,
		`SELECT status, is_priority_call FROM tickets WHERE id = $1`, ticketID,
	).Scan(&status, &isPriority)
	if status != "called" {
		t.Errorf("ticket status = %q, want %q", status, "called")
	}
	if !isPriority {
		t.Errorf("is_priority_call = false, want true")
	}

	// No admission record created for this outcome
	var admissionCount int
	_ = pool.QueryRow(ctx, `SELECT COUNT(*) FROM admissions WHERE ticket_id = $1`, ticketID).Scan(&admissionCount)
	if admissionCount != 0 {
		t.Errorf("admissions count = %d, want 0 (pending→called does not create admission)", admissionCount)
	}
}

// Outcome 3: waiting → waiting_confirmation_needed
func TestAdmitByQR_Waiting_ConfirmationNeeded(t *testing.T) {
	pool := setupPostgres(t)
	repo := NewRepository(pool)
	ctx := context.Background()

	boothID := seedBooth(t, pool)
	visitorID := seedVisitor(t, pool, "A-003")
	ticketID := seedTicket(t, pool, visitorID, boothID, "waiting")

	result, err := repo.AdmitByQR(ctx, boothID, "A-003")
	if err != nil {
		t.Fatalf("AdmitByQR() error = %v", err)
	}
	if result.Outcome != OutcomeWaitingConfirmationNeeded {
		t.Errorf("Outcome = %v, want %v", result.Outcome, OutcomeWaitingConfirmationNeeded)
	}
	if result.TicketID != ticketID {
		t.Errorf("TicketID = %d, want %d", result.TicketID, ticketID)
	}

	// Ticket must remain in waiting state
	var status string
	_ = pool.QueryRow(ctx, `SELECT status FROM tickets WHERE id = $1`, ticketID).Scan(&status)
	if status != "waiting" {
		t.Errorf("ticket status = %q, want %q after confirmation-needed outcome", status, "waiting")
	}
}

// Outcome 4: admitted → already_admitted
func TestAdmitByQR_AlreadyAdmitted(t *testing.T) {
	pool := setupPostgres(t)
	repo := NewRepository(pool)
	ctx := context.Background()

	boothID := seedBooth(t, pool)
	visitorID := seedVisitor(t, pool, "A-004")
	seedTicket(t, pool, visitorID, boothID, "admitted")

	result, err := repo.AdmitByQR(ctx, boothID, "A-004")
	if err != nil {
		t.Fatalf("AdmitByQR() error = %v", err)
	}
	if result.Outcome != OutcomeAlreadyAdmitted {
		t.Errorf("Outcome = %v, want %v", result.Outcome, OutcomeAlreadyAdmitted)
	}
}

// Outcome 5: no ticket → not_found
func TestAdmitByQR_NotFound(t *testing.T) {
	pool := setupPostgres(t)
	repo := NewRepository(pool)
	ctx := context.Background()

	boothID := seedBooth(t, pool)
	// visitor exists but has no ticket for this booth
	seedVisitor(t, pool, "A-005")

	result, err := repo.AdmitByQR(ctx, boothID, "A-005")
	if err != nil {
		t.Fatalf("AdmitByQR() error = %v", err)
	}
	if result.Outcome != OutcomeNotFound {
		t.Errorf("Outcome = %v, want %v", result.Outcome, OutcomeNotFound)
	}
}

// AdmitManually with force=true admits a waiting ticket directly.
func TestAdmitManually_Force_WaitingTicket(t *testing.T) {
	pool := setupPostgres(t)
	repo := NewRepository(pool)
	ctx := context.Background()

	boothID := seedBooth(t, pool)
	visitorID := seedVisitor(t, pool, "A-006")
	ticketID := seedTicket(t, pool, visitorID, boothID, "waiting")

	result, err := repo.AdmitManually(ctx, boothID, "A-006", true)
	if err != nil {
		t.Fatalf("AdmitManually(force=true) error = %v", err)
	}
	if result.Outcome != OutcomeAdmitted {
		t.Errorf("Outcome = %v, want %v", result.Outcome, OutcomeAdmitted)
	}
	if result.TicketID != ticketID {
		t.Errorf("TicketID = %d, want %d", result.TicketID, ticketID)
	}

	var status string
	_ = pool.QueryRow(ctx, `SELECT status FROM tickets WHERE id = $1`, ticketID).Scan(&status)
	if status != "admitted" {
		t.Errorf("ticket status = %q, want %q", status, "admitted")
	}
}

// CancelTicketByStaff: booth_id guard prevents cancelling tickets from other booths.
func TestCancelTicketByStaff_WrongBooth(t *testing.T) {
	pool := setupPostgres(t)
	repo := NewRepository(pool)
	ctx := context.Background()

	boothID := seedBooth(t, pool)
	otherBoothID := seedBooth(t, pool)

	var otherBoothVisitorID int64
	_ = pool.QueryRow(context.Background(),
		`INSERT INTO visitors (reception_number, nickname, pin_hash) VALUES ('B-001', '他ブース', 'hash') RETURNING id`,
	).Scan(&otherBoothVisitorID)
	ticketID := seedTicket(t, pool, otherBoothVisitorID, otherBoothID, "waiting")

	// Staff at boothID attempts to cancel a ticket belonging to otherBoothID.
	err := repo.CancelTicketByStaff(ctx, ticketID, boothID)
	if !errors.Is(err, connecterr.ErrNotFound) {
		t.Errorf("CancelTicketByStaff() with wrong booth_id: error = %v, want ErrNotFound", err)
	}
}

// CancelTicketByStaff: happy path cancels the ticket.
func TestCancelTicketByStaff_HappyPath(t *testing.T) {
	pool := setupPostgres(t)
	repo := NewRepository(pool)
	ctx := context.Background()

	boothID := seedBooth(t, pool)
	visitorID := seedVisitor(t, pool, "A-007")
	ticketID := seedTicket(t, pool, visitorID, boothID, "waiting")

	if err := repo.CancelTicketByStaff(ctx, ticketID, boothID); err != nil {
		t.Errorf("CancelTicketByStaff() error = %v", err)
	}

	var status string
	_ = pool.QueryRow(ctx, `SELECT status FROM tickets WHERE id = $1`, ticketID).Scan(&status)
	if status != "cancelled" {
		t.Errorf("ticket status = %q, want %q", status, "cancelled")
	}
}
