package notification

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"testing"

	webpush "github.com/SherClockHolmes/webpush-go"
)

// --- stubs ---

type stubStore struct {
	pendingRows   []PendingRow
	skippedLogs   map[int64]string
	failedLogs    map[int64]string
	sentLogs      []int64
	deletedSubIDs []int64
}

func newStubStore(rows []PendingRow) *stubStore {
	return &stubStore{
		pendingRows: rows,
		skippedLogs: make(map[int64]string),
		failedLogs:  make(map[int64]string),
	}
}

func (s *stubStore) ListPending(_ context.Context) ([]PendingRow, error) { return s.pendingRows, nil }
func (s *stubStore) MarkSent(_ context.Context, id int64) error {
	s.sentLogs = append(s.sentLogs, id)
	return nil
}
func (s *stubStore) MarkFailed(_ context.Context, id int64, msg string) error {
	s.failedLogs[id] = msg
	return nil
}
func (s *stubStore) MarkSkipped(_ context.Context, id int64, reason string) error {
	s.skippedLogs[id] = reason
	return nil
}
func (s *stubStore) DeletePushSubscription(_ context.Context, visitorID int64) error {
	s.deletedSubIDs = append(s.deletedSubIDs, visitorID)
	return nil
}

type stubSender struct {
	statusCode int
}

func (s *stubSender) Send(_ context.Context, _ []byte, _ webpush.Subscription) (*http.Response, error) {
	return &http.Response{
		StatusCode: s.statusCode,
		Body:       io.NopCloser(strings.NewReader("")),
	}, nil
}

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func ptrStr(s string) *string { return &s }
func ptrInt64(i int64) *int64 { return &i }
func ptrInt32(i int32) *int32 { return &i }

// --- tests ---

func TestWorker_Skip_NoSubscription(t *testing.T) {
	// A row with no push endpoint should be skipped immediately without calling Sender.
	row := PendingRow{
		LogID:       42,
		TemplateKey: "call_initial",
		Title:       "呼び出し",
		Body:        "お越しください",
		Endpoint:    nil, // no subscription
	}
	store := newStubStore([]PendingRow{row})
	sender := &stubSender{statusCode: 201}
	w := &Worker{store: store, sender: sender, logger: discardLogger()}

	w.processOnce(context.Background())

	if _, skipped := store.skippedLogs[42]; !skipped {
		t.Error("expected logID 42 to be marked skipped, but it was not")
	}
	if len(store.sentLogs) != 0 {
		t.Errorf("expected no sent logs, got %d", len(store.sentLogs))
	}
}

func TestWorker_GoneResponse_DeletesSubscriptionAndSkips(t *testing.T) {
	// A 410 Gone response means the subscription is invalid. Worker must delete it and skip the log.
	visitorID := int64(99)
	endpoint := "https://push.example.com/endpoint"
	row := PendingRow{
		LogID:       7,
		TemplateKey: "call_initial",
		Title:       "呼び出し",
		Body:        "お越しください",
		Endpoint:    &endpoint,
		P256dhKey:   ptrStr("dGVzdC1rZXk="),
		AuthKey:     ptrStr("dGVzdC1hdXRo"),
		VisitorID:   &visitorID,
	}
	store := newStubStore([]PendingRow{row})
	sender := &stubSender{statusCode: http.StatusGone}
	w := &Worker{store: store, sender: sender, logger: discardLogger()}

	w.processOnce(context.Background())

	if _, skipped := store.skippedLogs[7]; !skipped {
		t.Error("expected logID 7 to be marked skipped after 410 Gone")
	}
	if len(store.deletedSubIDs) != 1 || store.deletedSubIDs[0] != 99 {
		t.Errorf("expected push subscription for visitor 99 to be deleted, got deletedSubIDs=%v", store.deletedSubIDs)
	}
	if len(store.sentLogs) != 0 {
		t.Error("expected no sent logs after 410 response")
	}
}

func TestWorker_SuccessResponse_MarksSent(t *testing.T) {
	endpoint := "https://push.example.com/endpoint"
	row := PendingRow{
		LogID:       5,
		TemplateKey: "application_completed",
		Title:       "整理券を取得しました",
		Body:        "{{ニックネーム}} さん、整理券を取得しました",
		Endpoint:    &endpoint,
		P256dhKey:   ptrStr("dGVzdC1rZXk="),
		AuthKey:     ptrStr("dGVzdC1hdXRo"),
		Nickname:    ptrStr("山田"),
	}
	store := newStubStore([]PendingRow{row})
	sender := &stubSender{statusCode: 201}
	w := &Worker{store: store, sender: sender, logger: discardLogger()}

	w.processOnce(context.Background())

	if len(store.sentLogs) != 1 || store.sentLogs[0] != 5 {
		t.Errorf("expected logID 5 to be marked sent, got sentLogs=%v", store.sentLogs)
	}
	if len(store.skippedLogs) != 0 {
		t.Errorf("expected no skipped logs, got %v", store.skippedLogs)
	}
}

func TestBuildVars_AllFields(t *testing.T) {
	row := PendingRow{
		Nickname:        ptrStr("花子"),
		ReceptionNumber: ptrStr("A-042"),
		BoothName:       ptrStr("VR体験"),
		BoothLocation:   ptrStr("A棟3階"),
		SequenceInBooth: ptrInt32(10),
	}
	vars := buildVars(row)
	want := map[string]string{
		"ニックネーム": "花子",
		"受付番号":   "A-042",
		"ブース名":   "VR体験",
		"場所":     "A棟3階",
		"整理券番号":  "10",
	}
	for k, v := range want {
		if vars[k] != v {
			t.Errorf("vars[%q] = %q, want %q", k, vars[k], v)
		}
	}
}
