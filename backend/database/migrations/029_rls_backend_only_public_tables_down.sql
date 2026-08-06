-- ROLLBACK 029 — WARNING: Restores the prior public PostgREST exposure.
--
-- Applying this down migration re-opens anon/authenticated table privileges and
-- disables RLS on the 18 tables below. Only run when explicitly authorized.
-- Prefer re-applying 029_rls_backend_only_public_tables.sql instead of rolling back.

BEGIN;

-- 1. atlas_appointments
DROP POLICY IF EXISTS atlas_appointments_deny_anon ON public.atlas_appointments;
DROP POLICY IF EXISTS atlas_appointments_deny_authenticated ON public.atlas_appointments;
ALTER TABLE public.atlas_appointments DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.atlas_appointments TO anon, authenticated;
GRANT ALL ON TABLE public.atlas_appointments TO service_role;

-- 2. atlas_business_events
DROP POLICY IF EXISTS atlas_business_events_deny_anon ON public.atlas_business_events;
DROP POLICY IF EXISTS atlas_business_events_deny_authenticated ON public.atlas_business_events;
ALTER TABLE public.atlas_business_events DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.atlas_business_events TO anon, authenticated;
GRANT ALL ON TABLE public.atlas_business_events TO service_role;

-- 3. atlas_executive_dashboard_processed_events
DROP POLICY IF EXISTS atlas_executive_dashboard_processed_events_deny_anon
  ON public.atlas_executive_dashboard_processed_events;
DROP POLICY IF EXISTS atlas_executive_dashboard_processed_events_deny_authenticated
  ON public.atlas_executive_dashboard_processed_events;
ALTER TABLE public.atlas_executive_dashboard_processed_events DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.atlas_executive_dashboard_processed_events TO anon, authenticated;
GRANT ALL ON TABLE public.atlas_executive_dashboard_processed_events TO service_role;

-- 4. atlas_executive_dashboard_state
DROP POLICY IF EXISTS atlas_executive_dashboard_state_deny_anon
  ON public.atlas_executive_dashboard_state;
DROP POLICY IF EXISTS atlas_executive_dashboard_state_deny_authenticated
  ON public.atlas_executive_dashboard_state;
ALTER TABLE public.atlas_executive_dashboard_state DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.atlas_executive_dashboard_state TO anon, authenticated;
GRANT ALL ON TABLE public.atlas_executive_dashboard_state TO service_role;

-- 5. atlas_fi_strategy_evaluations
DROP POLICY IF EXISTS atlas_fi_strategy_evaluations_deny_anon
  ON public.atlas_fi_strategy_evaluations;
DROP POLICY IF EXISTS atlas_fi_strategy_evaluations_deny_authenticated
  ON public.atlas_fi_strategy_evaluations;
ALTER TABLE public.atlas_fi_strategy_evaluations DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.atlas_fi_strategy_evaluations TO anon, authenticated;
GRANT ALL ON TABLE public.atlas_fi_strategy_evaluations TO service_role;

-- 6. atlas_mission_control_processed_events
DROP POLICY IF EXISTS atlas_mission_control_processed_events_deny_anon
  ON public.atlas_mission_control_processed_events;
DROP POLICY IF EXISTS atlas_mission_control_processed_events_deny_authenticated
  ON public.atlas_mission_control_processed_events;
ALTER TABLE public.atlas_mission_control_processed_events DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.atlas_mission_control_processed_events TO anon, authenticated;
GRANT ALL ON TABLE public.atlas_mission_control_processed_events TO service_role;

-- 7. atlas_mission_control_prospects
DROP POLICY IF EXISTS atlas_mission_control_prospects_deny_anon
  ON public.atlas_mission_control_prospects;
DROP POLICY IF EXISTS atlas_mission_control_prospects_deny_authenticated
  ON public.atlas_mission_control_prospects;
ALTER TABLE public.atlas_mission_control_prospects DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.atlas_mission_control_prospects TO anon, authenticated;
GRANT ALL ON TABLE public.atlas_mission_control_prospects TO service_role;

-- 8. atlas_mission_control_state
DROP POLICY IF EXISTS atlas_mission_control_state_deny_anon
  ON public.atlas_mission_control_state;
DROP POLICY IF EXISTS atlas_mission_control_state_deny_authenticated
  ON public.atlas_mission_control_state;
ALTER TABLE public.atlas_mission_control_state DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.atlas_mission_control_state TO anon, authenticated;
GRANT ALL ON TABLE public.atlas_mission_control_state TO service_role;

-- 9. atlas_organization_securities_authority_bootstrap
DROP POLICY IF EXISTS atlas_organization_securities_authority_bootstrap_deny_anon
  ON public.atlas_organization_securities_authority_bootstrap;
DROP POLICY IF EXISTS atlas_organization_securities_authority_bootstrap_deny_auth
  ON public.atlas_organization_securities_authority_bootstrap;
ALTER TABLE public.atlas_organization_securities_authority_bootstrap DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.atlas_organization_securities_authority_bootstrap TO anon, authenticated;
GRANT ALL ON TABLE public.atlas_organization_securities_authority_bootstrap TO service_role;

-- 10. atlas_policy_documents
DROP POLICY IF EXISTS atlas_policy_documents_deny_anon ON public.atlas_policy_documents;
DROP POLICY IF EXISTS atlas_policy_documents_deny_authenticated ON public.atlas_policy_documents;
ALTER TABLE public.atlas_policy_documents DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.atlas_policy_documents TO anon, authenticated;
GRANT ALL ON TABLE public.atlas_policy_documents TO service_role;

-- 11. atlas_policy_extractions
DROP POLICY IF EXISTS atlas_policy_extractions_deny_anon ON public.atlas_policy_extractions;
DROP POLICY IF EXISTS atlas_policy_extractions_deny_authenticated ON public.atlas_policy_extractions;
ALTER TABLE public.atlas_policy_extractions DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.atlas_policy_extractions TO anon, authenticated;
GRANT ALL ON TABLE public.atlas_policy_extractions TO service_role;

-- 12. atlas_policy_reviews
DROP POLICY IF EXISTS atlas_policy_reviews_deny_anon ON public.atlas_policy_reviews;
DROP POLICY IF EXISTS atlas_policy_reviews_deny_authenticated ON public.atlas_policy_reviews;
ALTER TABLE public.atlas_policy_reviews DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.atlas_policy_reviews TO anon, authenticated;
GRANT ALL ON TABLE public.atlas_policy_reviews TO service_role;

-- 13. atlas_timeline_entries
DROP POLICY IF EXISTS atlas_timeline_entries_deny_anon ON public.atlas_timeline_entries;
DROP POLICY IF EXISTS atlas_timeline_entries_deny_authenticated ON public.atlas_timeline_entries;
ALTER TABLE public.atlas_timeline_entries DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.atlas_timeline_entries TO anon, authenticated;
GRANT ALL ON TABLE public.atlas_timeline_entries TO service_role;

-- 14. atlas_user_securities_authorization
DROP POLICY IF EXISTS atlas_user_securities_authorization_deny_anon
  ON public.atlas_user_securities_authorization;
DROP POLICY IF EXISTS atlas_user_securities_authorization_deny_authenticated
  ON public.atlas_user_securities_authorization;
ALTER TABLE public.atlas_user_securities_authorization DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.atlas_user_securities_authorization TO anon, authenticated;
GRANT ALL ON TABLE public.atlas_user_securities_authorization TO service_role;

-- 15. atlas_user_securities_authorization_history
DROP POLICY IF EXISTS atlas_user_securities_authorization_history_deny_anon
  ON public.atlas_user_securities_authorization_history;
DROP POLICY IF EXISTS atlas_user_securities_authorization_history_deny_authenticated
  ON public.atlas_user_securities_authorization_history;
ALTER TABLE public.atlas_user_securities_authorization_history DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.atlas_user_securities_authorization_history TO anon, authenticated;
GRANT ALL ON TABLE public.atlas_user_securities_authorization_history TO service_role;

-- 16. conversation_logs
DROP POLICY IF EXISTS conversation_logs_deny_anon ON public.conversation_logs;
DROP POLICY IF EXISTS conversation_logs_deny_authenticated ON public.conversation_logs;
ALTER TABLE public.conversation_logs DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.conversation_logs TO anon, authenticated;
GRANT ALL ON TABLE public.conversation_logs TO service_role;

-- 17. whatsapp_outbound_deliveries
DROP POLICY IF EXISTS whatsapp_outbound_deliveries_deny_anon
  ON public.whatsapp_outbound_deliveries;
DROP POLICY IF EXISTS whatsapp_outbound_deliveries_deny_authenticated
  ON public.whatsapp_outbound_deliveries;
ALTER TABLE public.whatsapp_outbound_deliveries DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.whatsapp_outbound_deliveries TO anon, authenticated;
GRANT ALL ON TABLE public.whatsapp_outbound_deliveries TO service_role;

-- 18. workflow_events
DROP POLICY IF EXISTS workflow_events_deny_anon ON public.workflow_events;
DROP POLICY IF EXISTS workflow_events_deny_authenticated ON public.workflow_events;
ALTER TABLE public.workflow_events DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.workflow_events TO anon, authenticated;
GRANT ALL ON TABLE public.workflow_events TO service_role;

COMMIT;
