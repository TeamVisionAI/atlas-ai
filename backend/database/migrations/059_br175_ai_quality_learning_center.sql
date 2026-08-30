-- BR-175 — AI Quality & Learning Review Center.
-- Observation/review only. Default tenant participation off.
-- Backend-only RLS (deny anon/authenticated). Service-role writes only.

BEGIN;

CREATE TABLE IF NOT EXISTS ai_quality_tenant_settings (
  organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  participation_enabled BOOLEAN NOT NULL DEFAULT false,
  mode TEXT NOT NULL DEFAULT 'OFF'
    CHECK (mode IN ('OFF', 'OBSERVE', 'REVIEW')),
  sample_rate NUMERIC NOT NULL DEFAULT 1
    CHECK (sample_rate >= 0 AND sample_rate <= 1),
  updated_by_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE ai_quality_tenant_settings IS
  'BR-175 per-tenant learning capture. Default off until configured/certified.';

CREATE TABLE IF NOT EXISTS ai_quality_cases (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  prospect_id UUID,
  owner_user_id UUID,
  inbound_message_id TEXT,
  source_engine TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  episode_key TEXT NOT NULL,
  legacy_interpretation JSONB,
  semantic_interpretation JSONB,
  known_facts_before JSONB,
  known_facts_after JSONB,
  atlas_action TEXT,
  confidence NUMERIC,
  disagreement_fields JSONB,
  latency_ms INTEGER,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  estimated_cost_usd NUMERIC,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'NEW'
    CHECK (status IN (
      'NEW',
      'REVIEWING',
      'SEMANTIC_CORRECT',
      'LEGACY_CORRECT',
      'BOTH_WRONG',
      'EXPECTED_BEHAVIOR',
      'REGRESSION_CANDIDATE',
      'RESOLVED',
      'IGNORED'
    )),
  severity TEXT NOT NULL DEFAULT 'MEDIUM'
    CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH')),
  reviewer_user_id UUID,
  review_notes TEXT,
  expected_behavior JSONB,
  regression_candidate_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE ai_quality_cases IS
  'BR-175 structured AI quality cases. Conversation text is referenced, not copied.';

CREATE INDEX IF NOT EXISTS idx_ai_quality_cases_org_detected
  ON ai_quality_cases (organization_id, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_quality_cases_org_status
  ON ai_quality_cases (organization_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_quality_cases_open_episode
  ON ai_quality_cases (organization_id, episode_key)
  WHERE status IN ('NEW', 'REVIEWING');

CREATE TABLE IF NOT EXISTS ai_quality_regression_candidates (
  id TEXT PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES ai_quality_cases(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'implemented', 'verified')),
  spec JSONB NOT NULL DEFAULT '{}'::jsonb,
  markdown TEXT,
  created_by_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE ai_quality_regression_candidates IS
  'BR-175 human-approved regression specs. Never auto-edits source or tests.';

CREATE INDEX IF NOT EXISTS idx_ai_quality_regressions_org
  ON ai_quality_regression_candidates (organization_id, created_at DESC);

ALTER TABLE ai_quality_tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_quality_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_quality_regression_candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_quality_tenant_settings_deny_anon ON ai_quality_tenant_settings;
CREATE POLICY ai_quality_tenant_settings_deny_anon
  ON ai_quality_tenant_settings FOR ALL TO anon USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS ai_quality_tenant_settings_deny_authenticated ON ai_quality_tenant_settings;
CREATE POLICY ai_quality_tenant_settings_deny_authenticated
  ON ai_quality_tenant_settings FOR ALL TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS ai_quality_cases_deny_anon ON ai_quality_cases;
CREATE POLICY ai_quality_cases_deny_anon
  ON ai_quality_cases FOR ALL TO anon USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS ai_quality_cases_deny_authenticated ON ai_quality_cases;
CREATE POLICY ai_quality_cases_deny_authenticated
  ON ai_quality_cases FOR ALL TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS ai_quality_regression_candidates_deny_anon ON ai_quality_regression_candidates;
CREATE POLICY ai_quality_regression_candidates_deny_anon
  ON ai_quality_regression_candidates FOR ALL TO anon USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS ai_quality_regression_candidates_deny_authenticated
  ON ai_quality_regression_candidates;
CREATE POLICY ai_quality_regression_candidates_deny_authenticated
  ON ai_quality_regression_candidates FOR ALL TO authenticated USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE ai_quality_tenant_settings FROM anon, authenticated;
REVOKE ALL ON TABLE ai_quality_cases FROM anon, authenticated;
REVOKE ALL ON TABLE ai_quality_regression_candidates FROM anon, authenticated;
GRANT ALL ON TABLE ai_quality_tenant_settings TO service_role;
GRANT ALL ON TABLE ai_quality_cases TO service_role;
GRANT ALL ON TABLE ai_quality_regression_candidates TO service_role;

COMMIT;
