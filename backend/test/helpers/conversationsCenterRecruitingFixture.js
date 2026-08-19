/**
 * Shared recruiting-eligible prospect fixtures for Conversations Center tests.
 */

const TEAM_VISION = "00000000-0000-4000-8000-000000000001";
const NIOVEL = "33ad243a-9d00-4a4d-810b-df2762c0f076";

function recruitingProspectFixture(overrides = {}) {
  const workflow_state = {
    atlasEligibilitySource: "QR",
    ...(overrides.workflow_state || {})
  };
  const { workflow_state: _ignored, ...rest } = overrides;

  return {
    id: rest.id || "p-cc-fixture",
    organization_id: TEAM_VISION,
    owner_user_id: NIOVEL,
    phone: rest.phone || "+17865551001",
    name: rest.name || "Prospect",
    source: rest.source ?? "car_magnet",
    entry_method: rest.entry_method ?? "QR",
    current_step: rest.current_step || "QUALIFICATION",
    updated_at: rest.updated_at || "2026-08-10T12:00:00.000Z",
    created_at: rest.created_at || "2026-08-10T12:00:00.000Z",
    workflow_state,
    ...rest
  };
}

async function seedRecruitingWorkflowState(phone, patch = {}, scope = {}) {
  const { savePersistedWorkflowState } = require("../../core/workflowStateStore");
  return savePersistedWorkflowState(
    phone,
    {
      atlasEligibilitySource: "QR",
      ...patch
    },
    scope
  );
}

module.exports = {
  TEAM_VISION,
  NIOVEL,
  recruitingProspectFixture,
  seedRecruitingWorkflowState
};
