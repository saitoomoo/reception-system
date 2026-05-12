package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"

	"connectrpc.com/connect"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	adminv1 "reception-system/gen/go/admin/v1"
	"reception-system/gen/go/admin/v1/adminv1connect"
	"reception-system/gen/go/booth/v1/boothv1connect"
	"reception-system/gen/go/ticket/v1/ticketv1connect"
	"reception-system/gen/go/visitor/v1/visitorv1connect"
	"reception-system/internal/feature/admin"
	"reception-system/internal/feature/admission"
	"reception-system/internal/feature/booth"
	"reception-system/internal/feature/match"
	"reception-system/internal/feature/notification"
	"reception-system/internal/feature/ticket"
	"reception-system/internal/feature/visitor"
)

func main() {
	if os.Getenv("APP_ENV") != "production" {
		_ = godotenv.Load()
	}

	logger := newLogger()

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		logger.Error("DATABASE_URL is not set")
		os.Exit(1)
	}

	sessionSecret := os.Getenv("SESSION_SECRET")
	if sessionSecret == "" {
		logger.Error("SESSION_SECRET is not set")
		os.Exit(1)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		logger.Error("connect to database", slog.Any("error", err))
		os.Exit(1)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		logger.Error("ping database", slog.Any("error", err))
		os.Exit(1)
	}
	logger.Info("database connected")

	mux := http.NewServeMux()

	visitorRepo := visitor.NewRepository(pool)
	visitorHandler := visitor.NewHandler(visitorRepo, logger)
	path, handler := visitorv1connect.NewVisitorServiceHandler(visitorHandler)
	mux.Handle(path, handler)

	notifRepo := notification.NewRepository(pool)
	notifWorker := notification.NewWorker(
		notifRepo,
		os.Getenv("VAPID_PUBLIC_KEY"),
		os.Getenv("VAPID_PRIVATE_KEY"),
		os.Getenv("VAPID_SUBJECT"),
		logger,
	)
	go notifWorker.Run(ctx)

	boothRepo := booth.NewRepository(pool)
	boothHandler := booth.NewHandler(boothRepo, logger)
	path, handler = boothv1connect.NewBoothServiceHandler(boothHandler)
	mux.Handle(path, handler)

	ticketRepo := ticket.NewRepository(pool)
	ticketHandler := ticket.NewHandler(ticketRepo, notifRepo, logger)
	path, handler = ticketv1connect.NewTicketServiceHandler(ticketHandler)
	mux.Handle(path, handler)

	pendingWorker := ticket.NewPendingWorker(ticketRepo, notifRepo, logger)
	go pendingWorker.Run(ctx)

	matchRepo := match.NewRepository(pool)
	matchSvc := match.NewService(matchRepo, logger)
	ticketHandler.SetMatchService(matchSvc)

	adminRepo := admin.NewRepository(pool)
	adminHandler := admin.NewAdminHandler(adminRepo, notifRepo, sessionSecret, logger)
	path, handler = adminv1connect.NewAdminServiceHandler(adminHandler)
	mux.Handle(path, handler)

	boothStaffH := booth.NewStaffHandler(boothRepo, notifRepo, sessionSecret, logger)
	admissionRepo := admission.NewRepository(pool)
	admissionStaffH := admission.NewStaffHandler(admissionRepo, notifRepo, sessionSecret, logger)
	matchStaffH := match.NewStaffHandler(matchSvc, sessionSecret, logger)
	manualTicketH := admin.NewManualTicketHandler(adminRepo, notifRepo, sessionSecret, logger)
	staffHandler := &combinedStaffHandler{
		boothH:        boothStaffH,
		admissionH:    admissionStaffH,
		matchH:        matchStaffH,
		manualTicketH: manualTicketH,
	}
	path, handler = adminv1connect.NewStaffServiceHandler(staffHandler)
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

// combinedStaffHandler routes StaffService RPCs to the appropriate sub-handler.
// booth RPCs: LoginAsStaff, CallTicket, CallNextTickets
// admission RPCs: AdmitByQR, AdmitManually, CancelTicketByStaff
// match RPCs: ForceStartMatch, CallPrivateMatch, CompleteMatchSession, GetMatchQueueStatus
type combinedStaffHandler struct {
	adminv1connect.UnimplementedStaffServiceHandler
	boothH        *booth.StaffHandler
	admissionH    *admission.StaffHandler
	matchH        *match.StaffHandler
	manualTicketH *admin.ManualTicketHandler
}

func (h *combinedStaffHandler) LoginAsStaff(ctx context.Context, req *connect.Request[adminv1.LoginAsStaffRequest]) (*connect.Response[adminv1.LoginAsStaffResponse], error) {
	return h.boothH.LoginAsStaff(ctx, req)
}
func (h *combinedStaffHandler) CallTicket(ctx context.Context, req *connect.Request[adminv1.CallTicketRequest]) (*connect.Response[adminv1.CallTicketResponse], error) {
	return h.boothH.CallTicket(ctx, req)
}
func (h *combinedStaffHandler) CallNextTickets(ctx context.Context, req *connect.Request[adminv1.CallNextTicketsRequest]) (*connect.Response[adminv1.CallNextTicketsResponse], error) {
	return h.boothH.CallNextTickets(ctx, req)
}
func (h *combinedStaffHandler) AdmitByQR(ctx context.Context, req *connect.Request[adminv1.AdmitByQRRequest]) (*connect.Response[adminv1.AdmitByQRResponse], error) {
	return h.admissionH.AdmitByQR(ctx, req)
}
func (h *combinedStaffHandler) AdmitManually(ctx context.Context, req *connect.Request[adminv1.AdmitManuallyRequest]) (*connect.Response[adminv1.AdmitManuallyResponse], error) {
	return h.admissionH.AdmitManually(ctx, req)
}
func (h *combinedStaffHandler) CancelTicketByStaff(ctx context.Context, req *connect.Request[adminv1.CancelTicketByStaffRequest]) (*connect.Response[adminv1.CancelTicketByStaffResponse], error) {
	return h.admissionH.CancelTicketByStaff(ctx, req)
}
func (h *combinedStaffHandler) GetStaffSession(ctx context.Context, req *connect.Request[adminv1.GetStaffSessionRequest]) (*connect.Response[adminv1.GetStaffSessionResponse], error) {
	return h.boothH.GetStaffSession(ctx, req)
}
func (h *combinedStaffHandler) ListTicketsByBooth(ctx context.Context, req *connect.Request[adminv1.ListTicketsByBoothRequest]) (*connect.Response[adminv1.ListTicketsByBoothResponse], error) {
	return h.boothH.ListTicketsByBooth(ctx, req)
}
func (h *combinedStaffHandler) RestorePendingTicket(ctx context.Context, req *connect.Request[adminv1.RestorePendingTicketRequest]) (*connect.Response[adminv1.RestorePendingTicketResponse], error) {
	return h.admissionH.RestorePendingTicket(ctx, req)
}
func (h *combinedStaffHandler) ForceStartMatch(ctx context.Context, req *connect.Request[adminv1.ForceStartMatchRequest]) (*connect.Response[adminv1.ForceStartMatchResponse], error) {
	return h.matchH.ForceStartMatch(ctx, req)
}
func (h *combinedStaffHandler) CallPrivateMatch(ctx context.Context, req *connect.Request[adminv1.CallPrivateMatchRequest]) (*connect.Response[adminv1.CallPrivateMatchResponse], error) {
	return h.matchH.CallPrivateMatch(ctx, req)
}
func (h *combinedStaffHandler) CompleteMatchSession(ctx context.Context, req *connect.Request[adminv1.CompleteMatchSessionRequest]) (*connect.Response[adminv1.CompleteMatchSessionResponse], error) {
	return h.matchH.CompleteMatchSession(ctx, req)
}
func (h *combinedStaffHandler) GetMatchQueueStatus(ctx context.Context, req *connect.Request[adminv1.GetMatchQueueStatusRequest]) (*connect.Response[adminv1.GetMatchQueueStatusResponse], error) {
	return h.matchH.GetMatchQueueStatus(ctx, req)
}
func (h *combinedStaffHandler) CreateTicketManual(ctx context.Context, req *connect.Request[adminv1.CreateTicketManualRequest]) (*connect.Response[adminv1.CreateTicketManualResponse], error) {
	return h.manualTicketH.CreateTicketManual(ctx, req)
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
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Connect-Protocol-Version, Connect-Timeout-Ms, Cookie")
			w.Header().Set("Access-Control-Allow-Credentials", "true")
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
