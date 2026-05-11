-- name: UpsertPushSubscription :exec
INSERT INTO push_subscriptions (visitor_id, endpoint, p256dh_key, auth_key)
VALUES ($1, $2, $3, $4)
ON CONFLICT (visitor_id) DO UPDATE SET
    endpoint     = EXCLUDED.endpoint,
    p256dh_key   = EXCLUDED.p256dh_key,
    auth_key     = EXCLUDED.auth_key,
    last_used_at = now();

-- name: GetPushSubscriptionByVisitorID :one
SELECT * FROM push_subscriptions
WHERE visitor_id = $1;

-- name: DeletePushSubscription :exec
DELETE FROM push_subscriptions
WHERE visitor_id = $1;
