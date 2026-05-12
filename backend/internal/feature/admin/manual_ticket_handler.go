package admin

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"net/netip"
	"strconv"
	"strings"

	"connectrpc.com/connect"
	adminv1 "reception-system/gen/go/admin/v1"
	"reception-system/internal/feature/notification"
	"reception-system/internal/pkg/auth"
	"reception-system/internal/pkg/connecterr"
)

// ManualTicketHandler handles the CreateTicketManual RPC for the StaffService.
// It uses the admin Repository which already has booth lookup and manual ticket creation.
type ManualTicketHandler struct {
	repo          *Repository
	notifRepo     *notification.Repository
	sessionSecret string
	logger        *slog.Logger
}

func NewManualTicketHandler(
	repo *Repository,
	notifRepo *notification.Repository,
	sessionSecret string,
	logger *slog.Logger,
) *ManualTicketHandler {
	return &ManualTicketHandler{
		repo:          repo,
		notifRepo:     notifRepo,
		sessionSecret: sessionSecret,
		logger:        logger,
	}
}

// manualTicketAgeFlags computes age-based policy flags from participant ages.
type manualTicketAgeFlags struct {
	hasUnder7  bool
	hasUnder10 bool
	hasUnder13 bool
}

func computeAgeFlags(ages []int32) manualTicketAgeFlags {
	var f manualTicketAgeFlags
	for _, a := range ages {
		if a < 7 {
			f.hasUnder7 = true
		}
		if a < 10 {
			f.hasUnder10 = true
		}
		if a < 13 {
			f.hasUnder13 = true
		}
	}
	return f
}

// validateManualTicketRequest validates age-based policy constraints (R-005).
// Returns a Connect error if invalid, nil otherwise.
func validateManualTicketRequest(ages []int32, paperFormID, guardianName, consentSnapshot string) error {
	f := computeAgeFlags(ages)
	if f.hasUnder7 {
		return connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("participants aged under 7 cannot be registered"))
	}
	if f.hasUnder10 && paperFormID == "" {
		return connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("paper_form_id is required for participants aged 7-9"))
	}
	if f.hasUnder13 {
		if guardianName == "" {
			return connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("guardian_name is required when any participant is under 13"))
		}
		if consentSnapshot == "" {
			return connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("consent_text_snapshot is required when any participant is under 13"))
		}
	}
	return nil
}

// CreateTicketManual issues a ticket via the staff special flow for participants aged 7-9
// (paper_and_digital consent, R-005). Requires a staff session.
func (h *ManualTicketHandler) CreateTicketManual(
	ctx context.Context,
	req *connect.Request[adminv1.CreateTicketManualRequest],
) (*connect.Response[adminv1.CreateTicketManualResponse], error) {
	session, err := auth.ParseStaffSession(&http.Request{Header: req.Header()}, h.sessionSecret)
	if err != nil {
		return nil, connect.NewError(connect.CodePermissionDenied, fmt.Errorf("staff session required"))
	}

	if req.Msg.ReceptionNumber == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("reception_number is required"))
	}
	if len(req.Msg.Participants) == 0 {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("at least one participant is required"))
	}

	ages := make([]int32, len(req.Msg.Participants))
	for i, p := range req.Msg.Participants {
		ages[i] = p.Age
	}
	if err := validateManualTicketRequest(ages, req.Msg.PaperFormId, req.Msg.GuardianName, req.Msg.ConsentTextSnapshot); err != nil {
		return nil, err
	}

	// Look up the visitor.
	visitor, err := h.repo.GetVisitorByReceptionNumberForManual(ctx, req.Msg.ReceptionNumber)
	if errors.Is(err, connecterr.ErrNotFound) {
		return nil, connect.NewError(connect.CodeNotFound, fmt.Errorf("visitor not found"))
	}
	if err != nil {
		h.logger.Error("manual ticket: get visitor", slog.Any("error", err))
		return nil, connecterr.Convert(err)
	}

	boothID := session.BoothID

	// Duplicate active ticket check.
	hasActive, err := h.repo.HasActiveTicket(ctx, visitor.ID, boothID)
	if err != nil {
		h.logger.Error("manual ticket: active ticket check", slog.Any("error", err))
		return nil, connecterr.Convert(err)
	}
	if hasActive {
		return nil, connect.NewError(connect.CodeAlreadyExists, fmt.Errorf("visitor already has an active ticket at this booth"))
	}

	// Cooldown check using booth config from admin repository.
	booth, err := h.repo.GetBoothByID(ctx, boothID)
	if err != nil {
		h.logger.Error("manual ticket: get booth", slog.Any("error", err))
		return nil, connecterr.Convert(err)
	}
	inCooldown, err := h.repo.IsInCooldownForManual(ctx, visitor.ID, boothID, booth.CooldownMinutes)
	if err != nil {
		h.logger.Error("manual ticket: cooldown check", slog.Any("error", err))
		return nil, connecterr.Convert(err)
	}
	if inCooldown {
		return nil, connect.NewError(connect.CodeFailedPrecondition, fmt.Errorf("visitor is within the cooldown period"))
	}

	participants := make([]ManualParticipant, len(req.Msg.Participants))
	for i, p := range req.Msg.Participants {
		participants[i] = ManualParticipant{Age: p.Age, Name: p.Name}
	}

	staffIP := extractIP(req.Header())
	staffUA := req.Header().Get("User-Agent")

	result, err := h.repo.CreateManualTicket(ctx, ManualTicketInput{
		VisitorID:           visitor.ID,
		BoothID:             boothID,
		Participants:        participants,
		GuardianName:        req.Msg.GuardianName,
		PaperFormID:         req.Msg.PaperFormId,
		ConsentTextSnapshot: req.Msg.ConsentTextSnapshot,
		StaffIPAddress:      staffIP,
		StaffUserAgent:      staffUA,
	})
	if err != nil {
		h.logger.Error("manual ticket: create", slog.Any("error", err))
		return nil, connecterr.Convert(err)
	}

	// Enqueue application_completed notification (non-fatal on failure).
	ticketID := result.TicketID
	if err := h.notifRepo.EnqueueForVisitor(ctx, &ticketID, visitor.ID, "application_completed"); err != nil {
		h.logger.Warn("manual ticket: enqueue notification", slog.Any("error", err))
	}

	return connect.NewResponse(&adminv1.CreateTicketManualResponse{
		TicketId:        strconv.FormatInt(result.TicketID, 10),
		SequenceInBooth: result.SequenceInBooth,
	}), nil
}

// extractIP pulls the client IP from X-Forwarded-For or X-Real-IP, falling back
// to 127.0.0.1 when neither is present (staff tablet on local network).
func extractIP(h http.Header) netip.Addr {
	if xff := h.Get("X-Forwarded-For"); xff != "" {
		raw := strings.TrimSpace(strings.SplitN(xff, ",", 2)[0])
		if host, _, err := net.SplitHostPort(raw); err == nil {
			raw = host
		}
		if addr, err := netip.ParseAddr(raw); err == nil {
			return addr
		}
	}
	if xri := h.Get("X-Real-IP"); xri != "" {
		if addr, err := netip.ParseAddr(strings.TrimSpace(xri)); err == nil {
			return addr
		}
	}
	loopback, _ := netip.ParseAddr("127.0.0.1")
	return loopback
}
