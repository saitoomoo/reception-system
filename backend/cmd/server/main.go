package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"reception-system/gen/go/visitor/v1/visitorv1connect"
	"reception-system/internal/feature/visitor"
)

func main() {
	// Load .env in non-production environments (errors are intentionally ignored).
	if os.Getenv("APP_ENV") != "production" {
		_ = godotenv.Load()
	}

	logger := newLogger()

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		logger.Error("DATABASE_URL is not set")
		os.Exit(1)
	}

	pool, err := pgxpool.New(context.Background(), dbURL)
	if err != nil {
		logger.Error("connect to database", slog.Any("error", err))
		os.Exit(1)
	}
	defer pool.Close()

	if err := pool.Ping(context.Background()); err != nil {
		logger.Error("ping database", slog.Any("error", err))
		os.Exit(1)
	}
	logger.Info("database connected")

	mux := http.NewServeMux()

	visitorRepo := visitor.NewRepository(pool)
	visitorHandler := visitor.NewHandler(visitorRepo, logger)
	path, handler := visitorv1connect.NewVisitorServiceHandler(visitorHandler)
	mux.Handle(path, handler)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	addr := fmt.Sprintf(":%s", port)
	logger.Info("server starting", slog.String("addr", addr))

	if err := http.ListenAndServe(addr, mux); err != nil {
		logger.Error("server error", slog.Any("error", err))
		os.Exit(1)
	}
}

func newLogger() *slog.Logger {
	if os.Getenv("APP_ENV") == "production" {
		return slog.New(slog.NewJSONHandler(os.Stdout, nil))
	}
	return slog.New(slog.NewTextHandler(os.Stdout, nil))
}
