package notification

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"reception-system/internal/db"
)

// Repository handles DB operations for the notification system.
type Repository struct {
	pool    *pgxpool.Pool
	queries *db.Queries
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool, queries: db.New(pool)}
}

// PendingRow is a denormalised row returned by ListPendingNotificationLogs.
type PendingRow struct {
	LogID           int64
	TicketID        *int64
	TemplateKey     string
	Title           string
	Body            string
	IconURL         *string
	EndpointMasked  string
	VisitorID       *int64
	Nickname        *string
	ReceptionNumber *string
	Endpoint        *string
	P256dhKey       *string
	AuthKey         *string
	BoothName       *string
	BoothLocation   *string
	SequenceInBooth *int32
}

// Enqueue inserts a notification_log record in 'pending' state.
// templateKey must match an existing notification_templates.key.
// endpointMasked is the first 30 chars of the push endpoint (for audit).
// ticketID may be nil when the notification is not ticket-specific.
func (r *Repository) Enqueue(ctx context.Context, ticketID *int64, templateKey, endpointMasked string) error {
	masked := endpointMasked
	if len(masked) > 30 {
		masked = masked[:30]
	}
	_, err := r.queries.CreateNotificationLog(ctx, db.CreateNotificationLogParams{
		TicketID:       ticketID,
		Key:            templateKey,
		EndpointMasked: masked,
	})
	if err != nil {
		return fmt.Errorf("notification repository: enqueue %s: %w", templateKey, err)
	}
	return nil
}

// ListPending returns up to 100 notification_logs in 'pending' status.
func (r *Repository) ListPending(ctx context.Context) ([]PendingRow, error) {
	rows, err := r.queries.ListPendingNotificationLogs(ctx)
	if err != nil {
		return nil, fmt.Errorf("notification repository: list pending: %w", err)
	}
	result := make([]PendingRow, len(rows))
	for i, row := range rows {
		result[i] = PendingRow{
			LogID:           row.ID,
			TicketID:        row.TicketID,
			TemplateKey:     row.TemplateKey,
			Title:           row.Title,
			Body:            row.Body,
			IconURL:         row.IconUrl,
			EndpointMasked:  row.EndpointMasked,
			VisitorID:       row.VisitorID,
			Nickname:        row.Nickname,
			ReceptionNumber: row.ReceptionNumber,
			Endpoint:        row.Endpoint,
			P256dhKey:       row.P256dhKey,
			AuthKey:         row.AuthKey,
			BoothName:       row.BoothName,
			BoothLocation:   row.BoothLocation,
			SequenceInBooth: row.SequenceInBooth,
		}
	}
	return result, nil
}

// MarkSent updates a log record to 'sent'.
func (r *Repository) MarkSent(ctx context.Context, logID int64) error {
	return r.queries.UpdateNotificationLogStatus(ctx, db.UpdateNotificationLogStatusParams{
		ID:     logID,
		Status: "sent",
	})
}

// MarkFailed updates a log record to 'failed' with an error message.
func (r *Repository) MarkFailed(ctx context.Context, logID int64, errMsg string) error {
	msg := &errMsg
	return r.queries.UpdateNotificationLogStatus(ctx, db.UpdateNotificationLogStatusParams{
		ID:           logID,
		Status:       "failed",
		ErrorMessage: msg,
	})
}

// MarkSkipped updates a log record to 'skipped'.
func (r *Repository) MarkSkipped(ctx context.Context, logID int64, reason string) error {
	return r.queries.UpdateNotificationLogStatus(ctx, db.UpdateNotificationLogStatusParams{
		ID:           logID,
		Status:       "skipped",
		ErrorMessage: &reason,
	})
}

// DeletePushSubscription removes a visitor's push subscription (e.g. on 410 Gone).
func (r *Repository) DeletePushSubscription(ctx context.Context, visitorID int64) error {
	return r.queries.DeletePushSubscription(ctx, visitorID)
}

// GetPushEndpointForVisitor returns the push endpoint for masking purposes.
// Returns "" if no subscription exists.
func (r *Repository) GetPushEndpointForVisitor(ctx context.Context, visitorID int64) string {
	sub, err := r.queries.GetPushSubscriptionByVisitorID(ctx, visitorID)
	if err != nil {
		return ""
	}
	return sub.Endpoint
}

// EnqueueForVisitor is a convenience wrapper around Enqueue that derives the
// masked endpoint from visitorID. Use this when the caller knows the visitor.
func (r *Repository) EnqueueForVisitor(ctx context.Context, ticketID *int64, visitorID int64, templateKey string) error {
	endpoint := r.GetPushEndpointForVisitor(ctx, visitorID)
	return r.Enqueue(ctx, ticketID, templateKey, endpoint)
}

// TemplateItem is a notification template for admin editing.
type TemplateItem struct {
	Key     string
	Title   string
	Body    string
	IconURL *string
}

// ListTemplates returns all notification templates.
func (r *Repository) ListTemplates(ctx context.Context) ([]TemplateItem, error) {
	rows, err := r.queries.ListNotificationTemplates(ctx)
	if err != nil {
		return nil, fmt.Errorf("notification repository: list templates: %w", err)
	}
	items := make([]TemplateItem, len(rows))
	for i, row := range rows {
		items[i] = TemplateItem{Key: row.Key, Title: row.Title, Body: row.Body, IconURL: row.IconUrl}
	}
	return items, nil
}

// UpdateTemplate updates a notification template by key.
func (r *Repository) UpdateTemplate(ctx context.Context, key, title, body string, iconURL *string) (TemplateItem, error) {
	row, err := r.queries.UpdateNotificationTemplate(ctx, db.UpdateNotificationTemplateParams{
		Key:     key,
		Title:   title,
		Body:    body,
		IconUrl: iconURL,
	})
	if err != nil {
		return TemplateItem{}, fmt.Errorf("notification repository: update template %s: %w", key, err)
	}
	return TemplateItem{Key: row.Key, Title: row.Title, Body: row.Body, IconURL: row.IconUrl}, nil
}
