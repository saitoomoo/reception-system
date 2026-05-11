-- =============================================================================
-- 000001_initial_schema.up.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. global_admins
-- ---------------------------------------------------------------------------
CREATE TABLE global_admins (
    id            BIGSERIAL    PRIMARY KEY,
    name          TEXT         NOT NULL,
    password_hash TEXT         NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2. visitors
-- ---------------------------------------------------------------------------
CREATE TABLE visitors (
    id               BIGSERIAL    PRIMARY KEY,
    reception_number TEXT         NOT NULL,
    nickname         TEXT         NOT NULL,
    pin_hash         TEXT         NOT NULL,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    last_seen_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX visitors_reception_number_idx ON visitors (reception_number);

-- ---------------------------------------------------------------------------
-- 3. booths
-- ---------------------------------------------------------------------------
CREATE TABLE booths (
    id                           BIGSERIAL    PRIMARY KEY,
    name                         TEXT         NOT NULL,
    description                  TEXT         NOT NULL,
    location                     TEXT         NOT NULL,
    open_at                      TIMESTAMPTZ  NOT NULL,
    close_at                     TIMESTAMPTZ  NOT NULL,
    experience_type              TEXT         NOT NULL
        CHECK (experience_type IN ('sequential', 'parallel', 'individual', 'matchmaking')),
    max_participants_per_ticket  INT          NOT NULL DEFAULT 1,
    concurrent_capacity          INT          NOT NULL DEFAULT 1,
    target_party_size            INT          NULL,
    min_party_size               INT          NULL,
    allow_private_match          BOOLEAN      NOT NULL DEFAULT FALSE,
    estimated_minutes_per_person INT          NULL,
    estimated_minutes_per_session INT         NULL,
    call_threshold               INT          NOT NULL DEFAULT 3,
    call_resend_minutes          INT          NOT NULL DEFAULT 10,
    cooldown_minutes             INT          NOT NULL DEFAULT 0,
    is_accepting                 BOOLEAN      NOT NULL DEFAULT TRUE,
    cover_image_url              TEXT         NULL,
    intro_video_url              TEXT         NULL,
    survey_url                   TEXT         NULL,
    staff_password_hash          TEXT         NOT NULL,
    staff_password_updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 4. push_subscriptions
-- ---------------------------------------------------------------------------
CREATE TABLE push_subscriptions (
    id           BIGSERIAL    PRIMARY KEY,
    visitor_id   BIGINT       NOT NULL REFERENCES visitors (id) ON DELETE CASCADE,
    endpoint     TEXT         NOT NULL,
    p256dh_key   TEXT         NOT NULL,
    auth_key     TEXT         NOT NULL,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    last_used_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (visitor_id)
);

-- ---------------------------------------------------------------------------
-- 5. match_sessions
-- ---------------------------------------------------------------------------
CREATE TABLE match_sessions (
    id                BIGSERIAL    PRIMARY KEY,
    booth_id          BIGINT       NOT NULL REFERENCES booths (id),
    status            TEXT         NOT NULL
        CHECK (status IN ('waiting', 'in_progress', 'completed', 'cancelled')),
    mode              TEXT         NOT NULL
        CHECK (mode IN ('public', 'private')),
    participant_count INT          NOT NULL,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    started_at        TIMESTAMPTZ  NULL,
    ended_at          TIMESTAMPTZ  NULL
);

CREATE INDEX match_sessions_booth_status_idx ON match_sessions (booth_id, status);

-- ---------------------------------------------------------------------------
-- 6. tickets (ticket_group_id FK added later via ALTER TABLE)
-- ---------------------------------------------------------------------------
CREATE TABLE tickets (
    id               BIGSERIAL    PRIMARY KEY,
    visitor_id       BIGINT       NOT NULL REFERENCES visitors (id),
    booth_id         BIGINT       NOT NULL REFERENCES booths (id),
    ticket_group_id  BIGINT       NOT NULL,  -- FK constraint added after ticket_groups
    match_session_id BIGINT       NULL REFERENCES match_sessions (id),
    sequence_in_booth INT         NOT NULL,
    status           TEXT         NOT NULL
        CHECK (status IN ('waiting', 'called', 'pending', 'admitted', 'cancelled')),
    match_mode       TEXT         NULL
        CHECK (match_mode IN ('public', 'private')),
    is_priority_call BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    called_at        TIMESTAMPTZ  NULL,
    pending_at       TIMESTAMPTZ  NULL,
    returned_at      TIMESTAMPTZ  NULL,
    admitted_at      TIMESTAMPTZ  NULL,
    cancelled_at     TIMESTAMPTZ  NULL
);

CREATE INDEX tickets_booth_status_idx     ON tickets (booth_id, status);
CREATE INDEX tickets_visitor_idx          ON tickets (visitor_id);
CREATE INDEX tickets_booth_sequence_idx   ON tickets (booth_id, sequence_in_booth);
CREATE INDEX tickets_match_session_idx    ON tickets (match_session_id)
    WHERE match_session_id IS NOT NULL;

-- R-007: 同一来場者・同一ブースで active な整理券は 1 枚のみ
CREATE UNIQUE INDEX tickets_active_per_booth_visitor_idx
    ON tickets (booth_id, visitor_id)
    WHERE status IN ('waiting', 'called', 'pending');

-- ---------------------------------------------------------------------------
-- 7. ticket_groups
-- ---------------------------------------------------------------------------
CREATE TABLE ticket_groups (
    id                BIGSERIAL    PRIMARY KEY,
    ticket_id         BIGINT       NOT NULL UNIQUE REFERENCES tickets (id),
    participant_count INT          NOT NULL,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 8. tickets.ticket_group_id に FK を後付け (循環依存解消)
--    DEFERRABLE INITIALLY DEFERRED: INSERT 後でも COMMIT 前に検証
-- ---------------------------------------------------------------------------
ALTER TABLE tickets
    ADD CONSTRAINT fk_tickets_ticket_group_id
    FOREIGN KEY (ticket_group_id)
    REFERENCES ticket_groups (id)
    DEFERRABLE INITIALLY DEFERRED;

-- ---------------------------------------------------------------------------
-- 9. participants
-- ---------------------------------------------------------------------------
CREATE TABLE participants (
    id              BIGSERIAL  PRIMARY KEY,
    ticket_group_id BIGINT     NOT NULL REFERENCES ticket_groups (id),
    name            TEXT       NULL,
    age             INT        NOT NULL CHECK (age BETWEEN 0 AND 120)
);

-- ---------------------------------------------------------------------------
-- 10. parental_consents
-- ---------------------------------------------------------------------------
CREATE TABLE parental_consents (
    id                    BIGSERIAL    PRIMARY KEY,
    participant_id        BIGINT       NOT NULL UNIQUE REFERENCES participants (id),
    consent_method        TEXT         NOT NULL
        CHECK (consent_method IN ('digital_level25', 'paper_and_digital')),
    consent_text_snapshot TEXT         NOT NULL,
    guardian_name         TEXT         NOT NULL,
    ip_address            INET         NOT NULL,
    user_agent            TEXT         NOT NULL,
    paper_form_id         TEXT         NULL,
    consented_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 11. admissions
-- ---------------------------------------------------------------------------
CREATE TABLE admissions (
    id          BIGSERIAL    PRIMARY KEY,
    ticket_id   BIGINT       NOT NULL REFERENCES tickets (id),
    visitor_id  BIGINT       NOT NULL REFERENCES visitors (id),
    booth_id    BIGINT       NOT NULL REFERENCES booths (id),
    method      TEXT         NOT NULL
        CHECK (method IN ('qr_scan', 'manual')),
    admitted_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX admissions_booth_admitted_idx ON admissions (booth_id, admitted_at);

-- ---------------------------------------------------------------------------
-- 12. notification_templates
-- ---------------------------------------------------------------------------
CREATE TABLE notification_templates (
    id         BIGSERIAL    PRIMARY KEY,
    key        TEXT         NOT NULL UNIQUE,
    title      TEXT         NOT NULL,
    body       TEXT         NOT NULL,
    icon_url   TEXT         NULL,
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 13. notification_logs
-- ---------------------------------------------------------------------------
CREATE TABLE notification_logs (
    id               BIGSERIAL    PRIMARY KEY,
    ticket_id        BIGINT       NULL REFERENCES tickets (id),
    template_id      BIGINT       NOT NULL REFERENCES notification_templates (id),
    endpoint_masked  TEXT         NOT NULL,
    status           TEXT         NOT NULL
        CHECK (status IN ('sent', 'failed', 'skipped')),
    error_message    TEXT         NULL,
    sent_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 14. risk_explanations
-- ---------------------------------------------------------------------------
CREATE TABLE risk_explanations (
    id         BIGSERIAL    PRIMARY KEY,
    body       TEXT         NOT NULL,
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);
