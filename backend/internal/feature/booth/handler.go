package booth

import (
	"context"
	"fmt"
	"log/slog"
	"strconv"

	"connectrpc.com/connect"
	boothv1 "reception-system/gen/go/booth/v1"
	"reception-system/gen/go/booth/v1/boothv1connect"
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
