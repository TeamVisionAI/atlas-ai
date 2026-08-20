-- Tenant-scoped prospect phone uniqueness (Quick Capture / Support Mode).
-- Replaces global unique indexes that incorrectly blocked same phone across orgs.

ALTER TABLE prospects DROP CONSTRAINT IF EXISTS prospects_phone_key;
DROP INDEX IF EXISTS prospects_phone_key;
DROP INDEX IF EXISTS idx_prospects_normalized_phone;

CREATE UNIQUE INDEX IF NOT EXISTS idx_prospects_org_phone
  ON prospects (organization_id, phone)
  WHERE organization_id IS NOT NULL
    AND phone IS NOT NULL
    AND btrim(phone) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_prospects_org_normalized_phone
  ON prospects (organization_id, normalized_phone)
  WHERE organization_id IS NOT NULL
    AND normalized_phone IS NOT NULL
    AND btrim(normalized_phone) <> '';

COMMENT ON INDEX idx_prospects_org_normalized_phone IS
  'Per-organization Quick Capture / inbound dedupe — same E.164 may exist in other tenants';
