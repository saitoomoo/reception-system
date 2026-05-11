-- name: CreateAdmission :one
INSERT INTO admissions (ticket_id, visitor_id, booth_id, method)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: ListAdmissionsByBooth :many
-- Returns all admissions for a booth, optionally filtered by a time window.
-- Pass admitted_at_after = '1970-01-01' and admitted_at_before = 'infinity'
-- to fetch all rows.
SELECT a.*, v.reception_number, v.nickname
FROM admissions a
JOIN visitors v ON v.id = a.visitor_id
WHERE a.booth_id      = $1
  AND a.admitted_at  >= $2
  AND a.admitted_at  <  $3
ORDER BY a.admitted_at DESC;
