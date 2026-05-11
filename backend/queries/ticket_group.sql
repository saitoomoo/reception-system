-- name: CreateTicketGroup :one
INSERT INTO ticket_groups (ticket_id, participant_count)
VALUES ($1, $2)
RETURNING *;

-- name: CreateParticipant :one
INSERT INTO participants (ticket_group_id, name, age)
VALUES ($1, $2, $3)
RETURNING *;

-- name: CreateParentalConsent :one
INSERT INTO parental_consents (
    participant_id,
    consent_method,
    consent_text_snapshot,
    guardian_name,
    ip_address,
    user_agent,
    paper_form_id
) VALUES ($1, $2, $3, $4, $5::inet, $6, $7)
RETURNING *;
