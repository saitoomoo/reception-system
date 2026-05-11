package booth

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"

	"connectrpc.com/connect"
	adminv1 "reception-system/gen/go/admin/v1"
	"reception-system/gen/go/admin/v1/adminv1connect"
	boothv1 "reception-system/gen/go/booth/v1"
	"reception-system/gen/go/booth/v1/boothv1connect"
	"reception-system/internal/pkg/auth"
	"reception-system/internal/pkg/connecterr"
)

type Handler struct {
	boothv1connect.UnimplementedBoothServiceHandler
	repo   *Repository
	logger *slog.Logger
}

func NewHandler(repo *Repository, logger *slog.Logger) *Handler {
	return &Handler{repo: repo, logger: logger}
}

// StaffHandler implements the staff-side booth RPCs (LoginAsStaff, CallTicket, CallNextTickets).
// It is combined with admission.StaffHandler to register a single StaffService in main.go.
type StaffHandler struct {
	adminv1connect.UnimplementedStaffServiceHandler
	repo          *Repository
	sessionSecret string
	logger        *slog.Logger
}

func NewStaffHandler(repo *Repository, sessionSecret string, logger *slog.Logger) *StaffHandler {
	return &StaffHandler{repo: repo, sessionSecret: sessionSecret, logger: logger}
}

func (h *StaffHandler) LoginAsStaff(
	ctx context.Context,
	req *connect.Request[adminv1.LoginAsStaffRequest],
) (*connect.Response[adminv1.LoginAsStaffResponse], error) {
	boothID, err := strconv.ParseInt(req.Msg.BoothId, 10, 64)
	if err != nil || boothID <= 0 {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid booth_id"))
	}
	if req.Msg.Password == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("password is required"))
	}

	b, err := h.repo.AuthenticateStaff(ctx, boothID, req.Msg.Password)
	if err != nil {
		return nil, connecterr.Convert(err)
	}

	session := auth.Session{BoothID: b.ID, Role: auth.RoleStaff}
	resp := connect.NewResponse(&adminv1.LoginAsStaffResponse{
		BoothId:   strconv.FormatInt(b.ID, 10),
		BoothName: b.Name,
	})
	auth.SetStaffCookie(resp.Header(), session, h.sessionSecret)
	return resp, nil
}

func (h *StaffHandler) CallTicket(
	ctx context.Context,
	req *connect.Request[adminv1.CallTicketRequest],
) (*connect.Response[adminv1.CallTicketResponse], error) {
	_, boothID, err := h.requireStaffSession(req.Header())
	if err != nil {
		return nil, err
	}

	ticketID, err := strconv.ParseInt(req.Msg.TicketId, 10, 64)
	if err != nil || ticketID <= 0 {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid ticket_id"))
	}

	if err := h.repo.CallTicket(ctx, ticketID, boothID); err != nil {
		return nil, connecterr.Convert(err)
	}

	return connect.NewResponse(&adminv1.CallTicketResponse{}), nil
}

func (h *StaffHandler) CallNextTickets(
	ctx context.Context,
	req *connect.Request[adminv1.CallNextTicketsRequest],
) (*connect.Response[adminv1.CallNextTicketsResponse], error) {
	_, boothID, err := h.requireStaffSession(req.Header())
	if err != nil {
		return nil, err
	}

	if req.Msg.Count <= 0 {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("count must be >= 1"))
	}

	ids, err := h.repo.CallNextTickets(ctx, boothID, req.Msg.Count)
	if err != nil {
		h.logger.Error("call next tickets", slog.Any("error", err))
		return nil, connecterr.Convert(err)
	}

	strIDs := make([]string, len(ids))
	for i, id := range ids {
		strIDs[i] = strconv.FormatInt(id, 10)
	}

	return connect.NewResponse(&adminv1.CallNextTicketsResponse{TicketIds: strIDs}), nil
}

func (h *StaffHandler) GetStaffSession(
	ctx context.Context,
	req *connect.Request[adminv1.GetStaffSessionRequest],
) (*connect.Response[adminv1.GetStaffSessionResponse], error) {
	_, boothID, err := h.requireStaffSession(req.Header())
	if err != nil {
		return nil, err
	}

	b, err := h.repo.GetBoothByID(ctx, boothID)
	if err != nil {
		return nil, connecterr.Convert(err)
	}

	return connect.NewResponse(&adminv1.GetStaffSessionResponse{
		BoothId:   strconv.FormatInt(boothID, 10),
		BoothName: b.Booth.Name,
	}), nil
}

func (h *StaffHandler) ListTicketsByBooth(
	ctx context.Context,
	req *connect.Request[adminv1.ListTicketsByBoothRequest],
) (*connect.Response[adminv1.ListTicketsByBoothResponse], error) {
	_, boothID, err := h.requireStaffSession(req.Header())
	if err != nil {
		return nil, err
	}

	rows, err := h.repo.ListTicketsForStaff(ctx, boothID)
	if err != nil {
		h.logger.Error("list tickets for staff", slog.Any("error", err))
		return nil, connecterr.Convert(err)
	}

	tickets := make([]*adminv1.StaffTicket, len(rows))
	for i, row := range rows {
		tickets[i] = &adminv1.StaffTicket{
			TicketId:         strconv.FormatInt(row.ID, 10),
			SequenceInBooth:  row.SequenceInBooth,
			ReceptionNumber:  row.ReceptionNumber,
			Nickname:         row.Nickname,
			ParticipantCount: row.ParticipantCount,
			Status:           row.Status,
			IsPriorityCall:   row.IsPriorityCall,
			CreatedAt:        row.CreatedAt.Time.UTC().Format("2006-01-02T15:04:05Z"),
		}
	}

	return connect.NewResponse(&adminv1.ListTicketsByBoothResponse{Tickets: tickets}), nil
}

// requireStaffSession validates the staff session cookie and returns the authenticated booth_id.
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

func (h *Handler) ListBooths(
	ctx context.Context,
	req *connect.Request[boothv1.ListBoothsRequest],
) (*connect.Response[boothv1.ListBoothsResponse], error) {
	booths, err := h.repo.ListBooths(ctx)
	if err != nil {
		h.logger.Error("list booths", slog.Any("error", err))
		return nil, connecterr.Convert(err)
	}

	summaries := make([]*boothv1.BoothSummary, len(booths))
	for i, b := range booths {
		summaries[i] = toBoothSummary(b)
	}

	return connect.NewResponse(&boothv1.ListBoothsResponse{Booths: summaries}), nil
}

func (h *Handler) GetBoothStatus(
	ctx context.Context,
	req *connect.Request[boothv1.GetBoothStatusRequest],
) (*connect.Response[boothv1.GetBoothStatusResponse], error) {
	boothID, err := strconv.ParseInt(req.Msg.BoothId, 10, 64)
	if err != nil || boothID <= 0 {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid booth_id"))
	}

	s, err := h.repo.GetBoothStatus(ctx, boothID)
	if err != nil {
		return nil, connecterr.Convert(err)
	}

	return connect.NewResponse(&boothv1.GetBoothStatusResponse{
		BoothId:              strconv.FormatInt(s.Booth.ID, 10),
		BoothName:            s.Booth.Name,
		BoothLocation:        s.Booth.Location,
		IsAccepting:          s.Booth.IsAccepting,
		IsOpen:               s.IsOpen,
		WaitingCount:         s.WaitingCount,
		PendingCount:         s.PendingCount,
		CalledSequence:       s.CalledSequence,
		EstimatedWaitMinutes: s.EstimatedWaitMinutes,
	}), nil
}

func (h *Handler) GetBooth(
	ctx context.Context,
	req *connect.Request[boothv1.GetBoothRequest],
) (*connect.Response[boothv1.GetBoothResponse], error) {
	boothID, err := strconv.ParseInt(req.Msg.BoothId, 10, 64)
	if err != nil || boothID <= 0 {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid booth_id"))
	}

	b, err := h.repo.GetBoothByID(ctx, boothID)
	if err != nil {
		return nil, connecterr.Convert(err)
	}

	return connect.NewResponse(&boothv1.GetBoothResponse{Booth: toBoothDetail(b)}), nil
}

func toBoothSummary(b BoothWithCount) *boothv1.BoothSummary {
	s := &boothv1.BoothSummary{
		Id:                   strconv.FormatInt(b.Booth.ID, 10),
		Name:                 b.Booth.Name,
		Location:             b.Booth.Location,
		ExperienceType:       b.Booth.ExperienceType,
		IsAccepting:          b.Booth.IsAccepting,
		WaitingCount:         b.WaitingCount,
		EstimatedWaitMinutes: b.EstimatedWaitMinutes,
	}
	if b.Booth.CoverImageUrl != nil {
		s.CoverImageUrl = *b.Booth.CoverImageUrl
	}
	if b.Booth.OpenAt.Valid {
		s.OpenAt = b.Booth.OpenAt.Time.UTC().Format("2006-01-02T15:04:05Z")
	}
	if b.Booth.CloseAt.Valid {
		s.CloseAt = b.Booth.CloseAt.Time.UTC().Format("2006-01-02T15:04:05Z")
	}
	return s
}

func toBoothDetail(b BoothWithCount) *boothv1.BoothDetail {
	d := &boothv1.BoothDetail{
		Id:                   strconv.FormatInt(b.Booth.ID, 10),
		Name:                 b.Booth.Name,
		Description:          b.Booth.Description,
		Location:             b.Booth.Location,
		ExperienceType:       b.Booth.ExperienceType,
		IsAccepting:          b.Booth.IsAccepting,
		WaitingCount:         b.WaitingCount,
		EstimatedWaitMinutes: b.EstimatedWaitMinutes,
		MaxParticipantsPerTicket: b.Booth.MaxParticipantsPerTicket,
		AllowPrivateMatch:    b.Booth.AllowPrivateMatch,
		CooldownMinutes:      b.Booth.CooldownMinutes,
	}
	if b.Booth.CoverImageUrl != nil {
		d.CoverImageUrl = *b.Booth.CoverImageUrl
	}
	if b.Booth.IntroVideoUrl != nil {
		d.IntroVideoUrl = *b.Booth.IntroVideoUrl
	}
	if b.Booth.SurveyUrl != nil {
		d.SurveyUrl = *b.Booth.SurveyUrl
	}
	if b.Booth.OpenAt.Valid {
		d.OpenAt = b.Booth.OpenAt.Time.UTC().Format("2006-01-02T15:04:05Z")
	}
	if b.Booth.CloseAt.Valid {
		d.CloseAt = b.Booth.CloseAt.Time.UTC().Format("2006-01-02T15:04:05Z")
	}
	if b.Booth.TargetPartySize != nil {
		d.TargetPartySize = *b.Booth.TargetPartySize
	}
	if b.Booth.EstimatedMinutesPerPerson != nil {
		d.EstimatedMinutesPerPerson = *b.Booth.EstimatedMinutesPerPerson
	}
	if b.Booth.EstimatedMinutesPerSession != nil {
		d.EstimatedMinutesPerSession = *b.Booth.EstimatedMinutesPerSession
	}
	return d
}
