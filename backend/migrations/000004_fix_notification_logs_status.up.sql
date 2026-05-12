-- Fix notification_logs status check constraint to include 'pending'.
-- The worker inserts rows with status='pending' before delivery, but the
-- original constraint only listed 'sent', 'failed', 'skipped'.

ALTER TABLE notification_logs
    DROP CONSTRAINT IF EXISTS notification_logs_status_check;

ALTER TABLE notification_logs
    ADD CONSTRAINT notification_logs_status_check
        CHECK (status IN ('pending', 'sent', 'failed', 'skipped'));
