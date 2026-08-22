-- APR1 — Repair atlas_appointments.prospect_id to public.prospects.id
-- when the stored value is a recruiting-core UUID (atlas_core_prospects).
-- Safe mapping: same organization_id + exact normalized phone digits (≥10),
-- exactly one matching public.prospects row.
-- Preserves prior core id on metadata.coreProspectId.
-- Does NOT add a referential constraint (defer until dangling rows are cleared).

BEGIN;

WITH dangling AS (
  SELECT
    a.id AS appointment_id,
    a.organization_id,
    a.prospect_id AS stored_core_id,
    a.prospect_phone,
    a.metadata
  FROM atlas_appointments a
  LEFT JOIN prospects p ON p.id = a.prospect_id
  WHERE a.prospect_id IS NOT NULL
    AND p.id IS NULL
    AND EXISTS (
      SELECT 1 FROM atlas_core_prospects c WHERE c.id = a.prospect_id
    )
),
matched AS (
  SELECT
    d.appointment_id,
    d.stored_core_id,
    d.metadata,
    p.id AS canonical_prospect_id,
    COUNT(*) OVER (PARTITION BY d.appointment_id) AS match_count
  FROM dangling d
  INNER JOIN prospects p
    ON p.organization_id = d.organization_id
   AND (
     regexp_replace(COALESCE(p.phone, ''), '\D', '', 'g')
       = regexp_replace(COALESCE(d.prospect_phone, ''), '\D', '', 'g')
     OR p.phone = d.prospect_phone
   )
  WHERE length(regexp_replace(COALESCE(d.prospect_phone, ''), '\D', '', 'g')) >= 10
)
UPDATE atlas_appointments a
SET
  prospect_id = m.canonical_prospect_id,
  metadata = COALESCE(a.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'coreProspectId', m.stored_core_id,
      'apr1RepairedAt', NOW()
    ),
  updated_at = NOW()
FROM matched m
WHERE a.id = m.appointment_id
  AND m.match_count = 1
  AND a.prospect_id = m.stored_core_id;

COMMIT;

-- Post-condition (operator verify before FK):
-- SELECT COUNT(*) FROM atlas_appointments a
-- LEFT JOIN prospects p ON p.id = a.prospect_id
-- WHERE a.prospect_id IS NOT NULL AND p.id IS NULL;
-- Expect 0 before adding atlas_appointments.prospect_id → prospects(id) constraint.
