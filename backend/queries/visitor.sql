-- name: CreateVisitor :one
INSERT INTO visitors (reception_number, nickname, pin_hash)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetVisitorByReceptionNumber :one
SELECT * FROM visitors
WHERE reception_number = $1;

-- name: GetVisitorByID :one
SELECT * FROM visitors
WHERE id = $1;

-- name: UpdateLastSeenAt :exec
UPDATE visitors
SET last_seen_at = now()
WHERE id = $1;

-- name: GetLastReceptionNumber :one
SELECT reception_number FROM visitors
ORDER BY reception_number DESC
LIMIT 1;
