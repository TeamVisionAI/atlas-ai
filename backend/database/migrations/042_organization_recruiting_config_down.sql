-- C1 — Remove only settings.recruiting for the Team Vision seed org.

UPDATE organization_settings
SET
  settings = COALESCE(settings, '{}'::jsonb) - 'recruiting',
  updated_at = now()
WHERE organization_id = '00000000-0000-4000-8000-000000000001';
