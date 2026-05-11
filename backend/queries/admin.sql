-- name: GetGlobalAdminByName :one
-- Returns the full row so the caller can compare password_hash with bcrypt.
SELECT * FROM global_admins WHERE name = $1;

-- name: CreateGlobalAdmin :one
INSERT INTO global_admins (name, password_hash)
VALUES ($1, $2)
RETURNING *;
