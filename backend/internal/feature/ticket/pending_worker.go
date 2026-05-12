package ticket

import (
	"context"
	"log/slog"
	"time"

	"reception-system/internal/db"
	"reception-system/internal/feature/notification"
)

// PendingWorker polls for called tickets whose call_resend_minutes have elapsed
// and transitions them to pending (No-Show handling, R-012).
type PendingWorker struct {
	queries   *db.Queries
	notifRepo *notification.Repository
	logger    *slog.Logger
}

func NewPendingWorker(repo *Repository, notifRepo *notification.Repository, logger *slog.Logger) *PendingWorker {
	return &PendingWorker{queries: repo.queries, notifRepo: notifRepo, logger: logger}
}

// Run starts the worker loop. It ticks every 30 seconds and stops when ctx is done.
func (w *PendingWorker) Run(ctx context.Context) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	w.logger.Info("pending worker started")
	for {
		select {
		case <-ctx.Done():
			w.logger.Info("pending worker stopped")
			return
		case <-ticker.C:
			w.tick(ctx)
		}
	}
}

func (w *PendingWorker) tick(ctx context.Context) {
	expired, err := w.queries.FindExpiredCalledTickets(ctx)
	if err != nil {
		w.logger.Error("pending worker: find expired called tickets", slog.Any("error", err))
		return
	}
	if len(expired) == 0 {
		return
	}

	ids := make([]int64, len(expired))
	for i, r := range expired {
		ids[i] = r.ID
	}

	updated, err := w.queries.BulkSetPending(ctx, ids)
	if err != nil {
		w.logger.Error("pending worker: bulk set pending", slog.Any("error", err))
		return
	}
	w.logger.Info("pending worker: transitioned tickets to pending",
		slog.Int("count", len(updated)))

	for _, t := range updated {
		ticketID := t.ID
		if err := w.notifRepo.EnqueueForVisitor(ctx, &ticketID, t.VisitorID, "call_resent"); err != nil {
			w.logger.Error("enqueue call_resent notification",
				slog.Int64("ticket_id", ticketID), slog.Any("error", err))
		}
	}
}
