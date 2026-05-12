DELETE FROM notification_templates
WHERE key IN (
  'application_completed',
  'call_initial',
  'call_resent',
  'cancelled_by_staff'
);
