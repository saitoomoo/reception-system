-- =============================================================================
-- 000001_initial_schema.down.sql
-- =============================================================================

-- FK 依存の逆順で DROP する

DROP TABLE IF EXISTS risk_explanations;
DROP TABLE IF EXISTS notification_logs;
DROP TABLE IF EXISTS notification_templates;
DROP TABLE IF EXISTS admissions;
DROP TABLE IF EXISTS parental_consents;
DROP TABLE IF EXISTS participants;

-- tickets の循環 FK 制約を先に外してから ticket_groups を DROP
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS fk_tickets_ticket_group_id;

DROP TABLE IF EXISTS ticket_groups;
DROP TABLE IF EXISTS tickets;
DROP TABLE IF EXISTS match_sessions;
DROP TABLE IF EXISTS push_subscriptions;
DROP TABLE IF EXISTS booths;
DROP TABLE IF EXISTS visitors;
DROP TABLE IF EXISTS global_admins;
