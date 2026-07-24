/**
 * Sprint 15.0 — Mission Control persistence mapper.
 */

const { DEFAULT_ORGANIZATION_ID } = require("../../prospects/domain/constants");
const { createEmptyMetrics } = require("../domain/MissionControlMetrics");

const STATE_TABLE = "atlas_mission_control_state";
const PROSPECT_TABLE = "atlas_mission_control_prospects";
const PROCESSED_TABLE = "atlas_mission_control_processed_events";

function toStateRow(readModel) {
  return {
    organization_id: readModel.organizationId,
    updated_at: readModel.updatedAt,
    metrics: readModel.metrics,
    prospects: readModel.prospects
  };
}

function fromStateRow(row) {
  if (!row) {
    return null;
  }

  return {
    organizationId: row.organization_id,
    updatedAt: row.updated_at,
    metrics: row.metrics || createEmptyMetrics(),
    prospects: row.prospects || {}
  };
}

function toProspectRow(prospect, organizationId) {
  return {
    prospect_id: prospect.prospectId,
    organization_id: organizationId,
    is_active: prospect.isActive,
    lifecycle_state: prospect.lifecycleState,
    assigned_agent_id: prospect.assignedAgentId,
    contact_attempt_count: prospect.contactAttemptCount,
    is_qualified: prospect.isQualified,
    has_scheduled_interview: prospect.hasScheduledInterview,
    has_completed_interview: prospect.hasCompletedInterview,
    is_archived: prospect.isArchived,
    merged_into_id: prospect.mergedIntoId,
    last_event_id: prospect.lastEventId,
    last_event_at: prospect.lastEventAt,
    last_event_type: prospect.lastEventType,
    updated_at: new Date().toISOString()
  };
}

function fromProspectRow(row) {
  if (!row) {
    return null;
  }

  return {
    prospectId: row.prospect_id,
    organizationId: row.organization_id || DEFAULT_ORGANIZATION_ID,
    isActive: row.is_active,
    lifecycleState: row.lifecycle_state,
    assignedAgentId: row.assigned_agent_id,
    contactAttemptCount: row.contact_attempt_count || 0,
    isQualified: row.is_qualified || false,
    hasScheduledInterview: row.has_scheduled_interview || false,
    hasCompletedInterview: row.has_completed_interview || false,
    isArchived: row.is_archived || false,
    mergedIntoId: row.merged_into_id,
    lastEventId: row.last_event_id,
    lastEventAt: row.last_event_at,
    lastEventType: row.last_event_type
  };
}

function toProcessedRow(eventId, organizationId) {
  return {
    business_event_id: eventId,
    organization_id: organizationId || DEFAULT_ORGANIZATION_ID,
    processed_at: new Date().toISOString()
  };
}

module.exports = {
  STATE_TABLE,
  PROSPECT_TABLE,
  PROCESSED_TABLE,
  toStateRow,
  fromStateRow,
  toProspectRow,
  fromProspectRow,
  toProcessedRow
};
