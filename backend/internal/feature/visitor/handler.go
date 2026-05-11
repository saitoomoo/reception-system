package visitor

import (
	"context"
	"fmt"
	"log/slog"
	"strconv"

	"connectrpc.com/connect"
	visitorv1 "reception-system/gen/go/visitor/v1"
	"reception-system/gen/go/visitor/v1/visitorv1connect"
	"reception-system/internal/pkg/connecterr"
)

type Handler struct {
	visitorv1connect.UnimplementedVisitorServiceHandler
	repo   *Repository
	logger *slog.Logger
}

func NewHandler(repo *Repository, logger *slog.Logger) *Handler {
	return &Handler{repo: repo, logger: logger}
}

func (h *Handler) CreateVisitor(
	ctx context.Context,
	req *connect.Request[visitorv1.CreateVisitorRequest],
) (*connect.Response[visitorv1.CreateVisitorResponse], error) {
	nicknameLen := len([]rune(req.Msg.Nickname))
	if nicknameLen < 1 || nicknameLen > 20 {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("nickname must be 1–20 characters"))
	}
	if len(req.Msg.Pin) != 4 {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("pin must be 4 digits"))
	}
	for _, c := range req.Msg.Pin {
		if c < '0' || c > '9' {
			return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("pin must be digits only"))
		}
	}

	result, err := h.repo.Create(ctx, req.Msg.Nickname, req.Msg.Pin)
	if err != nil {
		h.logger.Error("create visitor", slog.Any("error", err))
		return nil, connecterr.Convert(err)
	}

	return connect.NewResponse(&visitorv1.CreateVisitorResponse{
		VisitorId:       strconv.FormatInt(result.VisitorID, 10),
		ReceptionNumber: result.ReceptionNumber,
	}), nil
}

func (h *Handler) AuthenticateVisitor(
	ctx context.Context,
	req *connect.Request[visitorv1.AuthenticateVisitorRequest],
) (*connect.Response[visitorv1.AuthenticateVisitorResponse], error) {
	if req.Msg.ReceptionNumber == "" || req.Msg.Pin == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("reception_number and pin are required"))
	}

	visitorID, err := h.repo.Authenticate(ctx, req.Msg.ReceptionNumber, req.Msg.Pin)
	if err != nil {
		h.logger.Info("authenticate visitor failed")
		return nil, connecterr.Convert(err)
	}

	return connect.NewResponse(&visitorv1.AuthenticateVisitorResponse{
		VisitorId:       strconv.FormatInt(visitorID, 10),
		ReceptionNumber: req.Msg.ReceptionNumber,
	}), nil
}

func (h *Handler) RegisterPushSubscription(
	ctx context.Context,
	req *connect.Request[visitorv1.RegisterPushSubscriptionRequest],
) (*connect.Response[visitorv1.RegisterPushSubscriptionResponse], error) {
	visitorID, err := strconv.ParseInt(req.Msg.VisitorId, 10, 64)
	if err != nil || visitorID <= 0 {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid visitor_id"))
	}
	if req.Msg.Endpoint == "" || req.Msg.P256DhKey == "" || req.Msg.AuthKey == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("endpoint, p256dh_key, and auth_key are required"))
	}

	if err := h.repo.UpsertPushSubscription(ctx, visitorID, req.Msg.Endpoint, req.Msg.P256DhKey, req.Msg.AuthKey); err != nil {
		h.logger.Error("upsert push subscription", slog.Any("error", err))
		return nil, connecterr.Convert(err)
	}

	return connect.NewResponse(&visitorv1.RegisterPushSubscriptionResponse{}), nil
}

func (h *Handler) GetMyProfile(
	ctx context.Context,
	req *connect.Request[visitorv1.GetMyProfileRequest],
) (*connect.Response[visitorv1.GetMyProfileResponse], error) {
	visitorID, err := strconv.ParseInt(req.Msg.VisitorId, 10, 64)
	if err != nil || visitorID <= 0 {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid visitor_id"))
	}

	v, err := h.repo.GetByID(ctx, visitorID)
	if err != nil {
		return nil, connecterr.Convert(err)
	}

	return connect.NewResponse(&visitorv1.GetMyProfileResponse{
		VisitorId:       strconv.FormatInt(v.ID, 10),
		ReceptionNumber: v.ReceptionNumber,
		Nickname:        v.Nickname,
		CreatedAt:       v.CreatedAt.Time.Format("2006-01-02T15:04:05Z"),
	}), nil
}
