package admin

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"connectrpc.com/connect"
	"github.com/jackc/pgx/v5/pgtype"
	"golang.org/x/crypto/bcrypt"
	adminv1 "reception-system/gen/go/admin/v1"
	"reception-system/gen/go/admin/v1/adminv1connect"
	"reception-system/internal/db"
	"reception-system/internal/feature/notification"
	"reception-system/internal/pkg/auth"
	"reception-system/internal/pkg/connecterr"
)

type AdminHandler struct {
	adminv1connect.UnimplementedAdminServiceHandler
	repo          *Repository
	notifRepo     *notification.Repository
	sessionSecret string
	logger        *slog.Logger
}

func NewAdminHandler(repo *Repository, notifRepo *notification.Repository, sessionSecret string, logger *slog.Logger) *AdminHandler {
	return &AdminHandler{repo: repo, notifRepo: notifRepo, sessionSecret: sessionSecret, logger: logger}
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

func (h *AdminHandler) ListAdminBooths(
	ctx context.Context,
	req *connect.Request[adminv1.ListAdminBoothsRequest],
) (*connect.Response[adminv1.ListAdminBoothsResponse], error) {
	if err := h.requireAdminSession(req.Header()); err != nil {
		return nil, err
	}

	booths, err := h.repo.ListAllBooths(ctx)
	if err != nil {
		return nil, connecterr.Convert(err)
	}

	out := make([]*adminv1.AdminBooth, len(booths))
	for i, b := range booths {
		out[i] = boothToProto(b)
	}
	return connect.NewResponse(&adminv1.ListAdminBoothsResponse{Booths: out}), nil
}

func (h *AdminHandler) CreateBooth(
	ctx context.Context,
	req *connect.Request[adminv1.CreateBoothRequest],
) (*connect.Response[adminv1.CreateBoothResponse], error) {
	if err := h.requireAdminSession(req.Header()); err != nil {
		return nil, err
	}

	m := req.Msg
	if m.Name == "" || m.StaffPassword == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("name and staff_password are required"))
	}
	if m.ExperienceType == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("experience_type is required"))
	}

	hash, err := bcryptHash(m.StaffPassword)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	p, err := buildCreateBoothParams(m, hash)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	booth, err := h.repo.CreateBooth(ctx, p)
	if err != nil {
		return nil, connecterr.Convert(err)
	}
	return connect.NewResponse(&adminv1.CreateBoothResponse{Booth: boothToProto(booth)}), nil
}

func (h *AdminHandler) ArchiveBooth(
	ctx context.Context,
	req *connect.Request[adminv1.ArchiveBoothRequest],
) (*connect.Response[adminv1.ArchiveBoothResponse], error) {
	if err := h.requireAdminSession(req.Header()); err != nil {
		return nil, err
	}
	boothID, err := strconv.ParseInt(req.Msg.BoothId, 10, 64)
	if err != nil || boothID <= 0 {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid booth_id"))
	}
	if err := h.repo.ArchiveBooth(ctx, boothID); err != nil {
		return nil, connecterr.Convert(err)
	}
	return connect.NewResponse(&adminv1.ArchiveBoothResponse{}), nil
}

func (h *AdminHandler) UnarchiveBooth(
	ctx context.Context,
	req *connect.Request[adminv1.UnarchiveBoothRequest],
) (*connect.Response[adminv1.UnarchiveBoothResponse], error) {
	if err := h.requireAdminSession(req.Header()); err != nil {
		return nil, err
	}
	boothID, err := strconv.ParseInt(req.Msg.BoothId, 10, 64)
	if err != nil || boothID <= 0 {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid booth_id"))
	}
	if err := h.repo.UnarchiveBooth(ctx, boothID); err != nil {
		return nil, connecterr.Convert(err)
	}
	return connect.NewResponse(&adminv1.UnarchiveBoothResponse{}), nil
}

func (h *AdminHandler) DeleteBooth(
	ctx context.Context,
	req *connect.Request[adminv1.DeleteBoothRequest],
) (*connect.Response[adminv1.DeleteBoothResponse], error) {
	if err := h.requireAdminSession(req.Header()); err != nil {
		return nil, err
	}
	boothID, err := strconv.ParseInt(req.Msg.BoothId, 10, 64)
	if err != nil || boothID <= 0 {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid booth_id"))
	}
	if err := h.repo.DeleteBooth(ctx, boothID); err != nil {
		if errors.Is(err, ErrBoothHasActiveTickets) {
			return nil, connect.NewError(connect.CodeFailedPrecondition, fmt.Errorf("booth has active tickets"))
		}
		return nil, connecterr.Convert(err)
	}
	return connect.NewResponse(&adminv1.DeleteBoothResponse{}), nil
}

func (h *AdminHandler) UpdateBoothPassword(
	ctx context.Context,
	req *connect.Request[adminv1.UpdateBoothPasswordRequest],
) (*connect.Response[adminv1.UpdateBoothPasswordResponse], error) {
	if err := h.requireAdminSession(req.Header()); err != nil {
		return nil, err
	}
	boothID, err := strconv.ParseInt(req.Msg.BoothId, 10, 64)
	if err != nil || boothID <= 0 {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid booth_id"))
	}
	if req.Msg.NewPassword == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("new_password is required"))
	}
	if err := h.repo.UpdateBoothPassword(ctx, boothID, req.Msg.NewPassword); err != nil {
		return nil, connecterr.Convert(err)
	}
	return connect.NewResponse(&adminv1.UpdateBoothPasswordResponse{}), nil
}

func (h *AdminHandler) GetRiskExplanation(
	ctx context.Context,
	req *connect.Request[adminv1.GetRiskExplanationRequest],
) (*connect.Response[adminv1.GetRiskExplanationResponse], error) {
	if err := h.requireAdminSession(req.Header()); err != nil {
		return nil, err
	}
	row, err := h.repo.GetRiskExplanation(ctx)
	if err != nil {
		return nil, connecterr.Convert(err)
	}
	resp := &adminv1.GetRiskExplanationResponse{Body: row.Body}
	if row.UpdatedAt.Valid {
		resp.UpdatedAt = row.UpdatedAt.Time.UTC().Format("2006-01-02T15:04:05Z")
	}
	return connect.NewResponse(resp), nil
}

func (h *AdminHandler) UpdateRiskExplanation(
	ctx context.Context,
	req *connect.Request[adminv1.UpdateRiskExplanationRequest],
) (*connect.Response[adminv1.UpdateRiskExplanationResponse], error) {
	if err := h.requireAdminSession(req.Header()); err != nil {
		return nil, err
	}
	if req.Msg.Body == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("body is required"))
	}
	row, err := h.repo.SetRiskExplanation(ctx, req.Msg.Body)
	if err != nil {
		return nil, connecterr.Convert(err)
	}
	resp := &adminv1.UpdateRiskExplanationResponse{}
	if row.UpdatedAt.Valid {
		resp.UpdatedAt = row.UpdatedAt.Time.UTC().Format("2006-01-02T15:04:05Z")
	}
	return connect.NewResponse(resp), nil
}

func (h *AdminHandler) ListNotificationTemplates(
	ctx context.Context,
	req *connect.Request[adminv1.ListNotificationTemplatesRequest],
) (*connect.Response[adminv1.ListNotificationTemplatesResponse], error) {
	if err := h.requireAdminSession(req.Header()); err != nil {
		return nil, err
	}
	items, err := h.notifRepo.ListTemplates(ctx)
	if err != nil {
		h.logger.Error("list notification templates", slog.Any("error", err))
		return nil, connecterr.Convert(err)
	}
	templates := make([]*adminv1.NotificationTemplate, len(items))
	for i, t := range items {
		tmpl := &adminv1.NotificationTemplate{Key: t.Key, Title: t.Title, Body: t.Body}
		if t.IconURL != nil {
			tmpl.IconUrl = *t.IconURL
		}
		templates[i] = tmpl
	}
	return connect.NewResponse(&adminv1.ListNotificationTemplatesResponse{Templates: templates}), nil
}

func (h *AdminHandler) UpdateNotificationTemplate(
	ctx context.Context,
	req *connect.Request[adminv1.UpdateNotificationTemplateRequest],
) (*connect.Response[adminv1.UpdateNotificationTemplateResponse], error) {
	if err := h.requireAdminSession(req.Header()); err != nil {
		return nil, err
	}
	if req.Msg.Key == "" || req.Msg.Title == "" || req.Msg.Body == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("key, title, and body are required"))
	}
	var iconURL *string
	if req.Msg.IconUrl != "" {
		iconURL = &req.Msg.IconUrl
	}
	updated, err := h.notifRepo.UpdateTemplate(ctx, req.Msg.Key, req.Msg.Title, req.Msg.Body, iconURL)
	if err != nil {
		h.logger.Error("update notification template", slog.Any("error", err))
		return nil, connecterr.Convert(err)
	}
	tmpl := &adminv1.NotificationTemplate{Key: updated.Key, Title: updated.Title, Body: updated.Body}
	if updated.IconURL != nil {
		tmpl.IconUrl = *updated.IconURL
	}
	return connect.NewResponse(&adminv1.UpdateNotificationTemplateResponse{Template: tmpl}), nil
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

func bcryptHash(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", fmt.Errorf("bcrypt hash: %w", err)
	}
	return string(hash), nil
}

func buildCreateBoothParams(msg *adminv1.CreateBoothRequest, passwordHash string) (db.CreateBoothParams, error) {
	p := db.CreateBoothParams{
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
		StaffPasswordHash:        passwordHash,
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

func boothToProto(b db.Booth) *adminv1.AdminBooth {
	out := &adminv1.AdminBooth{
		BoothId:                    strconv.FormatInt(b.ID, 10),
		Name:                       b.Name,
		Description:                b.Description,
		Location:                   b.Location,
		ExperienceType:             b.ExperienceType,
		MaxParticipantsPerTicket:   b.MaxParticipantsPerTicket,
		ConcurrentCapacity:         b.ConcurrentCapacity,
		AllowPrivateMatch:          b.AllowPrivateMatch,
		CallThreshold:              b.CallThreshold,
		CallResendMinutes:          b.CallResendMinutes,
		CooldownMinutes:            b.CooldownMinutes,
		IsAccepting:                b.IsAccepting,
		IsArchived:                 b.IsArchived,
		StaffPasswordUpdatedAt:     b.StaffPasswordUpdatedAt.Time.Format(time.RFC3339),
	}
	if b.OpenAt.Valid {
		out.OpenAt = b.OpenAt.Time.Format(time.RFC3339)
	}
	if b.CloseAt.Valid {
		out.CloseAt = b.CloseAt.Time.Format(time.RFC3339)
	}
	if b.TargetPartySize != nil {
		out.TargetPartySize = *b.TargetPartySize
	}
	if b.MinPartySize != nil {
		out.MinPartySize = *b.MinPartySize
	}
	if b.EstimatedMinutesPerPerson != nil {
		out.EstimatedMinutesPerPerson = *b.EstimatedMinutesPerPerson
	}
	if b.EstimatedMinutesPerSession != nil {
		out.EstimatedMinutesPerSession = *b.EstimatedMinutesPerSession
	}
	if b.CoverImageUrl != nil {
		out.CoverImageUrl = *b.CoverImageUrl
	}
	if b.IntroVideoUrl != nil {
		out.IntroVideoUrl = *b.IntroVideoUrl
	}
	if b.SurveyUrl != nil {
		out.SurveyUrl = *b.SurveyUrl
	}
	return out
}
