-- name: CreateNotificationLog :one
INSERT INTO notification_logs (ticket_id, template_id, endpoint_masked, status)
SELECT $1, id, $3, 'pending'
FROM notification_templates
WHERE key = $2
RETURNING id, ticket_id, template_id, endpoint_masked, status, error_message, sent_at;

-- name: ListPendingNotificationLogs :many
SELECT
    nl.id,
    nl.ticket_id,
    nl.template_id,
    nl.endpoint_masked,
    nl.status,
    nl.error_message,
    nl.sent_at,
    nt.key  AS template_key,
    nt.title,
    nt.body,
    nt.icon_url,
    v.id    AS visitor_id,
    v.nickname,
    v.reception_number,
    ps.endpoint,
    ps.p256dh_key,
    ps.auth_key,
    b.name  AS booth_name,
    b.location AS booth_location,
    t.sequence_in_booth
FROM notification_logs nl
JOIN notification_templates nt ON nt.id = nl.template_id
LEFT JOIN tickets t ON t.id = nl.ticket_id
LEFT JOIN visitors v ON v.id = t.visitor_id
LEFT JOIN push_subscriptions ps ON ps.visitor_id = v.id
LEFT JOIN booths b ON b.id = t.booth_id
WHERE nl.status = 'pending'
ORDER BY nl.sent_at ASC
LIMIT 100;

-- name: UpdateNotificationLogStatus :exec
UPDATE notification_logs
SET status        = $2,
    error_message = $3
WHERE id = $1;

-- name: ListNotificationTemplates :many
SELECT id, key, title, body, icon_url, updated_at
FROM notification_templates
ORDER BY key;

-- name: GetNotificationTemplateByKey :one
SELECT id, key, title, body, icon_url, updated_at
FROM notification_templates
WHERE key = $1;

-- name: UpdateNotificationTemplate :one
UPDATE notification_templates
SET title      = $2,
    body       = $3,
    icon_url   = $4,
    updated_at = now()
WHERE key = $1
RETURNING id, key, title, body, icon_url, updated_at;
