-- BR-198 — AI Quality authorized learning actions.
-- Observe/review only. No autonomous APPLY, source mutation, merge, or deploy.

BEGIN;

ALTER TABLE ai_quality_cases
  ADD COLUMN IF NOT EXISTS learning_proposal_id TEXT,
  ADD COLUMN IF NOT EXISTS implementation_id TEXT;

ALTER TABLE ai_quality_regression_candidates
  ADD COLUMN IF NOT EXISTS reviewer_user_id UUID,
  ADD COLUMN IF NOT EXISTS risk_level TEXT
    CHECK (risk_level IS NULL OR risk_level IN ('LOW', 'MEDIUM', 'HIGH')),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS implementation_authorized BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE ai_quality_regression_candidates
  DROP CONSTRAINT IF EXISTS ai_quality_regression_candidates_status_check;

ALTER TABLE ai_quality_regression_candidates
  ADD CONSTRAINT ai_quality_regression_candidates_status_check
  CHECK (status IN ('proposed', 'approved', 'implemented', 'verified', 'rejected'));

CREATE TABLE IF NOT EXISTS ai_quality_learning_proposals (
  id TEXT PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES ai_quality_cases(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'GENERATED'
    CHECK (status IN ('GENERATED', 'REJECTED', 'REVISION_REQUESTED', 'REGRESSION_APPROVED')),
  proposal JSONB NOT NULL DEFAULT '{}'::jsonb,
  risk_level TEXT NOT NULL DEFAULT 'MEDIUM'
    CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH')),
  confidence NUMERIC,
  recommended_action TEXT,
  generated_by TEXT NOT NULL DEFAULT 'atlas_deterministic',
  created_by_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE ai_quality_learning_proposals IS
  'BR-198 review-safe learning proposals. No chain-of-thought. Does not mutate code.';

CREATE INDEX IF NOT EXISTS idx_ai_quality_learning_proposals_org
  ON ai_quality_learning_proposals (organization_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_quality_learning_proposals_case
  ON ai_quality_learning_proposals (case_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_quality_implementation_proposals (
  id TEXT PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES ai_quality_cases(id) ON DELETE CASCADE,
  regression_id TEXT REFERENCES ai_quality_regression_candidates(id) ON DELETE SET NULL,
  proposal_id TEXT REFERENCES ai_quality_learning_proposals(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'PROPOSED'
    CHECK (status IN ('PROPOSED', 'AUTHORIZED', 'REJECTED', 'IMPLEMENTED', 'VERIFIED')),
  spec JSONB NOT NULL DEFAULT '{}'::jsonb,
  markdown TEXT,
  authorized_by_user_id UUID,
  authorized_at TIMESTAMPTZ,
  mutates_source_code BOOLEAN NOT NULL DEFAULT false,
  mutates_tests BOOLEAN NOT NULL DEFAULT false,
  linked_br TEXT,
  linked_pr TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE ai_quality_implementation_proposals IS
  'BR-198 implementation specs. Authorization does not auto-edit, merge, or deploy.';

CREATE INDEX IF NOT EXISTS idx_ai_quality_implementation_org
  ON ai_quality_implementation_proposals (organization_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_quality_learning_actions (
  id TEXT PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  case_id UUID REFERENCES ai_quality_cases(id) ON DELETE SET NULL,
  proposal_id TEXT,
  regression_id TEXT,
  implementation_id TEXT,
  action TEXT NOT NULL,
  actor_user_id UUID,
  result TEXT NOT NULL DEFAULT 'success',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE ai_quality_learning_actions IS
  'BR-198 learning-action audit. Actor and timestamp required for every action.';

CREATE INDEX IF NOT EXISTS idx_ai_quality_learning_actions_org
  ON ai_quality_learning_actions (organization_id, created_at DESC);

ALTER TABLE ai_quality_learning_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_quality_implementation_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_quality_learning_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_quality_learning_proposals_deny_anon ON ai_quality_learning_proposals;
CREATE POLICY ai_quality_learning_proposals_deny_anon
  ON ai_quality_learning_proposals FOR ALL TO anon USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS ai_quality_learning_proposals_deny_authenticated ON ai_quality_learning_proposals;
CREATE POLICY ai_quality_learning_proposals_deny_authenticated
  ON ai_quality_learning_proposals FOR ALL TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS ai_quality_implementation_proposals_deny_anon ON ai_quality_implementation_proposals;
CREATE POLICY ai_quality_implementation_proposals_deny_anon
  ON ai_quality_implementation_proposals FOR ALL TO anon USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS ai_quality_implementation_proposals_deny_authenticated
  ON ai_quality_implementation_proposals;
CREATE POLICY ai_quality_implementation_proposals_deny_authenticated
  ON ai_quality_implementation_proposals FOR ALL TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS ai_quality_learning_actions_deny_anon ON ai_quality_learning_actions;
CREATE POLICY ai_quality_learning_actions_deny_anon
  ON ai_quality_learning_actions FOR ALL TO anon USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS ai_quality_learning_actions_deny_authenticated ON ai_quality_learning_actions;
CREATE POLICY ai_quality_learning_actions_deny_authenticated
  ON ai_quality_learning_actions FOR ALL TO authenticated USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE ai_quality_learning_proposals FROM anon, authenticated;
REVOKE ALL ON TABLE ai_quality_implementation_proposals FROM anon, authenticated;
REVOKE ALL ON TABLE ai_quality_learning_actions FROM anon, authenticated;
GRANT ALL ON TABLE ai_quality_learning_proposals TO service_role;
GRANT ALL ON TABLE ai_quality_implementation_proposals TO service_role;
GRANT ALL ON TABLE ai_quality_learning_actions TO service_role;

COMMIT;
