-- Migration 029 — Backend-only RLS for public tables exposed without RLS.
--
-- Closes PostgREST access for anon / authenticated Supabase roles on 18 tables.
-- Atlas user authorization remains Express session middleware + service-role backend.
-- No tenant JWT policies. No SECURITY DEFINER helpers. No data changes.
--
-- Implements audit classification A (backend-only) for Security Advisor
-- "RLS Disabled in Public" findings.
--
-- NOTE: atlas_organization_securities_authority_bootstrap authenticated deny
-- policy uses *_deny_auth to satisfy PostgreSQL's 63-character identifier limit.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. atlas_appointments
-- ---------------------------------------------------------------------------
ALTER TABLE public.atlas_appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS atlas_appointments_deny_anon ON public.atlas_appointments;
CREATE POLICY atlas_appointments_deny_anon
  ON public.atlas_appointments
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS atlas_appointments_deny_authenticated ON public.atlas_appointments;
CREATE POLICY atlas_appointments_deny_authenticated
  ON public.atlas_appointments
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.atlas_appointments FROM anon, authenticated;
GRANT ALL ON TABLE public.atlas_appointments TO service_role;

-- ---------------------------------------------------------------------------
-- 2. atlas_business_events
-- ---------------------------------------------------------------------------
ALTER TABLE public.atlas_business_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS atlas_business_events_deny_anon ON public.atlas_business_events;
CREATE POLICY atlas_business_events_deny_anon
  ON public.atlas_business_events
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS atlas_business_events_deny_authenticated ON public.atlas_business_events;
CREATE POLICY atlas_business_events_deny_authenticated
  ON public.atlas_business_events
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.atlas_business_events FROM anon, authenticated;
GRANT ALL ON TABLE public.atlas_business_events TO service_role;

-- ---------------------------------------------------------------------------
-- 3. atlas_executive_dashboard_processed_events
-- ---------------------------------------------------------------------------
ALTER TABLE public.atlas_executive_dashboard_processed_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS atlas_executive_dashboard_processed_events_deny_anon
  ON public.atlas_executive_dashboard_processed_events;
CREATE POLICY atlas_executive_dashboard_processed_events_deny_anon
  ON public.atlas_executive_dashboard_processed_events
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS atlas_executive_dashboard_processed_events_deny_authenticated
  ON public.atlas_executive_dashboard_processed_events;
CREATE POLICY atlas_executive_dashboard_processed_events_deny_authenticated
  ON public.atlas_executive_dashboard_processed_events
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.atlas_executive_dashboard_processed_events FROM anon, authenticated;
GRANT ALL ON TABLE public.atlas_executive_dashboard_processed_events TO service_role;

-- ---------------------------------------------------------------------------
-- 4. atlas_executive_dashboard_state
-- ---------------------------------------------------------------------------
ALTER TABLE public.atlas_executive_dashboard_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS atlas_executive_dashboard_state_deny_anon
  ON public.atlas_executive_dashboard_state;
CREATE POLICY atlas_executive_dashboard_state_deny_anon
  ON public.atlas_executive_dashboard_state
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS atlas_executive_dashboard_state_deny_authenticated
  ON public.atlas_executive_dashboard_state;
CREATE POLICY atlas_executive_dashboard_state_deny_authenticated
  ON public.atlas_executive_dashboard_state
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.atlas_executive_dashboard_state FROM anon, authenticated;
GRANT ALL ON TABLE public.atlas_executive_dashboard_state TO service_role;

-- ---------------------------------------------------------------------------
-- 5. atlas_fi_strategy_evaluations
-- ---------------------------------------------------------------------------
ALTER TABLE public.atlas_fi_strategy_evaluations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS atlas_fi_strategy_evaluations_deny_anon
  ON public.atlas_fi_strategy_evaluations;
CREATE POLICY atlas_fi_strategy_evaluations_deny_anon
  ON public.atlas_fi_strategy_evaluations
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS atlas_fi_strategy_evaluations_deny_authenticated
  ON public.atlas_fi_strategy_evaluations;
CREATE POLICY atlas_fi_strategy_evaluations_deny_authenticated
  ON public.atlas_fi_strategy_evaluations
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.atlas_fi_strategy_evaluations FROM anon, authenticated;
GRANT ALL ON TABLE public.atlas_fi_strategy_evaluations TO service_role;

-- ---------------------------------------------------------------------------
-- 6. atlas_mission_control_processed_events
-- ---------------------------------------------------------------------------
ALTER TABLE public.atlas_mission_control_processed_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS atlas_mission_control_processed_events_deny_anon
  ON public.atlas_mission_control_processed_events;
CREATE POLICY atlas_mission_control_processed_events_deny_anon
  ON public.atlas_mission_control_processed_events
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS atlas_mission_control_processed_events_deny_authenticated
  ON public.atlas_mission_control_processed_events;
CREATE POLICY atlas_mission_control_processed_events_deny_authenticated
  ON public.atlas_mission_control_processed_events
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.atlas_mission_control_processed_events FROM anon, authenticated;
GRANT ALL ON TABLE public.atlas_mission_control_processed_events TO service_role;

-- ---------------------------------------------------------------------------
-- 7. atlas_mission_control_prospects
-- ---------------------------------------------------------------------------
ALTER TABLE public.atlas_mission_control_prospects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS atlas_mission_control_prospects_deny_anon
  ON public.atlas_mission_control_prospects;
CREATE POLICY atlas_mission_control_prospects_deny_anon
  ON public.atlas_mission_control_prospects
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS atlas_mission_control_prospects_deny_authenticated
  ON public.atlas_mission_control_prospects;
CREATE POLICY atlas_mission_control_prospects_deny_authenticated
  ON public.atlas_mission_control_prospects
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.atlas_mission_control_prospects FROM anon, authenticated;
GRANT ALL ON TABLE public.atlas_mission_control_prospects TO service_role;

-- ---------------------------------------------------------------------------
-- 8. atlas_mission_control_state
-- ---------------------------------------------------------------------------
ALTER TABLE public.atlas_mission_control_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS atlas_mission_control_state_deny_anon
  ON public.atlas_mission_control_state;
CREATE POLICY atlas_mission_control_state_deny_anon
  ON public.atlas_mission_control_state
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS atlas_mission_control_state_deny_authenticated
  ON public.atlas_mission_control_state;
CREATE POLICY atlas_mission_control_state_deny_authenticated
  ON public.atlas_mission_control_state
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.atlas_mission_control_state FROM anon, authenticated;
GRANT ALL ON TABLE public.atlas_mission_control_state TO service_role;

-- ---------------------------------------------------------------------------
-- 9. atlas_organization_securities_authority_bootstrap
--     authenticated policy uses _deny_auth (63-char identifier limit)
-- ---------------------------------------------------------------------------
ALTER TABLE public.atlas_organization_securities_authority_bootstrap ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS atlas_organization_securities_authority_bootstrap_deny_anon
  ON public.atlas_organization_securities_authority_bootstrap;
CREATE POLICY atlas_organization_securities_authority_bootstrap_deny_anon
  ON public.atlas_organization_securities_authority_bootstrap
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS atlas_organization_securities_authority_bootstrap_deny_auth
  ON public.atlas_organization_securities_authority_bootstrap;
CREATE POLICY atlas_organization_securities_authority_bootstrap_deny_auth
  ON public.atlas_organization_securities_authority_bootstrap
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.atlas_organization_securities_authority_bootstrap FROM anon, authenticated;
GRANT ALL ON TABLE public.atlas_organization_securities_authority_bootstrap TO service_role;

-- ---------------------------------------------------------------------------
-- 10. atlas_policy_documents
-- ---------------------------------------------------------------------------
ALTER TABLE public.atlas_policy_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS atlas_policy_documents_deny_anon ON public.atlas_policy_documents;
CREATE POLICY atlas_policy_documents_deny_anon
  ON public.atlas_policy_documents
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS atlas_policy_documents_deny_authenticated ON public.atlas_policy_documents;
CREATE POLICY atlas_policy_documents_deny_authenticated
  ON public.atlas_policy_documents
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.atlas_policy_documents FROM anon, authenticated;
GRANT ALL ON TABLE public.atlas_policy_documents TO service_role;

-- ---------------------------------------------------------------------------
-- 11. atlas_policy_extractions
-- ---------------------------------------------------------------------------
ALTER TABLE public.atlas_policy_extractions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS atlas_policy_extractions_deny_anon ON public.atlas_policy_extractions;
CREATE POLICY atlas_policy_extractions_deny_anon
  ON public.atlas_policy_extractions
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS atlas_policy_extractions_deny_authenticated ON public.atlas_policy_extractions;
CREATE POLICY atlas_policy_extractions_deny_authenticated
  ON public.atlas_policy_extractions
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.atlas_policy_extractions FROM anon, authenticated;
GRANT ALL ON TABLE public.atlas_policy_extractions TO service_role;

-- ---------------------------------------------------------------------------
-- 12. atlas_policy_reviews
-- ---------------------------------------------------------------------------
ALTER TABLE public.atlas_policy_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS atlas_policy_reviews_deny_anon ON public.atlas_policy_reviews;
CREATE POLICY atlas_policy_reviews_deny_anon
  ON public.atlas_policy_reviews
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS atlas_policy_reviews_deny_authenticated ON public.atlas_policy_reviews;
CREATE POLICY atlas_policy_reviews_deny_authenticated
  ON public.atlas_policy_reviews
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.atlas_policy_reviews FROM anon, authenticated;
GRANT ALL ON TABLE public.atlas_policy_reviews TO service_role;

-- ---------------------------------------------------------------------------
-- 13. atlas_timeline_entries
-- ---------------------------------------------------------------------------
ALTER TABLE public.atlas_timeline_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS atlas_timeline_entries_deny_anon ON public.atlas_timeline_entries;
CREATE POLICY atlas_timeline_entries_deny_anon
  ON public.atlas_timeline_entries
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS atlas_timeline_entries_deny_authenticated ON public.atlas_timeline_entries;
CREATE POLICY atlas_timeline_entries_deny_authenticated
  ON public.atlas_timeline_entries
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.atlas_timeline_entries FROM anon, authenticated;
GRANT ALL ON TABLE public.atlas_timeline_entries TO service_role;

-- ---------------------------------------------------------------------------
-- 14. atlas_user_securities_authorization
-- ---------------------------------------------------------------------------
ALTER TABLE public.atlas_user_securities_authorization ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS atlas_user_securities_authorization_deny_anon
  ON public.atlas_user_securities_authorization;
CREATE POLICY atlas_user_securities_authorization_deny_anon
  ON public.atlas_user_securities_authorization
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS atlas_user_securities_authorization_deny_authenticated
  ON public.atlas_user_securities_authorization;
CREATE POLICY atlas_user_securities_authorization_deny_authenticated
  ON public.atlas_user_securities_authorization
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.atlas_user_securities_authorization FROM anon, authenticated;
GRANT ALL ON TABLE public.atlas_user_securities_authorization TO service_role;

-- ---------------------------------------------------------------------------
-- 15. atlas_user_securities_authorization_history
-- ---------------------------------------------------------------------------
ALTER TABLE public.atlas_user_securities_authorization_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS atlas_user_securities_authorization_history_deny_anon
  ON public.atlas_user_securities_authorization_history;
CREATE POLICY atlas_user_securities_authorization_history_deny_anon
  ON public.atlas_user_securities_authorization_history
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS atlas_user_securities_authorization_history_deny_authenticated
  ON public.atlas_user_securities_authorization_history;
CREATE POLICY atlas_user_securities_authorization_history_deny_authenticated
  ON public.atlas_user_securities_authorization_history
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.atlas_user_securities_authorization_history FROM anon, authenticated;
GRANT ALL ON TABLE public.atlas_user_securities_authorization_history TO service_role;

-- ---------------------------------------------------------------------------
-- 16. conversation_logs
-- ---------------------------------------------------------------------------
ALTER TABLE public.conversation_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversation_logs_deny_anon ON public.conversation_logs;
CREATE POLICY conversation_logs_deny_anon
  ON public.conversation_logs
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS conversation_logs_deny_authenticated ON public.conversation_logs;
CREATE POLICY conversation_logs_deny_authenticated
  ON public.conversation_logs
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.conversation_logs FROM anon, authenticated;
GRANT ALL ON TABLE public.conversation_logs TO service_role;

-- ---------------------------------------------------------------------------
-- 17. whatsapp_outbound_deliveries (BR-075)
-- ---------------------------------------------------------------------------
ALTER TABLE public.whatsapp_outbound_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_outbound_deliveries_deny_anon
  ON public.whatsapp_outbound_deliveries;
CREATE POLICY whatsapp_outbound_deliveries_deny_anon
  ON public.whatsapp_outbound_deliveries
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS whatsapp_outbound_deliveries_deny_authenticated
  ON public.whatsapp_outbound_deliveries;
CREATE POLICY whatsapp_outbound_deliveries_deny_authenticated
  ON public.whatsapp_outbound_deliveries
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.whatsapp_outbound_deliveries FROM anon, authenticated;
GRANT ALL ON TABLE public.whatsapp_outbound_deliveries TO service_role;

-- ---------------------------------------------------------------------------
-- 18. workflow_events
-- ---------------------------------------------------------------------------
ALTER TABLE public.workflow_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workflow_events_deny_anon ON public.workflow_events;
CREATE POLICY workflow_events_deny_anon
  ON public.workflow_events
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS workflow_events_deny_authenticated ON public.workflow_events;
CREATE POLICY workflow_events_deny_authenticated
  ON public.workflow_events
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.workflow_events FROM anon, authenticated;
GRANT ALL ON TABLE public.workflow_events TO service_role;

COMMIT;
