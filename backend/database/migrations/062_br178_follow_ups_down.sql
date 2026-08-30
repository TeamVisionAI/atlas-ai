BEGIN;

ALTER TABLE agent_notifications
  DROP CONSTRAINT IF EXISTS agent_notifications_event_type_check;

ALTER TABLE agent_notifications
  ADD CONSTRAINT agent_notifications_event_type_check
  CHECK (event_type IN (
    'NEW_APPOINTMENT',
    'APPOINTMENT_RESCHEDULED',
    'APPOINTMENT_CANCELLED',
    'NEEDS_ATTENTION',
    'HUMAN_TAKEOVER_REQUESTED'
  ));

DROP TABLE IF EXISTS atlas_follow_ups;

COMMIT;
