/**
 * Sprint 14.1 — Persistence mapper (infrastructure).
 * Translates between database rows and the Prospect aggregate.
 */

const { Prospect } = require("../../domain/Prospect");
const { DEFAULT_ORGANIZATION_ID, LIFECYCLE_STATES } = require("../../domain/constants");
const { PhoneNumber } = require("../../domain/value-objects/PhoneNumber");

function normalizePhone(value) {
  return PhoneNumber.normalize(value);
}

function fromRow(row) {
  if (!row) {
    return null;
  }

  return Prospect.reconstitute({
    prospectId: row.id,
    organizationId: row.organization_id,
    displayName: row.display_name,
    legalName: row.legal_name,
    contact: {
      primaryPhone: row.primary_phone,
      secondaryPhone: row.secondary_phone,
      normalizedPrimaryPhone: row.normalized_primary_phone,
      email: row.email,
      secondaryEmail: row.secondary_email,
      preferredLanguage: row.preferred_language,
      timezone: row.timezone,
      address: row.address || {}
    },
    leadSource: row.lead_source || {},
    communicationChannels: row.communication_channels || [],
    status: {
      lifecycleState: row.lifecycle_state,
      milestone: row.milestone,
      ownership: row.ownership,
      stateEnteredAt: row.state_entered_at,
      previousState: row.previous_state
    },
    assignedAgent: {
      assignedAgentId: row.assigned_agent_id,
      assignedAt: row.assigned_at,
      assignedBy: row.assigned_by,
      assignmentReason: row.assignment_reason
    },
    appointments: row.appointments || [],
    activities: row.activities || [],
    timeline: row.timeline_meta || {},
    tags: row.tags || [],
    customFields: row.custom_fields || {},
    aiInsights: row.ai_insights || [],
    businessRelationships: row.business_relationships || {},
    mergedIntoId: row.merged_into_id,
    archivedAt: row.archived_at,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  });
}

function toInsertRow(prospect) {
  const json = prospect.toJSON();

  return {
    id: json.prospectId,
    organization_id: json.organizationId || DEFAULT_ORGANIZATION_ID,
    display_name: json.identity.displayName,
    legal_name: json.identity.legalName,
    primary_phone: json.contact.primaryPhone,
    secondary_phone: json.contact.secondaryPhone,
    normalized_primary_phone: json.contact.normalizedPrimaryPhone,
    email: json.contact.email,
    secondary_email: json.contact.secondaryEmail,
    preferred_language: json.contact.preferredLanguage,
    timezone: json.contact.timezone,
    address: json.contact.address,
    lead_source: json.leadSource,
    communication_channels: json.communicationChannels,
    lifecycle_state: json.status.lifecycleState || LIFECYCLE_STATES.NEW_LEAD,
    milestone: json.status.milestone,
    ownership: json.status.ownership,
    state_entered_at: json.status.stateEnteredAt,
    previous_state: json.status.previousState,
    assigned_agent_id: json.assignedAgent.assignedAgentId,
    assigned_at: json.assignedAgent.assignedAt,
    assigned_by: json.assignedAgent.assignedBy,
    assignment_reason: json.assignedAgent.assignmentReason,
    appointments: json.appointments,
    activities: json.activities,
    timeline_meta: json.timeline,
    tags: json.tags,
    custom_fields: json.customFields,
    ai_insights: json.aiInsights,
    business_relationships: json.businessRelationships,
    merged_into_id: json.identity.mergedIntoId,
    archived_at: json.archivedAt,
    deleted_at: json.deletedAt,
    created_at: json.identity.createdAt,
    updated_at: json.identity.updatedAt
  };
}

function toUpdateRow(prospect) {
  const row = toInsertRow(prospect);
  delete row.id;
  delete row.created_at;
  return row;
}

function toReadModel(prospect) {
  return prospect.toJSON();
}

module.exports = {
  normalizePhone,
  fromRow,
  toInsertRow,
  toUpdateRow,
  toReadModel,
  mapRowToProspect: (row) => (fromRow(row) ? toReadModel(fromRow(row)) : null),
  mapProspectToInsert: (input, prospectId) => {
    const prospect = Prospect.create({ ...input, prospectId });
    return toInsertRow(prospect);
  }
};
