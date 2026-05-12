package notification

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"
)

// notificationStore is the subset of Repository methods used by Worker.
type notificationStore interface {
	ListPending(ctx context.Context) ([]PendingRow, error)
	MarkSent(ctx context.Context, logID int64) error
	MarkFailed(ctx context.Context, logID int64, errMsg string) error
	MarkSkipped(ctx context.Context, logID int64, reason string) error
	DeletePushSubscription(ctx context.Context, visitorID int64) error
}

// Sender sends a single Web Push notification.
type Sender interface {
	Send(ctx context.Context, msg []byte, sub webpush.Subscription) (*http.Response, error)
}

// Worker polls notification_logs and delivers pending Web Push notifications.
type Worker struct {
	store    notificationStore
	sender   Sender
	logger   *slog.Logger
	interval time.Duration
}

// NewWorker creates a Worker backed by a real VAPID sender.
func NewWorker(repo *Repository, vapidPublicKey, vapidPrivateKey, vapidSubject string, logger *slog.Logger) *Worker {
	return &Worker{
		store:    repo,
		sender:   &realSender{pubKey: vapidPublicKey, privKey: vapidPrivateKey, subject: vapidSubject},
		logger:   logger,
		interval: 5 * time.Second,
	}
}

// Run starts the delivery loop and blocks until ctx is cancelled.
func (w *Worker) Run(ctx context.Context) {
	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			w.processOnce(ctx)
		}
	}
}

const maxRetries = 3

func (w *Worker) processOnce(ctx context.Context) {
	rows, err := w.store.ListPending(ctx)
	if err != nil {
		w.logger.Error("notification worker: list pending", slog.Any("error", err))
		return
	}
	for _, row := range rows {
		w.deliverRow(ctx, row)
	}
}

type pushPayload struct {
	Title string `json:"title"`
	Body  string `json:"body"`
	Icon  string `json:"icon,omitempty"`
	URL   string `json:"url,omitempty"`
}

func (w *Worker) deliverRow(ctx context.Context, row PendingRow) {
	if row.Endpoint == nil || row.P256dhKey == nil || row.AuthKey == nil {
		if err := w.store.MarkSkipped(ctx, row.LogID, "no push subscription"); err != nil {
			w.logger.Error("notification worker: mark skipped", slog.Any("error", err))
		}
		return
	}

	vars := buildVars(row)
	payload := pushPayload{
		Title: SubstituteVars(row.Title, vars),
		Body:  SubstituteVars(row.Body, vars),
	}
	if row.IconURL != nil {
		payload.Icon = *row.IconURL
	}
	if row.TicketID != nil {
		payload.URL = "/tickets/" + strconv.FormatInt(*row.TicketID, 10)
	}

	msg, err := json.Marshal(payload)
	if err != nil {
		if failErr := w.store.MarkFailed(ctx, row.LogID, err.Error()); failErr != nil {
			w.logger.Error("notification worker: mark failed", slog.Any("error", failErr))
		}
		return
	}

	sub := webpush.Subscription{
		Endpoint: *row.Endpoint,
		Keys:     webpush.Keys{Auth: *row.AuthKey, P256dh: *row.P256dhKey},
	}

	var lastErr error
	backoff := 100 * time.Millisecond
	for attempt := 0; attempt < maxRetries; attempt++ {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				return
			case <-time.After(backoff):
				backoff *= 2
			}
		}

		resp, sendErr := w.sender.Send(ctx, msg, sub)
		if sendErr != nil {
			lastErr = sendErr
			continue
		}
		resp.Body.Close()

		if resp.StatusCode == http.StatusGone {
			if row.VisitorID != nil {
				if delErr := w.store.DeletePushSubscription(ctx, *row.VisitorID); delErr != nil {
					w.logger.Warn("notification worker: delete stale subscription", slog.Any("error", delErr))
				}
			}
			if skipErr := w.store.MarkSkipped(ctx, row.LogID, "subscription gone (410)"); skipErr != nil {
				w.logger.Error("notification worker: mark skipped", slog.Any("error", skipErr))
			}
			return
		}

		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			if sentErr := w.store.MarkSent(ctx, row.LogID); sentErr != nil {
				w.logger.Error("notification worker: mark sent", slog.Any("error", sentErr))
			}
			return
		}

		lastErr = fmt.Errorf("push endpoint returned %d", resp.StatusCode)
	}

	errMsg := "max retries exceeded"
	if lastErr != nil {
		errMsg = lastErr.Error()
	}
	if failErr := w.store.MarkFailed(ctx, row.LogID, errMsg); failErr != nil {
		w.logger.Error("notification worker: mark failed", slog.Any("error", failErr))
	}
}

func buildVars(row PendingRow) map[string]string {
	vars := make(map[string]string)
	if row.Nickname != nil {
		vars["ニックネーム"] = *row.Nickname
	}
	if row.ReceptionNumber != nil {
		vars["受付番号"] = *row.ReceptionNumber
	}
	if row.BoothName != nil {
		vars["ブース名"] = *row.BoothName
	}
	if row.BoothLocation != nil {
		vars["場所"] = *row.BoothLocation
	}
	if row.SequenceInBooth != nil {
		vars["整理券番号"] = strconv.Itoa(int(*row.SequenceInBooth))
	}
	return vars
}

// realSender delivers Web Push notifications via webpush-go.
type realSender struct {
	pubKey  string
	privKey string
	subject string
}

func (s *realSender) Send(ctx context.Context, msg []byte, sub webpush.Subscription) (*http.Response, error) {
	return webpush.SendNotificationWithContext(ctx, msg, &sub, &webpush.Options{
		VAPIDPublicKey:  s.pubKey,
		VAPIDPrivateKey: s.privKey,
		Subscriber:      s.subject,
		TTL:             3600,
	})
}
