-- Revert tenant-scoped phone uniqueness (only safe when no cross-tenant phone twins exist).

DROP INDEX IF EXISTS idx_prospects_org_phone;
DROP INDEX IF EXISTS idx_prospects_org_normalized_phone;

CREATE UNIQUE INDEX IF NOT EXISTS idx_prospects_normalized_phone
  ON prospects (normalized_phone)
  WHERE normalized_phone IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS prospects_phone_key
  ON prospects (phone);
