//go:build integration

package visitor

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

	// Apply migrations.
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

func TestRepository_Create_HappyPath(t *testing.T) {
	pool := setupPostgres(t)
	repo := NewRepository(pool)
	ctx := context.Background()

	result, err := repo.Create(ctx, "テスト太郎", "1234")
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}
	if result.VisitorID <= 0 {
		t.Errorf("Create() VisitorID = %d, want > 0", result.VisitorID)
	}
	if result.ReceptionNumber != "A-001" {
		t.Errorf("Create() ReceptionNumber = %q, want %q", result.ReceptionNumber, "A-001")
	}
}

func TestRepository_Create_Sequential(t *testing.T) {
	pool := setupPostgres(t)
	repo := NewRepository(pool)
	ctx := context.Background()

	first, err := repo.Create(ctx, "一番目", "1111")
	if err != nil {
		t.Fatalf("Create() first error = %v", err)
	}
	second, err := repo.Create(ctx, "二番目", "2222")
	if err != nil {
		t.Fatalf("Create() second error = %v", err)
	}

	if first.ReceptionNumber != "A-001" {
		t.Errorf("first ReceptionNumber = %q, want %q", first.ReceptionNumber, "A-001")
	}
	if second.ReceptionNumber != "A-002" {
		t.Errorf("second ReceptionNumber = %q, want %q", second.ReceptionNumber, "A-002")
	}
}

func TestRepository_Authenticate_CorrectPin(t *testing.T) {
	pool := setupPostgres(t)
	repo := NewRepository(pool)
	ctx := context.Background()

	created, err := repo.Create(ctx, "認証テスト", "5678")
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}

	visitorID, err := repo.Authenticate(ctx, created.ReceptionNumber, "5678")
	if err != nil {
		t.Fatalf("Authenticate() error = %v", err)
	}
	if visitorID != created.VisitorID {
		t.Errorf("Authenticate() visitorID = %d, want %d", visitorID, created.VisitorID)
	}
}

func TestRepository_Authenticate_WrongPin(t *testing.T) {
	pool := setupPostgres(t)
	repo := NewRepository(pool)
	ctx := context.Background()

	created, err := repo.Create(ctx, "誤PINテスト", "9999")
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}

	_, err = repo.Authenticate(ctx, created.ReceptionNumber, "0000")
	if !errors.Is(err, connecterr.ErrUnauthorized) {
		t.Errorf("Authenticate() with wrong pin error = %v, want ErrUnauthorized", err)
	}
}

func TestRepository_Authenticate_NotFound(t *testing.T) {
	pool := setupPostgres(t)
	repo := NewRepository(pool)
	ctx := context.Background()

	_, err := repo.Authenticate(ctx, "Z-999", "1234")
	if !errors.Is(err, connecterr.ErrUnauthorized) {
		t.Errorf("Authenticate() with missing visitor error = %v, want ErrUnauthorized", err)
	}
}

func TestRepository_GetByID_NotFound(t *testing.T) {
	pool := setupPostgres(t)
	repo := NewRepository(pool)
	ctx := context.Background()

	_, err := repo.GetByID(ctx, 99999999)
	if !errors.Is(err, connecterr.ErrNotFound) {
		t.Errorf("GetByID() with missing id error = %v, want ErrNotFound", err)
	}
}
