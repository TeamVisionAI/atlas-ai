-- Sprint 18.2 — Configuration & Scheduling Foundation
-- Migration 012

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS organization_level TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS brand_name TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS office_name TEXT;

ALTER TABLE atlas_users ADD COLUMN IF NOT EXISTS profile_settings JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Seed default scheduling + future policy placeholders in organization_settings
UPDATE organization_settings
SET settings = settings || '{
  "scheduling": {
    "workingHours": { "start": "09:00", "end": "17:00", "days": [1, 2, 3, 4, 5] },
    "preferredAppointmentHours": { "start": "10:00", "end": "16:00" },
    "maxConcurrentBusinessAppointments": 2,
    "allowBusinessOverlap": false,
    "respectPersonalCalendar": true
  },
  "policies": {
    "sharedRecruiting": { "enabled": false },
    "leadDistribution": { "enabled": false },
    "organizationPolicies": {},
    "capacityRules": {}
  }
}'::jsonb
WHERE organization_id = '00000000-0000-4000-8000-000000000001'
  AND NOT (settings ? 'scheduling');
