package ticket

import (
	"context"
	"fmt"
	"log/slog"
	"strconv"

	"connectrpc.com/connect"
	ticketv1 "reception-system/gen/go/ticket/v1"
	"reception-system/gen/go/ticket/v1/ticketv1connect"
	"reception-system/internal/feature/notification"
	"reception-system/internal/pkg/connecterr"
)

// MatchService is the interface the ticket handler uses to trigger post-create matchmaking hooks.
type MatchService interface {
	CheckAndExecuteMatch(ctx context.Context, boothID int64) error
	CreatePrivateMatchSession(ctx context.Context, ticketID, boothID int64, participantCount int32) error
}

type Handler struct {
	ticketv1connect.UnimplementedTicketServiceHandler
	repo      *Repository
	notifRepo *notification.Repository
	matchSvc  MatchService
	logger    *slog.Logger
}

func NewHandler(repo *Repository, notifRepo *notification.Repository, logger *slog.Logger) *Handler {
	return &Handler{repo: repo, notifRepo: notifRepo, logger: logger}
}

// SetMatchService injects the match service for post-create hooks.
// Called during server initialization after both ticket and match packages are wired.
func (h *Handler) SetMatchService(svc MatchService) {
	h.matchSvc = svc
}

func (h *Handler) CreateTicket(
	ctx context.Context,
	req *connect.Request[ticketv1.CreateTicketRequest],
) (*connect.Response[ticketv1.CreateTicketResponse], error) {
	visitorID, err := strconv.ParseInt(req.Msg.VisitorId, 10, 64)
	if err != nil || visitorID <= 0 {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid visitor_id"))
	}
	boothID, err := strconv.ParseInt(req.Msg.BoothId, 10, 64)
	if err != nil || boothID <= 0 {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid booth_id"))
	}
	if len(req.Msg.Participants) == 0 {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("at least one participant required"))
	}

	participants := make([]ParticipantInput, len(req.Msg.Participants))
	for i, p := range req.Msg.Participants {
		participants[i] = ParticipantInput{Age: p.Age, Name: p.Name}
	}

	var consent *ParentalConsentInput
	if req.Msg.ParentalConsent != nil {
		consent = &ParentalConsentInput{
			GuardianName:        req.Msg.ParentalConsent.GuardianName,
			ConsentTextSnapshot: req.Msg.ParentalConsent.ConsentTextSnapshot,
			UserAgent:           req.Msg.ParentalConsent.UserAgent,
			IPAddress:           req.Msg.ParentalConsent.IpAddress,
		}
	}

	result, err := h.repo.CreateTicket(ctx, CreateTicketRequest{
		VisitorID:       visitorID,
		BoothID:         boothID,
		Participants:    participants,
		MatchMode:       req.Msg.MatchMode,
		ParentalConsent: consent,
	})
	if err != nil {
		h.logger.Info("create ticket failed",
			slog.Int64("visitor_id", visitorID),
			slog.Int64("booth_id", boothID),
			slog.Any("error", err),
		)
		return nil, connecterr.Convert(err)
	}

	// Best-effort notification enqueue — does not fail the ticket creation.
	if err := h.notifRepo.EnqueueForVisitor(ctx, &result.TicketID, visitorID, "application_completed"); err != nil {
		h.logger.Error("enqueue application_completed notification", slog.Any("error", err))
	}

	// Post-create matchmaking hooks (best-effort; do not fail the ticket creation).
	if h.matchSvc != nil && result.MatchMode != "" {
		switch result.MatchMode {
		case "private":
			if err := h.matchSvc.CreatePrivateMatchSession(ctx, result.TicketID, boothID, result.ParticipantCount); err != nil {
				h.logger.Error("create private match session",
					slog.Int64("ticket_id", result.TicketID),
					slog.Any("error", err),
				)
			}
		case "public":
			if err := h.matchSvc.CheckAndExecuteMatch(ctx, boothID); err != nil {
				h.logger.Error("check and execute match",
					slog.Int64("booth_id", boothID),
					slog.Any("error", err),
				)
			}
		}
	}

	return connect.NewResponse(&ticketv1.CreateTicketResponse{
		TicketId:        strconv.FormatInt(result.TicketID, 10),
		Status:          result.Status,
		SequenceInBooth: result.SequenceInBooth,
		Position:        result.Position,
	}), nil
}

func (h *Handler) GetTicketStatus(
	ctx context.Context,
	req *connect.Request[ticketv1.GetTicketStatusRequest],
) (*connect.Response[ticketv1.GetTicketStatusResponse], error) {
	ticketID, err := strconv.ParseInt(req.Msg.TicketId, 10, 64)
	if err != nil || ticketID <= 0 {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid ticket_id"))
	}

	result, err := h.repo.GetTicketStatus(ctx, ticketID)
	if err != nil {
		return nil, connecterr.Convert(err)
	}

	resp := &ticketv1.GetTicketStatusResponse{
		TicketId:        strconv.FormatInt(result.Ticket.ID, 10),
		BoothId:         strconv.FormatInt(result.Booth.ID, 10),
		BoothName:       result.Booth.Name,
		BoothLocation:   result.Booth.Location,
		Status:          result.Ticket.Status,
		Position:        result.Position,
		SequenceInBooth: result.Ticket.SequenceInBooth,
	}
	if result.Ticket.CreatedAt.Valid {
		resp.CreatedAt = result.Ticket.CreatedAt.Time.UTC().Format("2006-01-02T15:04:05Z")
	}
	if result.MatchmakingInfo != nil {
		resp.MatchmakingInfo = &ticketv1.MatchmakingInfo{
			MatchMode:          result.MatchmakingInfo.MatchMode,
			PublicWaitingCount: result.MatchmakingInfo.PublicWaitingCount,
			TargetPartySize:    result.MatchmakingInfo.TargetPartySize,
		}
	}
	return connect.NewResponse(resp), nil
}

func (h *Handler) ListMyTickets(
	ctx context.Context,
	req *connect.Request[ticketv1.ListMyTicketsRequest],
) (*connect.Response[ticketv1.ListMyTicketsResponse], error) {
	visitorID, err := strconv.ParseInt(req.Msg.VisitorId, 10, 64)
	if err != nil || visitorID <= 0 {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid visitor_id"))
	}

	tickets, err := h.repo.ListByVisitorID(ctx, visitorID)
	if err != nil {
		h.logger.Error("list my tickets", slog.Any("error", err))
		return nil, connecterr.Convert(err)
	}

	summaries := make([]*ticketv1.TicketSummary, len(tickets))
	for i, t := range tickets {
		summaries[i] = &ticketv1.TicketSummary{
			TicketId:  strconv.FormatInt(t.Ticket.ID, 10),
			BoothId:   strconv.FormatInt(t.Booth.ID, 10),
			BoothName: t.Booth.Name,
			Status:    t.Ticket.Status,
			Position:  t.Position,
		}
	}

	return connect.NewResponse(&ticketv1.ListMyTicketsResponse{Tickets: summaries}), nil
}

func (h *Handler) CancelTicket(
	ctx context.Context,
	req *connect.Request[ticketv1.CancelTicketRequest],
) (*connect.Response[ticketv1.CancelTicketResponse], error) {
	ticketID, err := strconv.ParseInt(req.Msg.TicketId, 10, 64)
	if err != nil || ticketID <= 0 {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid ticket_id"))
	}
	visitorID, err := strconv.ParseInt(req.Msg.VisitorId, 10, 64)
	if err != nil || visitorID <= 0 {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid visitor_id"))
	}

	if err := h.repo.Cancel(ctx, ticketID, visitorID); err != nil {
		return nil, connecterr.Convert(err)
	}

	return connect.NewResponse(&ticketv1.CancelTicketResponse{}), nil
}

func (h *Handler) GetTicketStatusByReceptionNumber(
	ctx context.Context,
	req *connect.Request[ticketv1.GetTicketStatusByReceptionNumberRequest],
) (*connect.Response[ticketv1.GetTicketStatusByReceptionNumberResponse], error) {
	boothID, err := strconv.ParseInt(req.Msg.BoothId, 10, 64)
	if err != nil || boothID <= 0 {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid booth_id"))
	}
	if req.Msg.ReceptionNumber == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("reception_number is required"))
	}

	result, err := h.repo.GetTicketStatusByReceptionNumber(ctx, boothID, req.Msg.ReceptionNumber)
	if err != nil {
		return nil, connecterr.Convert(err)
	}

	return connect.NewResponse(&ticketv1.GetTicketStatusByReceptionNumberResponse{
		TicketId:        strconv.FormatInt(result.Ticket.ID, 10),
		BoothName:       result.Booth.Name,
		BoothLocation:   result.Booth.Location,
		Status:          result.Ticket.Status,
		Position:        result.Position,
		SequenceInBooth: result.Ticket.SequenceInBooth,
		ReceptionNumber: result.ReceptionNumber,
	}), nil
}
