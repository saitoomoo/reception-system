package match

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"

	"connectrpc.com/connect"
	adminv1 "reception-system/gen/go/admin/v1"
	"reception-system/internal/pkg/auth"
	"reception-system/internal/pkg/connecterr"
)

// StaffHandler implements the match-related StaffService RPCs.
// It is embedded in the combinedStaffHandler in main.go.
type StaffHandler struct {
	svc           *Service
	sessionSecret string
	logger        *slog.Logger
}

func NewStaffHandler(svc *Service, sessionSecret string, logger *slog.Logger) *StaffHandler {
	return &StaffHandler{svc: svc, sessionSecret: sessionSecret, logger: logger}
}

func (h *StaffHandler) ForceStartMatch(
	ctx context.Context,
	req *connect.Request[adminv1.ForceStartMatchRequest],
) (*connect.Response[adminv1.ForceStartMatchResponse], error) {
	_, boothID, err := h.requireStaffSession(req.Header())
	if err != nil {
		return nil, err
	}

	sessionID, err := h.svc.ForceStartMatch(ctx, boothID)
	if err != nil {
		if errors.Is(err, ErrInsufficientParticipants) {
			return nil, connect.NewError(connect.CodeFailedPrecondition, err)
		}
		if errors.Is(err, ErrNotMatchmakingBooth) {
			return nil, connect.NewError(connect.CodeFailedPrecondition, err)
		}
		h.logger.Error("force start match", slog.Int64("booth_id", boothID), slog.Any("error", err))
		return nil, connecterr.Convert(err)
	}

	return connect.NewResponse(&adminv1.ForceStartMatchResponse{
		SessionId: strconv.FormatInt(sessionID, 10),
	}), nil
}

func (h *StaffHandler) CallPrivateMatch(
	ctx context.Context,
	req *connect.Request[adminv1.CallPrivateMatchRequest],
) (*connect.Response[adminv1.CallPrivateMatchResponse], error) {
	_, boothID, err := h.requireStaffSession(req.Header())
	if err != nil {
		return nil, err
	}

	ticketID, err := strconv.ParseInt(req.Msg.TicketId, 10, 64)
	if err != nil || ticketID <= 0 {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid ticket_id"))
	}

	if err := h.svc.CallPrivateMatch(ctx, ticketID, boothID); err != nil {
		if errors.Is(err, ErrNoPrivateSession) {
			return nil, connect.NewError(connect.CodeFailedPrecondition, err)
		}
		return nil, connecterr.Convert(err)
	}

	return connect.NewResponse(&adminv1.CallPrivateMatchResponse{}), nil
}

func (h *StaffHandler) CompleteMatchSession(
	ctx context.Context,
	req *connect.Request[adminv1.CompleteMatchSessionRequest],
) (*connect.Response[adminv1.CompleteMatchSessionResponse], error) {
	_, boothID, err := h.requireStaffSession(req.Header())
	if err != nil {
		return nil, err
	}

	sessionID, err := strconv.ParseInt(req.Msg.SessionId, 10, 64)
	if err != nil || sessionID <= 0 {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid session_id"))
	}

	if err := h.svc.CompleteMatchSession(ctx, sessionID, boothID); err != nil {
		return nil, connecterr.Convert(err)
	}

	return connect.NewResponse(&adminv1.CompleteMatchSessionResponse{}), nil
}

func (h *StaffHandler) GetMatchQueueStatus(
	ctx context.Context,
	req *connect.Request[adminv1.GetMatchQueueStatusRequest],
) (*connect.Response[adminv1.GetMatchQueueStatusResponse], error) {
	_, boothID, err := h.requireStaffSession(req.Header())
	if err != nil {
		return nil, err
	}

	status, err := h.svc.GetMatchQueueStatus(ctx, boothID)
	if err != nil {
		return nil, connecterr.Convert(err)
	}

	public := make([]*adminv1.PublicWaitingGroup, len(status.PublicWaiting))
	for i, t := range status.PublicWaiting {
		public[i] = &adminv1.PublicWaitingGroup{
			TicketId:        strconv.FormatInt(t.ID, 10),
			SequenceInBooth: t.SequenceInBooth,
			ParticipantCount: t.ParticipantCount,
		}
	}

	private := make([]*adminv1.PrivateWaitingGroup, len(status.PrivateWaiting))
	for i, t := range status.PrivateWaiting {
		private[i] = &adminv1.PrivateWaitingGroup{
			TicketId:        strconv.FormatInt(t.ID, 10),
			SequenceInBooth: t.SequenceInBooth,
			ParticipantCount: t.ParticipantCount,
			ReceptionNumber: t.ReceptionNumber,
			Nickname:        t.Nickname,
		}
	}

	active := make([]*adminv1.MatchQueueSession, len(status.ActiveSessions))
	for i, s := range status.ActiveSessions {
		sess := &adminv1.MatchQueueSession{
			SessionId:       strconv.FormatInt(s.ID, 10),
			Mode:            s.Mode,
			Status:          s.Status,
			ParticipantCount: s.ParticipantCount,
		}
		if s.CreatedAt.Valid {
			sess.CreatedAt = s.CreatedAt.Time.UTC().Format("2006-01-02T15:04:05Z")
		}
		active[i] = sess
	}

	return connect.NewResponse(&adminv1.GetMatchQueueStatusResponse{
		PublicWaiting:       public,
		PublicWaitingTotal:  status.PublicWaitingTotal,
		TargetPartySize:     status.TargetPartySize,
		MinPartySize:        status.MinPartySize,
		PrivateWaiting:      private,
		ActiveSessions:      active,
	}), nil
}

func (h *StaffHandler) requireStaffSession(header http.Header) (*auth.Session, int64, error) {
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
