package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"reception-system/gen/go/booth/v1/boothv1connect"
	"reception-system/gen/go/ticket/v1/ticketv1connect"
	"reception-system/gen/go/visitor/v1/visitorv1connect"
	"reception-system/internal/feature/booth"
	"reception-system/internal/feature/ticket"
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

	boothRepo := booth.NewRepository(pool)
	boothHandler := booth.NewHandler(boothRepo, logger)
	path, handler = boothv1connect.NewBoothServiceHandler(boothHandler)
	mux.Handle(path, handler)

	ticketRepo := ticket.NewRepository(pool)
	ticketHandler := ticket.NewHandler(ticketRepo, logger)
	path, handler = ticketv1connect.NewTicketServiceHandler(ticketHandler)
	mux.Handle(path, handler)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	addr := fmt.Sprintf(":%s", port)
	logger.Info("server starting", slog.String("addr", addr))

	if err := http.ListenAndServe(addr, corsMiddleware(mux)); err != nil {
		logger.Error("server error", slog.Any("error", err))
		os.Exit(1)
	}
}

func corsMiddleware(next http.Handler) http.Handler {
	originsEnv := os.Getenv("CORS_ALLOWED_ORIGINS")
	var allowed []string
	if originsEnv != "" {
		for _, o := range strings.Split(originsEnv, ",") {
			if o = strings.TrimSpace(o); o != "" {
				allowed = append(allowed, o)
			}
		}
	} else {
		allowed = []string{"http://localhost:5173", "http://localhost:5174"}
	}
	originSet := make(map[string]struct{}, len(allowed))
	for _, o := range allowed {
		originSet[o] = struct{}{}
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if _, ok := originSet[origin]; ok {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Connect-Protocol-Version, Connect-Timeout-Ms")
			w.Header().Set("Vary", "Origin")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func newLogger() *slog.Logger {
	if os.Getenv("APP_ENV") == "production" {
		return slog.New(slog.NewJSONHandler(os.Stdout, nil))
	}
	return slog.New(slog.NewTextHandler(os.Stdout, nil))
}
