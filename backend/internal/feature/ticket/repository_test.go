//go:build integration

package ticket

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
	"reception-system/internal/db"
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

// seedVisitor inserts a minimal visitor row and returns its ID.
func seedVisitor(t *testing.T, pool *pgxpool.Pool) int64 {
	t.Helper()
	var id int64
	err := pool.QueryRow(context.Background(),
		`INSERT INTO visitors (reception_number, nickname, pin_hash) VALUES ($1, $2, $3) RETURNING id`,
		"A-001", "テスト太郎", "$2a$10$placeholder",
	).Scan(&id)
	if err != nil {
		t.Fatalf("seed visitor: %v", err)
	}
	return id
}

// seedBooth inserts a booth with the given cooldown and returns its ID.
func seedBooth(t *testing.T, pool *pgxpool.Pool, cooldownMinutes int32) int64 {
	t.Helper()
	var id int64
	err := pool.QueryRow(context.Background(),
		`INSERT INTO booths (
			name, description, location, open_at, close_at,
			experience_type, staff_password_hash, cooldown_minutes
		) VALUES (
			'テストブース', '説明', '会場A',
			now() - interval '1 hour', now() + interval '8 hours',
			'sequential', 'hash', $1
		) RETURNING id`,
		cooldownMinutes,
	).Scan(&id)
	if err != nil {
		t.Fatalf("seed booth: %v", err)
	}
	return id
}

// seedAdmittedTicket inserts an already-admitted ticket for the visitor/booth pair.
// All operations run in one transaction so the DEFERRABLE FK on ticket_group_id is
// satisfied at commit time.
func seedAdmittedTicket(t *testing.T, pool *pgxpool.Pool, visitorID, boothID int64, admittedAgo time.Duration) {
	t.Helper()
	ctx := context.Background()

	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin tx: %v", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var ticketID int64
	err = tx.QueryRow(ctx,
		`INSERT INTO tickets (visitor_id, booth_id, ticket_group_id, sequence_in_booth, status, admitted_at)
		 VALUES ($1, $2, 0, 1, 'admitted', $3) RETURNING id`,
		visitorID, boothID, time.Now().Add(-admittedAgo),
	).Scan(&ticketID)
	if err != nil {
		t.Fatalf("seed ticket: %v", err)
	}

	var groupID int64
	err = tx.QueryRow(ctx,
		`INSERT INTO ticket_groups (ticket_id, participant_count) VALUES ($1, 1) RETURNING id`,
		ticketID,
	).Scan(&groupID)
	if err != nil {
		t.Fatalf("seed ticket_group: %v", err)
	}

	_, err = tx.Exec(ctx,
		`UPDATE tickets SET ticket_group_id = $2 WHERE id = $1`,
		ticketID, groupID,
	)
	if err != nil {
		t.Fatalf("update ticket_group_id: %v", err)
	}

	if err := tx.Commit(ctx); err != nil {
		t.Fatalf("commit: %v", err)
	}
}

// -------------------------------- tests ------------------------------------

func TestCreateTicket_HappyPath(t *testing.T) {
	pool := setupPostgres(t)
	repo := NewRepository(pool)
	ctx := context.Background()

	visitorID := seedVisitor(t, pool)
	boothID := seedBooth(t, pool, 0)

	req := CreateTicketRequest{
		VisitorID:    visitorID,
		BoothID:      boothID,
		Participants: []ParticipantInput{{Age: 20}},
	}
	result, err := repo.CreateTicket(ctx, req)
	if err != nil {
		t.Fatalf("CreateTicket() error = %v", err)
	}
	if result.TicketID <= 0 {
		t.Errorf("TicketID = %d, want > 0", result.TicketID)
	}
	if result.Status != "waiting" {
		t.Errorf("Status = %q, want %q", result.Status, "waiting")
	}
	if result.Position != 0 {
		t.Errorf("Position = %d, want 0", result.Position)
	}

	// Verify ticket_group was created and linked.
	var groupID int64
	err = pool.QueryRow(ctx,
		`SELECT ticket_group_id FROM tickets WHERE id = $1`, result.TicketID,
	).Scan(&groupID)
	if err != nil {
		t.Fatalf("fetch ticket: %v", err)
	}
	if groupID <= 0 {
		t.Errorf("ticket_group_id = %d, want > 0", groupID)
	}
}

func TestCreateTicket_DuplicateTicket(t *testing.T) {
	pool := setupPostgres(t)
	repo := NewRepository(pool)
	ctx := context.Background()

	visitorID := seedVisitor(t, pool)
	boothID := seedBooth(t, pool, 0)

	req := CreateTicketRequest{
		VisitorID:    visitorID,
		BoothID:      boothID,
		Participants: []ParticipantInput{{Age: 20}},
	}
	if _, err := repo.CreateTicket(ctx, req); err != nil {
		t.Fatalf("first CreateTicket() error = %v", err)
	}

	_, err := repo.CreateTicket(ctx, req)
	if !errors.Is(err, connecterr.ErrAlreadyHasTicket) {
		t.Errorf("second CreateTicket() error = %v, want ErrAlreadyHasTicket", err)
	}
}

func TestCreateTicket_CooldownActive(t *testing.T) {
	pool := setupPostgres(t)
	repo := NewRepository(pool)
	ctx := context.Background()

	visitorID := seedVisitor(t, pool)
	boothID := seedBooth(t, pool, 60) // 60-minute cooldown

	// Seed an admitted ticket 10 minutes ago (well within cooldown).
	seedAdmittedTicket(t, pool, visitorID, boothID, 10*time.Minute)

	_, err := repo.CreateTicket(ctx, CreateTicketRequest{
		VisitorID:    visitorID,
		BoothID:      boothID,
		Participants: []ParticipantInput{{Age: 20}},
	})
	if !errors.Is(err, connecterr.ErrCooldownActive) {
		t.Errorf("CreateTicket() error = %v, want ErrCooldownActive", err)
	}
}

func TestCreateTicket_CooldownExpired(t *testing.T) {
	pool := setupPostgres(t)
	repo := NewRepository(pool)
	ctx := context.Background()

	visitorID := seedVisitor(t, pool)
	boothID := seedBooth(t, pool, 30) // 30-minute cooldown

	// Seed an admitted ticket 90 minutes ago (cooldown elapsed).
	seedAdmittedTicket(t, pool, visitorID, boothID, 90*time.Minute)

	_, err := repo.CreateTicket(ctx, CreateTicketRequest{
		VisitorID:    visitorID,
		BoothID:      boothID,
		Participants: []ParticipantInput{{Age: 20}},
	})
	if err != nil {
		t.Errorf("CreateTicket() after cooldown expired error = %v, want nil", err)
	}
}

func TestCreateTicket_UnderAge(t *testing.T) {
	pool := setupPostgres(t)
	repo := NewRepository(pool)
	ctx := context.Background()

	visitorID := seedVisitor(t, pool)
	boothID := seedBooth(t, pool, 0)

	_, err := repo.CreateTicket(ctx, CreateTicketRequest{
		VisitorID:    visitorID,
		BoothID:      boothID,
		Participants: []ParticipantInput{{Age: 6}},
	})
	if !errors.Is(err, connecterr.ErrUnderAge) {
		t.Errorf("CreateTicket() error = %v, want ErrUnderAge", err)
	}
}

func TestCreateTicket_SpecialFlowRequired(t *testing.T) {
	pool := setupPostgres(t)
	repo := NewRepository(pool)
	ctx := context.Background()

	visitorID := seedVisitor(t, pool)
	boothID := seedBooth(t, pool, 0)

	_, err := repo.CreateTicket(ctx, CreateTicketRequest{
		VisitorID:    visitorID,
		BoothID:      boothID,
		Participants: []ParticipantInput{{Age: 8, Name: "子供太郎"}},
	})
	if !errors.Is(err, connecterr.ErrSpecialFlowRequired) {
		t.Errorf("CreateTicket() error = %v, want ErrSpecialFlowRequired", err)
	}
}

func TestCreateTicket_ConsentRequired(t *testing.T) {
	pool := setupPostgres(t)
	repo := NewRepository(pool)
	ctx := context.Background()

	visitorID := seedVisitor(t, pool)
	boothID := seedBooth(t, pool, 0)

	// Age 11: online flow allowed but parental consent required.
	_, err := repo.CreateTicket(ctx, CreateTicketRequest{
		VisitorID:      visitorID,
		BoothID:        boothID,
		Participants:   []ParticipantInput{{Age: 11, Name: "子供花子"}},
		ParentalConsent: nil,
	})
	if !errors.Is(err, connecterr.ErrConsentRequired) {
		t.Errorf("CreateTicket() error = %v, want ErrConsentRequired", err)
	}
}

func TestCreateTicket_ConsentProvided(t *testing.T) {
	pool := setupPostgres(t)
	repo := NewRepository(pool)
	ctx := context.Background()

	visitorID := seedVisitor(t, pool)
	boothID := seedBooth(t, pool, 0)

	_, err := repo.CreateTicket(ctx, CreateTicketRequest{
		VisitorID:    visitorID,
		BoothID:      boothID,
		Participants: []ParticipantInput{{Age: 11, Name: "子供花子"}},
		ParentalConsent: &ParentalConsentInput{
			GuardianName:        "保護者 一郎",
			ConsentTextSnapshot: "リスク説明文全文",
			UserAgent:           "Mozilla/5.0",
			IPAddress:           "192.168.1.1",
		},
	})
	if err != nil {
		t.Errorf("CreateTicket() with consent error = %v, want nil", err)
	}
}

func TestCreateTicket_BoothClosed(t *testing.T) {
	pool := setupPostgres(t)
	repo := NewRepository(pool)
	ctx := context.Background()

	visitorID := seedVisitor(t, pool)

	// Insert a booth with is_accepting=false.
	var boothID int64
	err := pool.QueryRow(ctx,
		`INSERT INTO booths (
			name, description, location, open_at, close_at,
			experience_type, staff_password_hash, is_accepting
		) VALUES ('閉鎖ブース', '説明', '会場B',
			now() - interval '1 hour', now() + interval '8 hours',
			'sequential', 'hash', false
		) RETURNING id`,
	).Scan(&boothID)
	if err != nil {
		t.Fatalf("seed closed booth: %v", err)
	}

	_, err = repo.CreateTicket(ctx, CreateTicketRequest{
		VisitorID:    visitorID,
		BoothID:      boothID,
		Participants: []ParticipantInput{{Age: 20}},
	})
	if !errors.Is(err, connecterr.ErrBoothClosed) {
		t.Errorf("CreateTicket() error = %v, want ErrBoothClosed", err)
	}
}

func TestCancelTicket_HappyPath(t *testing.T) {
	pool := setupPostgres(t)
	repo := NewRepository(pool)
	ctx := context.Background()

	visitorID := seedVisitor(t, pool)
	boothID := seedBooth(t, pool, 0)

	created, err := repo.CreateTicket(ctx, CreateTicketRequest{
		VisitorID:    visitorID,
		BoothID:      boothID,
		Participants: []ParticipantInput{{Age: 20}},
	})
	if err != nil {
		t.Fatalf("CreateTicket() error = %v", err)
	}

	if err := repo.Cancel(ctx, created.TicketID, visitorID); err != nil {
		t.Errorf("Cancel() error = %v", err)
	}

	var status string
	err = pool.QueryRow(ctx, `SELECT status FROM tickets WHERE id = $1`, created.TicketID).Scan(&status)
	if err != nil {
		t.Fatalf("fetch ticket: %v", err)
	}
	if status != "cancelled" {
		t.Errorf("status = %q, want %q", status, "cancelled")
	}
}

func TestCancelTicket_NotOwner(t *testing.T) {
	pool := setupPostgres(t)
	repo := NewRepository(pool)
	ctx := context.Background()

	visitorID := seedVisitor(t, pool)
	boothID := seedBooth(t, pool, 0)

	created, err := repo.CreateTicket(ctx, CreateTicketRequest{
		VisitorID:    visitorID,
		BoothID:      boothID,
		Participants: []ParticipantInput{{Age: 20}},
	})
	if err != nil {
		t.Fatalf("CreateTicket() error = %v", err)
	}

	err = repo.Cancel(ctx, created.TicketID, visitorID+9999)
	if !errors.Is(err, connecterr.ErrNotFound) {
		t.Errorf("Cancel() error = %v, want ErrNotFound", err)
	}
}

func TestCancelTicket_AlreadyAdmitted(t *testing.T) {
	pool := setupPostgres(t)
	repo := NewRepository(pool)
	ctx := context.Background()

	visitorID := seedVisitor(t, pool)
	boothID := seedBooth(t, pool, 0)

	// Seed an admitted ticket (cannot cancel per R-014).
	seedAdmittedTicket(t, pool, visitorID, boothID, 2*time.Hour)

	var ticketID int64
	err := pool.QueryRow(ctx,
		`SELECT id FROM tickets WHERE visitor_id = $1 AND booth_id = $2`,
		visitorID, boothID,
	).Scan(&ticketID)
	if err != nil {
		t.Fatalf("fetch ticket id: %v", err)
	}

	err = repo.Cancel(ctx, ticketID, visitorID)
	if !errors.Is(err, connecterr.ErrCancelNotAllowed) {
		t.Errorf("Cancel() error = %v, want ErrCancelNotAllowed", err)
	}
}

func TestGetTicketStatus_Position(t *testing.T) {
	pool := setupPostgres(t)
	repo := NewRepository(pool)
	ctx := context.Background()

	boothID := seedBooth(t, pool, 0)

	// Seed a second visitor for the first ticket.
	var firstVisitorID int64
	err := pool.QueryRow(ctx,
		`INSERT INTO visitors (reception_number, nickname, pin_hash) VALUES ('A-002', '先着', 'hash') RETURNING id`,
	).Scan(&firstVisitorID)
	if err != nil {
		t.Fatalf("seed first visitor: %v", err)
	}

	// First ticket.
	first, err := repo.CreateTicket(ctx, CreateTicketRequest{
		VisitorID:    firstVisitorID,
		BoothID:      boothID,
		Participants: []ParticipantInput{{Age: 20}},
	})
	if err != nil {
		t.Fatalf("first CreateTicket() error = %v", err)
	}

	// Second ticket (our subject).
	visitorID := seedVisitor(t, pool)
	second, err := repo.CreateTicket(ctx, CreateTicketRequest{
		VisitorID:    visitorID,
		BoothID:      boothID,
		Participants: []ParticipantInput{{Age: 20}},
	})
	if err != nil {
		t.Fatalf("second CreateTicket() error = %v", err)
	}

	_ = first
	status, err := repo.GetTicketStatus(ctx, second.TicketID)
	if err != nil {
		t.Fatalf("GetTicketStatus() error = %v", err)
	}
	if status.Position != 1 {
		t.Errorf("Position = %d, want 1 (one ticket ahead)", status.Position)
	}
}

func TestGetTicketStatus_PendingExcludedFromPosition(t *testing.T) {
	pool := setupPostgres(t)
	repo := NewRepository(pool)
	ctx := context.Background()

	boothID := seedBooth(t, pool, 0)

	// First visitor: seed a pending ticket manually.
	var firstVisitorID int64
	_ = pool.QueryRow(ctx,
		`INSERT INTO visitors (reception_number, nickname, pin_hash) VALUES ('A-002', '保留', 'hash') RETURNING id`,
	).Scan(&firstVisitorID)

	var pendingTicketID int64
	_ = pool.QueryRow(ctx,
		`INSERT INTO tickets (visitor_id, booth_id, ticket_group_id, sequence_in_booth, status)
		 VALUES ($1, $2, 0, 1, 'pending') RETURNING id`,
		firstVisitorID, boothID,
	).Scan(&pendingTicketID)
	var gID int64
	_ = pool.QueryRow(ctx,
		`INSERT INTO ticket_groups (ticket_id, participant_count) VALUES ($1, 1) RETURNING id`, pendingTicketID,
	).Scan(&gID)
	_, _ = pool.Exec(ctx, `UPDATE tickets SET ticket_group_id=$2 WHERE id=$1`, pendingTicketID, gID)

	// Second ticket (our subject).
	visitorID := seedVisitor(t, pool)
	second, err := repo.CreateTicket(ctx, CreateTicketRequest{
		VisitorID:    visitorID,
		BoothID:      boothID,
		Participants: []ParticipantInput{{Age: 20}},
	})
	if err != nil {
		t.Fatalf("CreateTicket() error = %v", err)
	}

	status, err := repo.GetTicketStatus(ctx, second.TicketID)
	if err != nil {
		t.Fatalf("GetTicketStatus() error = %v", err)
	}
	// pending ticket is excluded from position count (R-012).
	if status.Position != 0 {
		t.Errorf("Position = %d, want 0 (pending excluded per R-012)", status.Position)
	}
}

// db.Booth is only used for type assertion in tests; pull it via the db package.
var _ = db.Booth{}
