//go:build integration

package booth

import (
	"context"
	"errors"
	"path/filepath"
	"runtime"
	"testing"

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

// seedBooth inserts a booth and returns its ID.
func seedBooth(t *testing.T, pool *pgxpool.Pool, name string) int64 {
	t.Helper()
	var id int64
	err := pool.QueryRow(context.Background(),
		`INSERT INTO booths (
			name, description, location, open_at, close_at,
			experience_type, staff_password_hash
		) VALUES (
			$1, '説明', '会場A',
			now() - interval '1 hour', now() + interval '8 hours',
			'sequential', 'hash'
		) RETURNING id`,
		name,
	).Scan(&id)
	if err != nil {
		t.Fatalf("seed booth: %v", err)
	}
	return id
}

// seedVisitorWithWaitingTicket inserts a visitor and a waiting ticket for the given booth.
// All operations run in one transaction so the DEFERRABLE FK on ticket_group_id is
// satisfied at commit time.
func seedVisitorWithWaitingTicket(t *testing.T, pool *pgxpool.Pool, boothID int64, receptionNumber string) {
	t.Helper()
	ctx := context.Background()

	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin tx: %v", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var visitorID int64
	err = tx.QueryRow(ctx,
		`INSERT INTO visitors (reception_number, nickname, pin_hash) VALUES ($1, $2, $3) RETURNING id`,
		receptionNumber, "テスト"+receptionNumber, "$2a$10$placeholder",
	).Scan(&visitorID)
	if err != nil {
		t.Fatalf("seed visitor: %v", err)
	}

	var ticketID int64
	err = tx.QueryRow(ctx,
		`INSERT INTO tickets (visitor_id, booth_id, ticket_group_id, sequence_in_booth, status)
		 VALUES ($1, $2, 0, 1, 'waiting') RETURNING id`,
		visitorID, boothID,
	).Scan(&ticketID)
	if err != nil {
		t.Fatalf("seed waiting ticket: %v", err)
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

func TestListBooths_HappyPath(t *testing.T) {
	pool := setupPostgres(t)
	repo := NewRepository(pool)

	id1 := seedBooth(t, pool, "ブースA")
	id2 := seedBooth(t, pool, "ブースB")

	booths, err := repo.ListBooths(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(booths) != 2 {
		t.Fatalf("expected 2 booths, got %d", len(booths))
	}

	ids := map[int64]bool{booths[0].Booth.ID: true, booths[1].Booth.ID: true}
	if !ids[id1] || !ids[id2] {
		t.Errorf("returned booth IDs do not match seeded IDs")
	}
}

func TestListBooths_Empty(t *testing.T) {
	pool := setupPostgres(t)
	repo := NewRepository(pool)

	booths, err := repo.ListBooths(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(booths) != 0 {
		t.Fatalf("expected 0 booths, got %d", len(booths))
	}
}

func TestListBooths_WaitingCount(t *testing.T) {
	pool := setupPostgres(t)
	repo := NewRepository(pool)

	boothID := seedBooth(t, pool, "待ちブース")
	seedVisitorWithWaitingTicket(t, pool, boothID, "A-001")
	seedVisitorWithWaitingTicket(t, pool, boothID, "A-002")

	booths, err := repo.ListBooths(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(booths) != 1 {
		t.Fatalf("expected 1 booth, got %d", len(booths))
	}
	if booths[0].WaitingCount != 2 {
		t.Errorf("expected waiting_count=2, got %d", booths[0].WaitingCount)
	}
}

func TestGetBoothByID_HappyPath(t *testing.T) {
	pool := setupPostgres(t)
	repo := NewRepository(pool)

	id := seedBooth(t, pool, "テストブース")

	b, err := repo.GetBoothByID(context.Background(), id)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if b.Booth.ID != id {
		t.Errorf("expected booth ID %d, got %d", id, b.Booth.ID)
	}
	if b.Booth.Name != "テストブース" {
		t.Errorf("expected name テストブース, got %s", b.Booth.Name)
	}
}

func TestGetBoothByID_NotFound(t *testing.T) {
	pool := setupPostgres(t)
	repo := NewRepository(pool)

	_, err := repo.GetBoothByID(context.Background(), 99999)
	if !errors.Is(err, connecterr.ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}
