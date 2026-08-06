/**
 * Canonical table set for migration 029 (backend-only RLS).
 * Keep in lockstep with 029_rls_backend_only_public_tables.sql
 */

const RLS_029_TABLES = Object.freeze([
  "atlas_appointments",
  "atlas_business_events",
  "atlas_executive_dashboard_processed_events",
  "atlas_executive_dashboard_state",
  "atlas_fi_strategy_evaluations",
  "atlas_mission_control_processed_events",
  "atlas_mission_control_prospects",
  "atlas_mission_control_state",
  "atlas_organization_securities_authority_bootstrap",
  "atlas_policy_documents",
  "atlas_policy_extractions",
  "atlas_policy_reviews",
  "atlas_timeline_entries",
  "atlas_user_securities_authorization",
  "atlas_user_securities_authorization_history",
  "conversation_logs",
  "whatsapp_outbound_deliveries",
  "workflow_events"
]);

/** PostgreSQL identifier max length — authenticated deny suffix shortened when needed. */
const PG_IDENTIFIER_MAX = 63;

function authenticatedDenyPolicyName(tableName) {
  const full = `${tableName}_deny_authenticated`;
  if (full.length <= PG_IDENTIFIER_MAX) {
    return full;
  }
  return `${tableName}_deny_auth`;
}

function anonDenyPolicyName(tableName) {
  return `${tableName}_deny_anon`;
}

module.exports = {
  RLS_029_TABLES,
  PG_IDENTIFIER_MAX,
  authenticatedDenyPolicyName,
  anonDenyPolicyName
};
