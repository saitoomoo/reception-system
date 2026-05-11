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
