-- name: GetRiskExplanation :one
-- Returns the current risk explanation text (singleton row).
SELECT * FROM risk_explanations ORDER BY id DESC LIMIT 1;

-- name: UpdateRiskExplanationBody :one
-- Updates body of the singleton row identified by id.
UPDATE risk_explanations
SET body = $2, updated_at = now()
WHERE id = $1
RETURNING *;

-- name: InsertRiskExplanation :one
-- Creates the first risk explanation row when none exists yet.
INSERT INTO risk_explanations (body, updated_at)
VALUES ($1, now())
RETURNING *;
