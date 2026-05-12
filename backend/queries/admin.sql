-- name: GetGlobalAdminByName :one
-- Returns the full row so the caller can compare password_hash with bcrypt.
SELECT * FROM global_admins WHERE name = $1;

-- name: CreateGlobalAdmin :one
INSERT INTO global_admins (name, password_hash)
VALUES ($1, $2)
RETURNING *;

-- =============================================================================
-- CSV export queries
-- =============================================================================

-- name: ListAllVisitorsForExport :many
SELECT id, reception_number, nickname, created_at, last_seen_at
FROM visitors
ORDER BY id;

-- name: ListAllTicketsForExport :many
SELECT
    t.id,
    t.sequence_in_booth,
    t.status,
    t.match_mode,
    t.is_priority_call,
    t.created_at,
    t.called_at,
    t.pending_at,
    t.admitted_at,
    t.cancelled_at,
    v.reception_number,
    v.nickname,
    b.name AS booth_name,
    tg.participant_count
FROM tickets t
JOIN visitors v ON v.id = t.visitor_id
JOIN booths b ON b.id = t.booth_id
JOIN ticket_groups tg ON tg.ticket_id = t.id
ORDER BY t.id;

-- name: ListAllAdmissionsForExport :many
SELECT
    a.id,
    a.method,
    a.admitted_at,
    v.reception_number,
    v.nickname,
    b.name AS booth_name
FROM admissions a
JOIN visitors v ON v.id = a.visitor_id
JOIN booths b ON b.id = a.booth_id
ORDER BY a.id;

-- name: GetBoothSummary :many
SELECT
    b.id AS booth_id,
    b.name AS booth_name,
    COUNT(t.id) FILTER (WHERE t.status = 'waiting')  AS waiting_count,
    COUNT(t.id) FILTER (WHERE t.status = 'called')   AS called_count,
    COUNT(t.id) FILTER (WHERE t.status = 'pending')  AS pending_count,
    COUNT(t.id) FILTER (WHERE t.status = 'admitted') AS admitted_count,
    COUNT(t.id) FILTER (WHERE t.status = 'cancelled') AS cancelled_count,
    COUNT(t.id) AS total_count
FROM booths b
LEFT JOIN tickets t ON t.booth_id = b.id
GROUP BY b.id, b.name
ORDER BY b.id;

-- name: GetHourlyStats :many
-- Groups ticket creation by hour for the past 24 hours.
SELECT
    date_trunc('hour', created_at)::timestamptz AS hour,
    COUNT(*)::int AS ticket_count
FROM tickets
WHERE created_at >= now() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour;

-- name: ListAllMatchSessionsForExport :many
SELECT
    ms.id,
    ms.status,
    ms.mode,
    ms.participant_count,
    ms.created_at,
    ms.started_at,
    ms.ended_at,
    b.name AS booth_name
FROM match_sessions ms
JOIN booths b ON b.id = ms.booth_id
ORDER BY ms.id;

-- =============================================================================
-- Reset event data queries
-- =============================================================================

-- name: DeleteAllParentalConsents :exec
DELETE FROM parental_consents;

-- name: DeleteAllParticipants :exec
DELETE FROM participants;

-- name: DeleteAllTicketGroups :exec
DELETE FROM ticket_groups;

-- name: DeleteAllAdmissions :exec
DELETE FROM admissions;

-- name: DeleteAllNotificationLogs :exec
DELETE FROM notification_logs;

-- name: DeleteAllMatchSessions :exec
DELETE FROM match_sessions;

-- name: DeleteAllTickets :exec
DELETE FROM tickets;

-- name: DeleteAllPushSubscriptions :exec
DELETE FROM push_subscriptions;

-- name: DeleteAllVisitors :exec
DELETE FROM visitors;

-- =============================================================================
-- CreateTicketManual support
-- =============================================================================

-- name: GetVisitorByReceptionNumberForManual :one
SELECT id, reception_number, nickname FROM visitors WHERE reception_number = $1;

-- name: GetActiveTicketForManualCheck :one
-- Check for an existing active ticket (waiting/called/pending) at the booth.
SELECT id FROM tickets
WHERE visitor_id = $1
  AND booth_id   = $2
  AND status IN ('waiting', 'called', 'pending')
LIMIT 1;

-- name: GetLastAdmittedForCooldownCheck :one
SELECT admitted_at FROM tickets
WHERE visitor_id = $1
  AND booth_id   = $2
  AND status     = 'admitted'
  AND admitted_at IS NOT NULL
ORDER BY admitted_at DESC
LIMIT 1;

-- name: CreateManualTicket :one
INSERT INTO tickets (visitor_id, booth_id, ticket_group_id, sequence_in_booth, status)
VALUES ($1, $2, $3, $4, 'waiting')
RETURNING *;

-- name: CreateTicketGroupForManual :one
INSERT INTO ticket_groups (ticket_id, participant_count)
VALUES ($1, $2)
RETURNING id;

-- name: UpdateManualTicketGroupID :exec
UPDATE tickets SET ticket_group_id = $2 WHERE id = $1;

-- name: CreateParticipantForManual :one
INSERT INTO participants (ticket_group_id, name, age)
VALUES ($1, $2, $3)
RETURNING id;

-- name: CreateParentalConsentForManual :exec
INSERT INTO parental_consents (
    participant_id,
    consent_method,
    consent_text_snapshot,
    guardian_name,
    ip_address,
    user_agent,
    paper_form_id
) VALUES ($1, $2, $3, $4, $5, $6, $7);
