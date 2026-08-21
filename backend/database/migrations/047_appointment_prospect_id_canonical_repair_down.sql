-- APR1 down — reverse only rows tagged by 047 repair metadata.
-- Restores prospect_id from metadata.coreProspectId when apr1RepairedAt is set.

BEGIN;

UPDATE atlas_appointments
SET
  prospect_id = NULLIF(metadata->>'coreProspectId', '')::uuid,
  metadata = (metadata - 'apr1RepairedAt'),
  updated_at = NOW()
WHERE metadata ? 'apr1RepairedAt'
  AND metadata ? 'coreProspectId'
  AND NULLIF(metadata->>'coreProspectId', '') IS NOT NULL;

COMMIT;
