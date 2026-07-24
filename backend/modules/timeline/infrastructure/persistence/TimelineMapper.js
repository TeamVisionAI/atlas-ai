/**
 * Sprint 14.3 — Timeline persistence mapper.
 */

const { TimelineEntry } = require("../../domain/TimelineEntry");
const { DEFAULT_ORGANIZATION_ID } = require("../../../business-events/domain/EventMetadata");

const TABLE_NAME = "atlas_timeline_entries";

function fromRow(row) {
  if (!row) {
    return null;
  }

  return TimelineEntry.reconstitute({
    entryId: row.id,
    prospectId: row.prospect_id,
    businessEventId: row.business_event_id,
    entryType: row.entry_type,
    eventType: row.event_type,
    timestamp: row.timestamp,
    actor: row.actor,
    channel: row.channel,
    summary: row.summary,
    payload: row.payload || {},
    lifecycleStateAtEvent: row.lifecycle_state_at_event,
    correlationId: row.correlation_id,
    organizationId: row.organization_id,
    createdAt: row.created_at
  });
}

function toInsertRow(entry) {
  const json = entry.toJSON();

  return {
    id: json.entryId,
    organization_id: json.organizationId || DEFAULT_ORGANIZATION_ID,
    prospect_id: json.prospectId,
    business_event_id: json.businessEventId,
    entry_type: json.entryType,
    event_type: json.eventType,
    timestamp: json.timestamp,
    actor: json.actor,
    channel: json.channel,
    summary: json.summary,
    payload: json.payload,
    lifecycle_state_at_event: json.lifecycleStateAtEvent,
    correlation_id: json.correlationId,
    created_at: json.createdAt
  };
}

module.exports = {
  TABLE_NAME,
  fromRow,
  toInsertRow
};
