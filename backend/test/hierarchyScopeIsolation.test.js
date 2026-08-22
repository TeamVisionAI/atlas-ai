/**
 * Hierarchy scope + RL fail-closed + display title contracts.
 */

require("dotenv").config({ quiet: true });

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  HIERARCHY_MODES,
  resolveHierarchyScopeForUser,
  collectDescendantIds,
  buildChildrenByParent,
  prospectBelongsToScopedUsers
} = require("../core/hierarchyScopeEngine");
const {
  buildAuthContext,
  canAccessProspect,
  getProspectListScope,
  filterProspectsForAuthContext
} = require("../security/authorizationService");
const { ROLES } = require("../security/roles");
const { roleHasPermission, PERMISSIONS } = require("../security/permissions");
const {
  isProspectInConversationsUserScope
} = require("../core/conversationsCenter/conversationsCenterAccess");

const TV = "00000000-0000-4000-8000-000000000001";
const RVP_ID = "rvp-1";
const RL_ID = "rl-1";
const OWNER_ID = "owner-prospect";

test("missing hierarchy fails closed to self — never org-wide", async () => {
  const scope = await resolveHierarchyScopeForUser(
    {
      id: RL_ID,
      role: ROLES.DIVISION_LEADER,
      organization_id: TV,
      reports_to_user_id: null
    },
    { loadOrgUsers: async () => [{ id: RL_ID, reports_to_user_id: null, status: "active" }] }
  );

  assert.equal(scope.mode, HIERARCHY_MODES.SELF);
  assert.deepEqual(scope.userIds, [RL_ID]);
  assert.match(scope.reason, /FAIL_CLOSED/);
});

test("RL subtree includes self + reports", async () => {
  const scope = await resolveHierarchyScopeForUser(
    {
      id: RL_ID,
      role: ROLES.DIVISION_LEADER,
      organization_id: TV
    },
    {
      loadOrgUsers: async () => [
        { id: RL_ID, reports_to_user_id: RVP_ID, status: "active" },
        { id: "rep-1", reports_to_user_id: RL_ID, status: "active" },
        { id: "rep-2", reports_to_user_id: RL_ID, status: "active" },
        { id: "other", reports_to_user_id: RVP_ID, status: "active" }
      ]
    }
  );

  assert.equal(scope.mode, HIERARCHY_MODES.SUBTREE);
  assert.ok(scope.userIds.includes(RL_ID));
  assert.ok(scope.userIds.includes("rep-1"));
  assert.ok(scope.userIds.includes("rep-2"));
  assert.ok(!scope.userIds.includes("other"));
});

test("RVP sees full org via canAccessProspect; RL cannot see unrelated RVP prospect", () => {
  const rvp = buildAuthContext(
    { id: RVP_ID, role: ROLES.RVP, organization_id: TV, status: "active" },
    { hierarchy: { mode: HIERARCHY_MODES.ORGANIZATION, userIds: null } }
  );
  const rl = buildAuthContext(
    {
      id: RL_ID,
      role: ROLES.DIVISION_LEADER,
      business_rank: "RL",
      organization_id: TV,
      status: "active"
    },
    {
      hierarchy: {
        mode: HIERARCHY_MODES.SELF,
        userIds: [RL_ID],
        reason: "MISSING_HIERARCHY_FAIL_CLOSED"
      }
    }
  );

  const ownerProspect = {
    organization_id: TV,
    owner_user_id: OWNER_ID,
    assigned_agent_id: null
  };
  const rlProspect = {
    organization_id: TV,
    owner_user_id: RL_ID
  };

  assert.equal(canAccessProspect(rvp, ownerProspect), true);
  assert.equal(canAccessProspect(rl, ownerProspect), false);
  assert.equal(canAccessProspect(rl, rlProspect), true);
});

test("getProspectListScope for RL without hierarchy is owner-only not org-wide", () => {
  const rl = buildAuthContext(
    { id: RL_ID, role: ROLES.DIVISION_LEADER, organization_id: TV, status: "active" },
    { hierarchy: { mode: HIERARCHY_MODES.SELF, userIds: [RL_ID] } }
  );
  const scope = getProspectListScope(rl);
  assert.equal(scope.organizationId, TV);
  assert.equal(scope.ownerUserId, RL_ID);
  assert.equal(scope.divisionId, undefined);
});

test("Conversations user scope excludes unrelated org prospects for RL", () => {
  const rl = buildAuthContext(
    { id: RL_ID, role: ROLES.DIVISION_LEADER, organization_id: TV, status: "active" },
    { hierarchy: { mode: HIERARCHY_MODES.SELF, userIds: [RL_ID] } }
  );
  assert.equal(
    isProspectInConversationsUserScope(
      { organization_id: TV, owner_user_id: OWNER_ID },
      TV,
      rl
    ),
    false
  );
  assert.equal(
    isProspectInConversationsUserScope({ organization_id: TV, owner_user_id: RL_ID }, TV, rl),
    true
  );
});

test("division_leader lacks org:write and dashboard:executive", () => {
  assert.equal(roleHasPermission(ROLES.DIVISION_LEADER, PERMISSIONS.ORG_WRITE), false);
  assert.equal(roleHasPermission(ROLES.DIVISION_LEADER, PERMISSIONS.DASHBOARD_EXECUTIVE), false);
  assert.equal(roleHasPermission(ROLES.RVP, PERMISSIONS.ORG_WRITE), true);
});

test("filterProspectsForAuthContext keeps only RL-owned when fail-closed", () => {
  const rl = buildAuthContext(
    { id: RL_ID, role: ROLES.DIVISION_LEADER, organization_id: TV, status: "active" },
    { hierarchy: { mode: HIERARCHY_MODES.SELF, userIds: [RL_ID] } }
  );
  const filtered = filterProspectsForAuthContext(rl, [
    { organization_id: TV, owner_user_id: OWNER_ID },
    { organization_id: TV, owner_user_id: RL_ID }
  ]);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].owner_user_id, RL_ID);
});

test("prospectBelongsToScopedUsers helper", () => {
  assert.equal(
    prospectBelongsToScopedUsers({ owner_user_id: "a" }, ["a", "b"]),
    true
  );
  assert.equal(prospectBelongsToScopedUsers({ owner_user_id: "z" }, ["a"]), false);
});

test("collectDescendantIds walks tree", () => {
  const children = buildChildrenByParent([
    { id: "c1", reports_to_user_id: "root" },
    { id: "c2", reports_to_user_id: "c1" }
  ]);
  assert.deepEqual(collectDescendantIds("root", children).sort(), ["c1", "c2"]);
});
