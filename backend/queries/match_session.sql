-- name: CreateMatchSession :one
INSERT INTO match_sessions (booth_id, status, mode, participant_count)
VALUES ($1, 'waiting', $2, $3)
RETURNING *;

-- name: GetMatchSessionByID :one
SELECT * FROM match_sessions WHERE id = $1;

-- name: UpdateMatchSessionStatus :exec
UPDATE match_sessions
SET
    status     = $2,
    started_at = CASE WHEN $2 = 'in_progress'                    THEN now() ELSE started_at END,
    ended_at   = CASE WHEN $2 IN ('completed', 'cancelled') THEN now() ELSE ended_at   END
WHERE id = $1;

-- name: ListMatchSessionsByBooth :many
SELECT * FROM match_sessions
WHERE booth_id = $1
  AND status = ANY($2::text[])
ORDER BY created_at DESC;
