-- name: CreateTicket :one
INSERT INTO tickets (
    visitor_id,
    booth_id,
    ticket_group_id,
    sequence_in_booth,
    status,
    match_mode
) VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: UpdateTicketGroupID :exec
UPDATE tickets
SET ticket_group_id = $2
WHERE id = $1;

-- name: GetTicketByID :one
SELECT * FROM tickets
WHERE id = $1;

-- name: ListTicketsByVisitorID :many
SELECT * FROM tickets
WHERE visitor_id = $1
ORDER BY created_at DESC;

-- name: ListTicketsByBoothID :many
SELECT * FROM tickets
WHERE booth_id = $1
  AND status = ANY($2::text[])
ORDER BY sequence_in_booth;

-- name: ListTicketsByBoothForStaff :many
-- Returns all non-cancelled tickets for a booth with visitor and group info for staff view.
SELECT
    t.id,
    t.sequence_in_booth,
    t.status,
    t.is_priority_call,
    t.created_at,
    t.pending_at,
    v.reception_number,
    v.nickname,
    tg.participant_count
FROM tickets t
JOIN visitors v ON v.id = t.visitor_id
JOIN ticket_groups tg ON tg.ticket_id = t.id
WHERE t.booth_id = $1
  AND t.status != 'cancelled'
ORDER BY
    t.is_priority_call DESC,
    t.sequence_in_booth;

-- name: GetTicketPosition :one
-- R-012: pending は待機列のカウントから除外する
SELECT COUNT(*)::int AS position
FROM tickets t
WHERE t.booth_id = (SELECT t2.booth_id FROM tickets t2 WHERE t2.id = $1)
  AND t.status IN ('waiting', 'called')
  AND t.sequence_in_booth < (SELECT t3.sequence_in_booth FROM tickets t3 WHERE t3.id = $1);

-- name: UpdateTicketStatus :exec
UPDATE tickets
SET
    status       = $2,
    called_at    = CASE WHEN $2 = 'called'    THEN now() ELSE called_at    END,
    pending_at   = CASE WHEN $2 = 'pending'   THEN now() ELSE pending_at   END,
    admitted_at  = CASE WHEN $2 = 'admitted'  THEN now() ELSE admitted_at  END,
    cancelled_at = CASE WHEN $2 = 'cancelled' THEN now() ELSE cancelled_at END
WHERE id = $1;

-- name: GetLastAdmittedAtForVisitorBooth :one
SELECT admitted_at
FROM tickets
WHERE visitor_id = $1
  AND booth_id   = $2
  AND status     = 'admitted'
  AND admitted_at IS NOT NULL
ORDER BY admitted_at DESC
LIMIT 1;

-- name: GetNextSequenceInBooth :one
SELECT COALESCE(MAX(sequence_in_booth), 0) + 1 AS next_sequence
FROM tickets
WHERE booth_id = $1;

-- name: CallTicket :exec
-- Transitions a single waiting ticket to called. The booth_id guard prevents
-- staff from accidentally calling a ticket that belongs to another booth.
UPDATE tickets
SET status    = 'called',
    called_at = now()
WHERE id       = $1
  AND booth_id = $2
  AND status   = 'waiting';

-- name: CallNextTickets :many
-- Transitions the first $2 waiting tickets (by sequence) for a booth to called.
-- Returns the updated rows so the caller can send push notifications.
-- Alias the subquery source as "src" to avoid the ambiguous booth_id reference
-- that arises when sqlc resolves both the outer UPDATE target and the inner
-- SELECT against the same "tickets" table.
UPDATE tickets
SET status    = 'called',
    called_at = now()
WHERE id IN (
    SELECT id FROM tickets AS src
    WHERE src.booth_id = $1
      AND src.status   = 'waiting'
    ORDER BY src.sequence_in_booth
    LIMIT $2
)
RETURNING *;

-- name: AdmitTicketByStaff :one
-- Transitions a called or pending ticket to admitted.
-- Returns the full row so the caller can insert into admissions in the same tx.
UPDATE tickets
SET status      = 'admitted',
    admitted_at = now()
WHERE id       = $1
  AND booth_id = $2
  AND status IN ('called', 'pending')
RETURNING *;

-- name: ForceAdmitTicket :one
-- Force-admits a ticket from any active status (waiting/called/pending) to admitted.
-- Used by AdmitManually with force=true when staff skips the confirmation step.
UPDATE tickets
SET status      = 'admitted',
    admitted_at = now()
WHERE id       = $1
  AND booth_id = $2
  AND status IN ('waiting', 'called', 'pending')
RETURNING *;

-- name: GetTicketByReceptionNumberAndBooth :one
-- Returns the most recent ticket (any status) for the given visitor and booth.
-- Used by the QR scanner to determine the current state before deciding the
-- admission outcome (admitted / restored_to_priority_call / waiting_confirmation_needed / …).
SELECT t.*
FROM tickets t
JOIN visitors v ON v.id = t.visitor_id
WHERE t.booth_id         = $1
  AND v.reception_number = $2
ORDER BY t.created_at DESC
LIMIT 1;

-- name: CancelTicketByStaff :one
-- Staff can cancel a ticket in any non-admitted state.
-- The booth_id guard is intentional: omitting it would let staff cancel tickets
-- belonging to other booths.
-- Returns visitor_id for notification enqueueing.
UPDATE tickets
SET status       = 'cancelled',
    cancelled_at = now()
WHERE id       = $1
  AND booth_id = $2
  AND status  != 'admitted'
RETURNING visitor_id;

-- name: SetTicketPending :exec
-- Transitions a called ticket to pending (No-Show after call_resend_minutes).
UPDATE tickets
SET status     = 'pending',
    pending_at = now()
WHERE id       = $1
  AND booth_id = $2
  AND status   = 'called';

-- name: ReturnFromPending :one
-- Transitions a pending ticket back to called and marks it as a priority call.
-- Returns the updated row so the caller knows the visitor returned.
UPDATE tickets
SET status           = 'called',
    called_at        = now(),
    returned_at      = now(),
    is_priority_call = TRUE
WHERE id       = $1
  AND booth_id = $2
  AND status   = 'pending'
RETURNING *;

-- name: FindExpiredCalledTickets :many
-- Returns called tickets whose call_resend_minutes have elapsed since called_at.
-- Used by the pending worker to bulk-transition No-Show tickets.
SELECT t.id, t.booth_id
FROM tickets t
JOIN booths b ON b.id = t.booth_id
WHERE t.status = 'called'
  AND t.called_at IS NOT NULL
  AND t.called_at + (b.call_resend_minutes * INTERVAL '1 minute') < now();

-- name: BulkSetPending :many
-- Transitions the given called tickets to pending. Returns updated rows.
UPDATE tickets
SET status     = 'pending',
    pending_at = now()
WHERE id = ANY($1::bigint[])
  AND status = 'called'
RETURNING id, booth_id, visitor_id;

-- name: ListWaitingPublicTicketsByBooth :many
-- Returns waiting public-mode tickets ordered by sequence for matchmaking logic.
SELECT t.id, t.sequence_in_booth, tg.participant_count
FROM tickets t
JOIN ticket_groups tg ON tg.ticket_id = t.id
WHERE t.booth_id = $1
  AND t.status = 'waiting'
  AND t.match_mode = 'public'
  AND t.match_session_id IS NULL
ORDER BY t.sequence_in_booth;

-- name: ListWaitingPrivateTicketsByBooth :many
-- Returns waiting private-mode tickets (awaiting staff call) for matchmaking.
SELECT t.id, t.sequence_in_booth, tg.participant_count, v.reception_number, v.nickname
FROM tickets t
JOIN ticket_groups tg ON tg.ticket_id = t.id
JOIN visitors v ON v.id = t.visitor_id
WHERE t.booth_id = $1
  AND t.status = 'waiting'
  AND t.match_mode = 'private'
ORDER BY t.sequence_in_booth;

-- name: AssignTicketsToMatchSession :exec
-- Bulk-assign a set of ticket IDs to a match session.
UPDATE tickets
SET match_session_id = $2
WHERE id = ANY($1::bigint[]);

-- name: BulkCallMatchTickets :many
-- Transitions the given tickets to called. Returns id+visitor_id for notification.
UPDATE tickets
SET status    = 'called',
    called_at = now()
WHERE id = ANY($1::bigint[])
  AND status IN ('waiting', 'called')
RETURNING id, visitor_id;

-- name: GetTicketsByMatchSession :many
-- Returns all non-cancelled tickets belonging to a match session.
SELECT * FROM tickets
WHERE match_session_id = $1
  AND status != 'cancelled';

-- name: GetActiveTicketByBoothAndReceptionNumber :one
-- Returns the most recent non-cancelled ticket for a visitor at a specific booth,
-- looked up by reception number (PIN-free, read-only per ticket.md §6).
SELECT t.*
FROM tickets t
JOIN visitors v ON v.id = t.visitor_id
WHERE t.booth_id          = $1
  AND v.reception_number  = $2
  AND t.status NOT IN ('cancelled')
ORDER BY t.created_at DESC
LIMIT 1;
