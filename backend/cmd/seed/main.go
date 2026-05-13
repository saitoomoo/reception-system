package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"golang.org/x/crypto/bcrypt"
	"reception-system/internal/db"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "ERROR: %v\n", err)
		os.Exit(1)
	}
}

func run() error {
	if os.Getenv("APP_ENV") != "production" {
		_ = godotenv.Load()
	}

	name := flag.String("admin-name", "", "global admin name (required)")
	password := flag.String("admin-password", "", "global admin password (required)")
	flag.Parse()

	if *name == "" {
		return errors.New("--admin-name is required")
	}
	if *password == "" {
		return errors.New("--admin-password is required")
	}

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		return errors.New("DATABASE_URL is not set")
	}

	ctx := context.Background()

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		return fmt.Errorf("connect to database: %w", err)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		return fmt.Errorf("ping database: %w", err)
	}

	q := db.New(pool)

	_, err = q.GetGlobalAdminByName(ctx, *name)
	if err == nil {
		fmt.Printf("admin %q already exists, skipping\n", *name)
		return nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return fmt.Errorf("look up admin: %w", err)
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(*password), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}

	admin, err := q.CreateGlobalAdmin(ctx, db.CreateGlobalAdminParams{
		Name:         *name,
		PasswordHash: string(hash),
	})
	if err != nil {
		return fmt.Errorf("create admin: %w", err)
	}

	fmt.Printf("created global admin: id=%d name=%q\n", admin.ID, admin.Name)
	return nil
}
