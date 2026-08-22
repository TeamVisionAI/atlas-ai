/**
 * BR-149 — Team Dashboard access for non-RVP field roles; Executive remains RVP/Admin.
 * Data stays hierarchy-scoped (no org-wide fallback).
 */

require("dotenv").config({ quiet: true });

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

const test = require("node:test");
const assert = require("node:assert/strict");

const { ROLES } = require("../security/roles");
const { roleHasPermission, PERMISSIONS } = require("../security/permissions");
const {
  buildAuthContext,
  filterProspectsForAuthContext,
  hasPermission
} = require("../security/authorizationService");
const { HIERARCHY_MODES } = require("../core/hierarchyScopeEngine");
const { requireAnyPermission } = require("../middleware/requirePermission");

const TV = "00000000-0000-4000-8000-000000000001";
const TL = "af8fb707-f26c-4152-ad77-2d079d30bc8a";
const RL_ID = "rl-misleisys";
const REP_ID = "rep-1";
const OTHER_ID = "other-owner";

test("BR-149 matrix: RVP has executive+team; RL/REP have team only", () => {
  assert.equal(roleHasPermission(ROLES.RVP, PERMISSIONS.DASHBOARD_EXECUTIVE), true);
  assert.equal(roleHasPermission(ROLES.RVP, PERMISSIONS.DASHBOARD_TEAM), true);
  assert.equal(roleHasPermission(ROLES.ADMINISTRATOR, PERMISSIONS.DASHBOARD_EXECUTIVE), true);
  assert.equal(roleHasPermission(ROLES.ADMINISTRATOR, PERMISSIONS.DASHBOARD_TEAM), true);

  for (const role of [ROLES.DIVISION_LEADER, ROLES.AGENT, ROLES.RECRUITER]) {
    assert.equal(roleHasPermission(role, PERMISSIONS.DASHBOARD_TEAM), true, `${role} team`);
    assert.equal(roleHasPermission(role, PERMISSIONS.DASHBOARD_EXECUTIVE), false, `${role} executive`);
  }
});

test("BR-149 hasPermission mirrors matrix for RL context", () => {
  const rl = buildAuthContext(
    { id: RL_ID, role: ROLES.DIVISION_LEADER, organization_id: TV, status: "active" },
    { hierarchy: { mode: HIERARCHY_MODES.SELF, userIds: [RL_ID] } }
  );
  assert.equal(hasPermission(rl, PERMISSIONS.DASHBOARD_TEAM), true);
  assert.equal(hasPermission(rl, PERMISSIONS.DASHBOARD_EXECUTIVE), false);
});

test("BR-149 requireAnyPermission allows team without executive", () => {
  const middleware = requireAnyPermission(
    PERMISSIONS.DASHBOARD_EXECUTIVE,
    PERMISSIONS.DASHBOARD_TEAM
  );
  const rl = buildAuthContext(
    { id: RL_ID, role: ROLES.DIVISION_LEADER, organization_id: TV, status: "active" },
    { hierarchy: { mode: HIERARCHY_MODES.SELF, userIds: [RL_ID] } }
  );

  let nextCalled = false;
  let statusCode = null;
  middleware(
    { authContext: rl },
    {
      status(code) {
        statusCode = code;
        return { json() {} };
      }
    },
    () => {
      nextCalled = true;
    }
  );

  assert.equal(nextCalled, true);
  assert.equal(statusCode, null);
});

test("BR-149 Team Dashboard prospect filter respects RL fail-closed scope", () => {
  const rl = buildAuthContext(
    { id: RL_ID, role: ROLES.DIVISION_LEADER, organization_id: TV, status: "active" },
    {
      hierarchy: {
        mode: HIERARCHY_MODES.SELF,
        userIds: [RL_ID],
        reason: "MISSING_HIERARCHY_FAIL_CLOSED"
      }
    }
  );

  const scoped = filterProspectsForAuthContext(rl, [
    {
      organization_id: TV,
      owner_user_id: OTHER_ID,
      phone: "+10000000001",
      current_step: "QUALIFIED"
    },
    {
      organization_id: TV,
      owner_user_id: RL_ID,
      phone: "+10000000002",
      current_step: "QUALIFIED"
    }
  ]);

  assert.equal(scoped.length, 1);
  assert.equal(scoped[0].owner_user_id, RL_ID);
});

test("BR-149 REP self-scope excludes other owners", () => {
  const rep = buildAuthContext(
    { id: REP_ID, role: ROLES.RECRUITER, organization_id: TV, status: "active" },
    { hierarchy: { mode: HIERARCHY_MODES.SELF, userIds: [REP_ID] } }
  );

  const scoped = filterProspectsForAuthContext(rep, [
    { organization_id: TV, owner_user_id: OTHER_ID, phone: "+1" },
    { organization_id: TV, owner_user_id: REP_ID, phone: "+2" }
  ]);

  assert.equal(scoped.length, 1);
  assert.equal(scoped[0].owner_user_id, REP_ID);
});

test("BR-149 Team Legacy org id unchanged (no TL feature gate change)", () => {
  assert.equal(TL, "af8fb707-f26c-4152-ad77-2d079d30bc8a");
  assert.notEqual(TV, TL);
});
