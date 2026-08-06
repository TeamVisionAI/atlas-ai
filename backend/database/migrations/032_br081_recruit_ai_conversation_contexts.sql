-- BR-081 Phase 2 — Durable Recruit AI v2 conversation context persistence.
-- Additive only. No prospect/appointment backfill. No destructive rewrite.
-- Safe to apply before application deploy (unused until repository is called).
--
-- Rollback: backend/database/migrations/032_br081_recruit_ai_conversation_contexts_down.sql
-- Note: down drops tables; do not run against production without explicit authorization.

BEGIN;

CREATE TABLE IF NOT EXISTS public.recruit_ai_conversation_contexts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  prospect_id uuid NOT NULL,
  channel text NOT NULL DEFAULT 'whatsapp',
  context_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  context_version integer NOT NULL DEFAULT 1,
  schema_version integer NOT NULL DEFAULT 1,
  conversation_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_inbound_message_id text,
  last_processed_message_id text,
  last_decision_code text,
  last_language text,
  needs_human_attention boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  source text NOT NULL DEFAULT 'v2',
  CONSTRAINT recruit_ai_conversation_contexts_channel_chk
    CHECK (char_length(channel) > 0 AND char_length(channel) <= 64),
  CONSTRAINT recruit_ai_conversation_contexts_version_chk
    CHECK (context_version >= 1 AND schema_version >= 1 AND conversation_version >= 1)
);

COMMENT ON TABLE public.recruit_ai_conversation_contexts IS
  'BR-081 Recruit AI v2 durable conversation context (simulation/shadow ready; no CE cutover)';
COMMENT ON COLUMN public.recruit_ai_conversation_contexts.context_json IS
  'Sanitized structured v2 context only — no tokens, stack traces, or hidden reasoning';
COMMENT ON COLUMN public.recruit_ai_conversation_contexts.context_version IS
  'Optimistic concurrency version; compare-and-set on save';

-- One active context per org + prospect + channel.
CREATE UNIQUE INDEX IF NOT EXISTS idx_recruit_ai_ctx_active_unique
  ON public.recruit_ai_conversation_contexts (organization_id, prospect_id, channel)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_recruit_ai_ctx_org_updated
  ON public.recruit_ai_conversation_contexts (organization_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_recruit_ai_ctx_org_prospect
  ON public.recruit_ai_conversation_contexts (organization_id, prospect_id);

CREATE INDEX IF NOT EXISTS idx_recruit_ai_ctx_last_processed
  ON public.recruit_ai_conversation_contexts (organization_id, last_processed_message_id)
  WHERE last_processed_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_recruit_ai_ctx_attention
  ON public.recruit_ai_conversation_contexts (organization_id, needs_human_attention)
  WHERE archived_at IS NULL AND needs_human_attention = true;

-- Shadow evaluation ledger (write path unused until shadow-mode sprint).
CREATE TABLE IF NOT EXISTS public.recruit_ai_v2_shadow_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  prospect_id uuid NOT NULL,
  channel text NOT NULL DEFAULT 'whatsapp',
  context_id uuid REFERENCES public.recruit_ai_conversation_contexts(id),
  inbound_message_id text,
  live_ce_response_intent text,
  v2_interpreted_intent text,
  v2_decision_code text,
  v2_confidence numeric,
  v2_proposed_side_effect text,
  divergence_classification text,
  language_agreement boolean,
  diagnostic_leak_check boolean,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.recruit_ai_v2_shadow_evaluations IS
  'BR-081 shadow-mode comparison ledger — not enabled in Phase 2';

CREATE INDEX IF NOT EXISTS idx_recruit_ai_shadow_org_created
  ON public.recruit_ai_v2_shadow_evaluations (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_recruit_ai_shadow_inbound
  ON public.recruit_ai_v2_shadow_evaluations (organization_id, inbound_message_id)
  WHERE inbound_message_id IS NOT NULL;

-- Backend-only RLS (same posture as migration 029).
ALTER TABLE public.recruit_ai_conversation_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recruit_ai_v2_shadow_evaluations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recruit_ai_conversation_contexts_deny_anon
  ON public.recruit_ai_conversation_contexts;
CREATE POLICY recruit_ai_conversation_contexts_deny_anon
  ON public.recruit_ai_conversation_contexts
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS recruit_ai_conversation_contexts_deny_authenticated
  ON public.recruit_ai_conversation_contexts;
CREATE POLICY recruit_ai_conversation_contexts_deny_authenticated
  ON public.recruit_ai_conversation_contexts
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS recruit_ai_v2_shadow_evaluations_deny_anon
  ON public.recruit_ai_v2_shadow_evaluations;
CREATE POLICY recruit_ai_v2_shadow_evaluations_deny_anon
  ON public.recruit_ai_v2_shadow_evaluations
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS recruit_ai_v2_shadow_evaluations_deny_authenticated
  ON public.recruit_ai_v2_shadow_evaluations;
CREATE POLICY recruit_ai_v2_shadow_evaluations_deny_authenticated
  ON public.recruit_ai_v2_shadow_evaluations
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.recruit_ai_conversation_contexts FROM anon, authenticated;
GRANT ALL ON TABLE public.recruit_ai_conversation_contexts TO service_role;

REVOKE ALL ON TABLE public.recruit_ai_v2_shadow_evaluations FROM anon, authenticated;
GRANT ALL ON TABLE public.recruit_ai_v2_shadow_evaluations TO service_role;

COMMIT;
