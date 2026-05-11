package admin

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"connectrpc.com/connect"
	"github.com/jackc/pgx/v5/pgtype"
	adminv1 "reception-system/gen/go/admin/v1"
	"reception-system/gen/go/admin/v1/adminv1connect"
	"reception-system/internal/db"
	"reception-system/internal/pkg/auth"
	"reception-system/internal/pkg/connecterr"
)

type AdminHandler struct {
	adminv1connect.UnimplementedAdminServiceHandler
	repo          *Repository
	sessionSecret string
	logger        *slog.Logger
}

func NewAdminHandler(repo *Repository, sessionSecret string, logger *slog.Logger) *AdminHandler {
	return &AdminHandler{repo: repo, sessionSecret: sessionSecret, logger: logger}
}

func (h *AdminHandler) LoginAsGlobalAdmin(
	ctx context.Context,
	req *connect.Request[adminv1.LoginAsGlobalAdminRequest],
) (*connect.Response[adminv1.LoginAsGlobalAdminResponse], error) {
	if req.Msg.Name == "" || req.Msg.Password == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("name and password are required"))
	}

	admin, err := h.repo.AuthenticateGlobalAdmin(ctx, req.Msg.Name, req.Msg.Password)
	if err != nil {
		return nil, connecterr.Convert(err)
	}
	_ = admin

	session := auth.Session{BoothID: 0, Role: auth.RoleGlobalAdmin}
	resp := connect.NewResponse(&adminv1.LoginAsGlobalAdminResponse{})
	auth.SetAdminCookie(resp.Header(), session, h.sessionSecret)
	return resp, nil
}

func (h *AdminHandler) GetDashboard(
	ctx context.Context,
	req *connect.Request[adminv1.GetDashboardRequest],
) (*connect.Response[adminv1.GetDashboardResponse], error) {
	if err := h.requireAdminSession(req.Header()); err != nil {
		return nil, err
	}

	stats, err := h.repo.GetDashboard(ctx)
	if err != nil {
		h.logger.Error("get dashboard", slog.Any("error", err))
		return nil, connecterr.Convert(err)
	}

	boothStats := make([]*adminv1.BoothStats, len(stats))
	for i, s := range stats {
		boothStats[i] = &adminv1.BoothStats{
			BoothId:       strconv.FormatInt(s.BoothID, 10),
			BoothName:     s.BoothName,
			WaitingCount:  s.WaitingCount,
			PendingCount:  s.PendingCount,
			AdmittedToday: s.AdmittedToday,
		}
	}

	return connect.NewResponse(&adminv1.GetDashboardResponse{Booths: boothStats}), nil
}

func (h *AdminHandler) UpdateBooth(
	ctx context.Context,
	req *connect.Request[adminv1.UpdateBoothRequest],
) (*connect.Response[adminv1.UpdateBoothResponse], error) {
	if err := h.requireAdminSession(req.Header()); err != nil {
		return nil, err
	}

	boothID, err := strconv.ParseInt(req.Msg.BoothId, 10, 64)
	if err != nil || boothID <= 0 {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid booth_id"))
	}

	params, err := buildUpdateBoothParams(boothID, req.Msg)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	if err := h.repo.UpdateBooth(ctx, params); err != nil {
		return nil, connecterr.Convert(err)
	}

	return connect.NewResponse(&adminv1.UpdateBoothResponse{}), nil
}

func (h *AdminHandler) requireAdminSession(header http.Header) error {
	r := &http.Request{Header: header}
	_, err := auth.ParseAdminSession(r, h.sessionSecret)
	if err != nil {
		return connect.NewError(connect.CodePermissionDenied, fmt.Errorf("admin session required: %w", err))
	}
	return nil
}

func buildUpdateBoothParams(boothID int64, msg *adminv1.UpdateBoothRequest) (db.UpdateBoothParams, error) {
	p := db.UpdateBoothParams{
		ID:                       boothID,
		Name:                     msg.Name,
		Description:              msg.Description,
		Location:                 msg.Location,
		ExperienceType:           msg.ExperienceType,
		MaxParticipantsPerTicket: msg.MaxParticipantsPerTicket,
		ConcurrentCapacity:       msg.ConcurrentCapacity,
		AllowPrivateMatch:        msg.AllowPrivateMatch,
		CallThreshold:            msg.CallThreshold,
		CallResendMinutes:        msg.CallResendMinutes,
		CooldownMinutes:          msg.CooldownMinutes,
		IsAccepting:              msg.IsAccepting,
	}

	if msg.OpenAt != "" {
		t, err := time.Parse(time.RFC3339, msg.OpenAt)
		if err != nil {
			return p, fmt.Errorf("invalid open_at: %w", err)
		}
		p.OpenAt = pgtype.Timestamptz{Time: t, Valid: true}
	}
	if msg.CloseAt != "" {
		t, err := time.Parse(time.RFC3339, msg.CloseAt)
		if err != nil {
			return p, fmt.Errorf("invalid close_at: %w", err)
		}
		p.CloseAt = pgtype.Timestamptz{Time: t, Valid: true}
	}

	if msg.TargetPartySize != 0 {
		v := msg.TargetPartySize
		p.TargetPartySize = &v
	}
	if msg.MinPartySize != 0 {
		v := msg.MinPartySize
		p.MinPartySize = &v
	}
	if msg.EstimatedMinutesPerPerson != 0 {
		v := msg.EstimatedMinutesPerPerson
		p.EstimatedMinutesPerPerson = &v
	}
	if msg.EstimatedMinutesPerSession != 0 {
		v := msg.EstimatedMinutesPerSession
		p.EstimatedMinutesPerSession = &v
	}
	if msg.CoverImageUrl != "" {
		v := msg.CoverImageUrl
		p.CoverImageUrl = &v
	}
	if msg.IntroVideoUrl != "" {
		v := msg.IntroVideoUrl
		p.IntroVideoUrl = &v
	}
	if msg.SurveyUrl != "" {
		v := msg.SurveyUrl
		p.SurveyUrl = &v
	}

	return p, nil
}
