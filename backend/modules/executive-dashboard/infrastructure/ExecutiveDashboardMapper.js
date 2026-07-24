/**
 * Sprint 15.1 — Executive Dashboard persistence mapper.
 */

const { DEFAULT_ORGANIZATION_ID } = require("../../prospects/domain/constants");
const { createEmptyMetrics } = require("../domain/ExecutiveDashboardMetrics");

const STATE_TABLE = "atlas_executive_dashboard_state";
const PROCESSED_TABLE = "atlas_executive_dashboard_processed_events";

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

function toProcessedRow(eventId, organizationId) {
  return {
    business_event_id: eventId,
    organization_id: organizationId || DEFAULT_ORGANIZATION_ID,
    processed_at: new Date().toISOString()
  };
}

module.exports = {
  STATE_TABLE,
  PROCESSED_TABLE,
  toStateRow,
  fromStateRow,
  toProcessedRow
};
