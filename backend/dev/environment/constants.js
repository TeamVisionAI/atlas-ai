/**
 * Sprint 15.4 — RC1 demo data constants (development only).
 */

const { DEFAULT_USER_ID } = require("../../services/atlasUserService");
const { DEFAULT_ORGANIZATION_ID } = require("../../modules/prospects/domain/constants");

const RC1_TAG = "rc1";
const RC1_EMAIL_DOMAIN = "rc1.atlas.dev";

const RC1_AGENT_IDS = Object.freeze({
  ana: DEFAULT_USER_ID,
  niovel: process.env.ATLAS_RC1_NIOVEL_AGENT_ID || "00000000-0000-4000-8000-000000000002"
});

const RC1_PROSPECTS = Object.freeze({
  maria: {
    key: "maria",
    displayName: "Maria Gonzalez",
    email: `maria.gonzalez@${RC1_EMAIL_DOMAIN}`,
    primaryPhone: "7875552001",
    leadSource: { sourceType: "social", sourceName: "Facebook" },
    assignedAgentId: null,
    statusLabel: "New Lead"
  },
  carlos: {
    key: "carlos",
    displayName: "Carlos Rodriguez",
    email: `carlos.rodriguez@${RC1_EMAIL_DOMAIN}`,
    primaryPhone: "7875552002",
    leadSource: { sourceType: "website", sourceName: "Website" },
    assignedAgentId: RC1_AGENT_IDS.niovel,
    assignedAgentName: "Niovel Perez",
    statusLabel: "Interview Scheduled"
  },
  andrea: {
    key: "andrea",
    displayName: "Andrea Morales",
    email: `andrea.morales@${RC1_EMAIL_DOMAIN}`,
    primaryPhone: "7875552003",
    leadSource: { sourceType: "referral", sourceName: "Referral" },
    assignedAgentId: RC1_AGENT_IDS.ana,
    assignedAgentName: "Ana Perez",
    statusLabel: "Archived"
  }
});

const DEV_TABLES = Object.freeze({
  missionControlProcessed: "atlas_mission_control_processed_events",
  missionControlState: "atlas_mission_control_state",
  missionControlProspects: "atlas_mission_control_prospects",
  executiveProcessed: "atlas_executive_dashboard_processed_events",
  executiveState: "atlas_executive_dashboard_state",
  timelineEntries: "atlas_timeline_entries",
  businessEvents: "atlas_business_events",
  coreProspects: "atlas_core_prospects",
  conversationLogs: "conversation_logs",
  workflowEvents: "workflow_events",
  legacyProspects: "prospects"
});

module.exports = {
  RC1_TAG,
  RC1_EMAIL_DOMAIN,
  RC1_AGENT_IDS,
  RC1_PROSPECTS,
  DEFAULT_ORGANIZATION_ID,
  DEV_TABLES
};
