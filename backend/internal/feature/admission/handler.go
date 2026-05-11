package admission

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"

	"connectrpc.com/connect"
	adminv1 "reception-system/gen/go/admin/v1"
	"reception-system/gen/go/admin/v1/adminv1connect"
	"reception-system/internal/pkg/auth"
	"reception-system/internal/pkg/connecterr"
)

// StaffHandler implements the staff-side admission RPCs of StaffService.
// It is embedded into the combined StaffServiceHandler in main.go alongside booth RPCs.
type StaffHandler struct {
	adminv1connect.UnimplementedStaffServiceHandler
	repo          *Repository
	sessionSecret string
	logger        *slog.Logger
}

func NewStaffHandler(repo *Repository, sessionSecret string, logger *slog.Logger) *StaffHandler {
	return &StaffHandler{repo: repo, sessionSecret: sessionSecret, logger: logger}
}

func (h *StaffHandler) AdmitByQR(
	ctx context.Context,
	req *connect.Request[adminv1.AdmitByQRRequest],
) (*connect.Response[adminv1.AdmitByQRResponse], error) {
	session, boothID, err := h.requireStaffSession(req.Header())
	if err != nil {
		return nil, err
	}
	_ = session

	if req.Msg.ReceptionNumber == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("reception_number is required"))
	}

	result, err := h.repo.AdmitByQR(ctx, boothID, req.Msg.ReceptionNumber)
	if err != nil {
		h.logger.Error("admit by qr", slog.Any("error", err))
		return nil, connecterr.Convert(err)
	}

	return connect.NewResponse(&adminv1.AdmitByQRResponse{
		Outcome:  outcomeToProto(result.Outcome),
		TicketId: strconv.FormatInt(result.TicketID, 10),
	}), nil
}

func (h *StaffHandler) AdmitManually(
	ctx context.Context,
	req *connect.Request[adminv1.AdmitManuallyRequest],
) (*connect.Response[adminv1.AdmitManuallyResponse], error) {
	session, boothID, err := h.requireStaffSession(req.Header())
	if err != nil {
		return nil, err
	}
	_ = session

	if req.Msg.ReceptionNumber == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("reception_number is required"))
	}

	result, err := h.repo.AdmitManually(ctx, boothID, req.Msg.ReceptionNumber, req.Msg.Force)
	if err != nil {
		h.logger.Error("admit manually", slog.Any("error", err))
		return nil, connecterr.Convert(err)
	}

	return connect.NewResponse(&adminv1.AdmitManuallyResponse{
		Outcome:  outcomeToProto(result.Outcome),
		TicketId: strconv.FormatInt(result.TicketID, 10),
	}), nil
}

func (h *StaffHandler) CancelTicketByStaff(
	ctx context.Context,
	req *connect.Request[adminv1.CancelTicketByStaffRequest],
) (*connect.Response[adminv1.CancelTicketByStaffResponse], error) {
	_, boothID, err := h.requireStaffSession(req.Header())
	if err != nil {
		return nil, err
	}

	ticketID, err := strconv.ParseInt(req.Msg.TicketId, 10, 64)
	if err != nil || ticketID <= 0 {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid ticket_id"))
	}

	if err := h.repo.CancelTicketByStaff(ctx, ticketID, boothID); err != nil {
		return nil, connecterr.Convert(err)
	}

	return connect.NewResponse(&adminv1.CancelTicketByStaffResponse{}), nil
}

// requireStaffSession extracts and validates the staff session cookie.
// Returns the session and the booth_id the staff is authenticated for.
func (h *StaffHandler) requireStaffSession(header http.Header) (*auth.Session, int64, error) {
	// Build a minimal *http.Request so auth.ParseStaffSession can read the cookie.
	r := &http.Request{Header: header}
	session, err := auth.ParseStaffSession(r, h.sessionSecret)
	if err != nil {
		return nil, 0, connect.NewError(connect.CodeUnauthenticated, fmt.Errorf("invalid staff session: %w", err))
	}
	if session.Role != auth.RoleStaff {
		return nil, 0, connect.NewError(connect.CodePermissionDenied, fmt.Errorf("not a staff session"))
	}
	return session, session.BoothID, nil
}

func outcomeToProto(o Outcome) adminv1.AdmitOutcome {
	switch o {
	case OutcomeAdmitted:
		return adminv1.AdmitOutcome_ADMIT_OUTCOME_ADMITTED
	case OutcomeRestoredToPriorityCall:
		return adminv1.AdmitOutcome_ADMIT_OUTCOME_RESTORED_TO_PRIORITY_CALL
	case OutcomeWaitingConfirmationNeeded:
		return adminv1.AdmitOutcome_ADMIT_OUTCOME_WAITING_CONFIRMATION_NEEDED
	case OutcomeAlreadyAdmitted:
		return adminv1.AdmitOutcome_ADMIT_OUTCOME_ALREADY_ADMITTED
	default:
		return adminv1.AdmitOutcome_ADMIT_OUTCOME_NOT_FOUND
	}
}
