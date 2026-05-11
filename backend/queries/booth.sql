-- name: ListBooths :many
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
