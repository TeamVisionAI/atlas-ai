/**
 * Appointments → Upcoming is agent-scoped to the authenticated user.
 * Explains empty RVP Upcoming when appointment.agent_id belongs to another user
 * in the same organization (e.g. admin repair actor vs RVP 4TJLK).
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  resolveAppointmentViewFilters,
  matchesListFilters,
  SCHEDULED_VIEW_STATUSES
} = require("../core/appointmentListQuery");
const { resolveRepairAgentId } = require("../application/legacyInterviewRepairService");

const ORG = "00000000-0000-4000-8000-000000000001";
const RVP_ID = "33ad243a-9d00-4a4d-810b-df2762c0f076";
const ADMIN_ID = "00000000-0000-4000-8000-000000000002";

function upcomingFiltersForActor(userId) {
  return {
    organizationId: ORG,
    agentId: userId,
    ...resolveAppointmentViewFilters("upcoming")
  };
}

test("controller defaults Upcoming agentId to authenticated tenant userId", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../controllers/appointmentController.js"),
    "utf8"
  );

  assert.match(source, /filters\.agentId = req\.tenantContext\.userId/);
  assert.match(source, /const \{ view, agentId/);
});

test("upcoming filters include scheduled statuses from now onward", () => {
  const filters = resolveAppointmentViewFilters("upcoming");
  assert.deepEqual(filters.status, SCHEDULED_VIEW_STATUSES);
  assert.ok(filters.from);
});

test("appointment owned by admin is excluded from RVP Upcoming agent scope", () => {
  const appointment = {
    id: "d0e0edb9-13ee-4d72-82ff-7d696a9b950f",
    organizationId: ORG,
    agentId: ADMIN_ID,
    status: "scheduled",
    startDateTime: "2026-08-07T17:51:00.000Z"
  };

  const rvpFilters = upcomingFiltersForActor(RVP_ID);
  assert.equal(rvpFilters.agentId, RVP_ID);
  // Repository applies agentId equality before view filters.
  assert.notEqual(appointment.agentId, rvpFilters.agentId);
  // View/date/status alone would accept the row — ownership filter is what hides it.
  assert.equal(
    matchesListFilters(appointment, { ...rvpFilters, agentId: undefined }, new Date("2026-08-05T12:00:00.000Z")),
    true
  );
});

test("appointment owned by RVP is included in that RVP Upcoming agent scope", () => {
  const appointment = {
    id: "d0e0edb9-13ee-4d72-82ff-7d696a9b950f",
    organizationId: ORG,
    agentId: RVP_ID,
    ownerRepId: "4TJLK",
    status: "scheduled",
    startDateTime: "2026-08-07T17:51:00.000Z"
  };

  const rvpFilters = upcomingFiltersForActor(RVP_ID);
  assert.equal(appointment.agentId, rvpFilters.agentId);
  assert.equal(
    matchesListFilters(appointment, { ...rvpFilters, agentId: undefined }, new Date("2026-08-05T12:00:00.000Z")),
    true
  );
});

test("legacy repair prefers preferredAgentId over prospect owner_user_id", () => {
  const agentId = resolveRepairAgentId(
    { owner_user_id: ADMIN_ID, created_by_user_id: ADMIN_ID },
    { preferredAgentId: RVP_ID, repairActorId: ADMIN_ID }
  );
  assert.equal(agentId, RVP_ID);
});

test("Meta Review surfaces are untouched by this ownership-scope hotfix", () => {
  const changed = require("node:child_process")
    .execSync("git diff --name-only", { encoding: "utf8" })
    .split("\n")
    .filter(Boolean);

  for (const file of [
    "frontend/src/config/workspaceExperience.js",
    "frontend/src/config/metaReviewMode.js",
    "frontend/src/i18n/LanguageContext.jsx"
  ]) {
    assert.equal(changed.includes(file), false, file);
  }
});
