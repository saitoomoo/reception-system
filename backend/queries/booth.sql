-- name: ListBooths :many
SELECT * FROM booths
WHERE is_archived = false
ORDER BY id;

-- name: ListAllBooths :many
SELECT * FROM booths
ORDER BY id;

-- name: GetBoothByID :one
SELECT * FROM booths
WHERE id = $1;

-- name: GetBoothWaitingCount :one
SELECT COUNT(*)::int AS waiting_count
FROM tickets
WHERE booth_id = $1
  AND status IN ('waiting', 'called', 'pending');

-- name: AuthenticateStaff :one
-- Returns the full booth row so the caller can compare staff_password_hash
-- with bcrypt.CompareHashAndPassword on the Go side.
SELECT * FROM booths WHERE id = $1;

-- name: UpdateBooth :exec
UPDATE booths SET
    name                          = $2,
    description                   = $3,
    location                      = $4,
    open_at                       = $5,
    close_at                      = $6,
    experience_type               = $7,
    max_participants_per_ticket   = $8,
    concurrent_capacity           = $9,
    target_party_size             = $10,
    min_party_size                = $11,
    allow_private_match           = $12,
    estimated_minutes_per_person  = $13,
    estimated_minutes_per_session = $14,
    call_threshold                = $15,
    call_resend_minutes           = $16,
    cooldown_minutes              = $17,
    is_accepting                  = $18,
    cover_image_url               = $19,
    intro_video_url               = $20,
    survey_url                    = $21
WHERE id = $1;

-- name: UpdateBoothPassword :exec
UPDATE booths
SET staff_password_hash       = $2,
    staff_password_updated_at = now()
WHERE id = $1;

-- name: UpdateBoothAccepting :exec
UPDATE booths SET is_accepting = $2 WHERE id = $1;

-- name: CreateBooth :one
INSERT INTO booths (
    name, description, location, open_at, close_at,
    experience_type, max_participants_per_ticket, concurrent_capacity,
    target_party_size, min_party_size, allow_private_match,
    estimated_minutes_per_person, estimated_minutes_per_session,
    call_threshold, call_resend_minutes, cooldown_minutes,
    is_accepting, cover_image_url, intro_video_url, survey_url,
    staff_password_hash, staff_password_updated_at
) VALUES (
    $1, $2, $3, $4, $5,
    $6, $7, $8,
    $9, $10, $11,
    $12, $13,
    $14, $15, $16,
    $17, $18, $19, $20,
    $21, now()
)
RETURNING *;

-- name: ArchiveBooth :exec
UPDATE booths SET is_archived = true WHERE id = $1;

-- name: UnarchiveBooth :exec
UPDATE booths SET is_archived = false WHERE id = $1;

-- name: GetBoothActiveTicketCount :one
SELECT COUNT(*)::int AS ticket_count
FROM tickets
WHERE booth_id = $1
  AND status NOT IN ('admitted', 'cancelled');

-- name: DeleteBooth :exec
DELETE FROM booths WHERE id = $1;

-- name: GetBoothStatusCounts :one
-- Returns waiting+called count, pending count, and the sequence_in_booth of the
-- earliest called ticket (0 when no ticket is in called state).
SELECT
    COALESCE(SUM(CASE WHEN status IN ('waiting', 'called') THEN 1 ELSE 0 END), 0)::int
        AS waiting_count,
    COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0)::int
        AS pending_count,
    COALESCE(MIN(CASE WHEN status = 'called' THEN sequence_in_booth END), 0)::int
        AS called_sequence
FROM tickets
WHERE booth_id = $1;
