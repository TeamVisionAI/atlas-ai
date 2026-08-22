/**
 * Team Vision user invitations — access, ranks, Atlas invite URLs, tenant isolation.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  BUSINESS_RANK_ORDER,
  BUSINESS_RANK_LABELS,
  defaultPermissionRoleForBusinessRank,
  listBusinessRanks,
  normalizeBusinessRank
} = require("../core/teamVisionBusinessRanks");
const {
  ATLAS_APP_ORIGIN,
  buildAcceptInvitationUrl,
  resolveInvitationFrontendBaseUrl
} = require("../config/frontendBaseUrl");
const { roleHasPermission, PERMISSIONS } = require("../security/permissions");
const { ROLES } = require("../security/roles");
const { resolveEffectiveOrganizationId } = require("../core/effectiveOrganizationContext");

const TV_ORG = "00000000-0000-4000-8000-000000000001";
const TL_ORG = "af8fb707-f26c-4152-ad77-2d079d30bc8a";

test("business rank hierarchy is exact RVP → SRL → RL → DIV → DIS → REP", () => {
  assert.deepEqual(BUSINESS_RANK_ORDER, ["RVP", "SRL", "RL", "DIV", "DIS", "REP"]);
  assert.match(BUSINESS_RANK_LABELS.RVP, /Regional Vice President/);
  assert.match(BUSINESS_RANK_LABELS.SRL, /Senior Regional Leader/);
  assert.match(BUSINESS_RANK_LABELS.RL, /Regional Leader/);
  assert.match(BUSINESS_RANK_LABELS.DIV, /Division Leader/);
  assert.match(BUSINESS_RANK_LABELS.DIS, /District Leader/);
  assert.match(BUSINESS_RANK_LABELS.REP, /Representative/);
  assert.equal(listBusinessRanks().length, 6);
});

test("field ranks default to non-admin permission roles", () => {
  assert.equal(defaultPermissionRoleForBusinessRank("REP"), "recruiter");
  assert.equal(defaultPermissionRoleForBusinessRank("DIS"), "agent");
  assert.equal(defaultPermissionRoleForBusinessRank("DIV"), "division_leader");
  assert.equal(defaultPermissionRoleForBusinessRank("RL"), "division_leader");
  assert.equal(defaultPermissionRoleForBusinessRank("SRL"), "division_leader");
  assert.equal(defaultPermissionRoleForBusinessRank("RVP"), "rvp");
  assert.notEqual(defaultPermissionRoleForBusinessRank("REP"), "administrator");
});

test("Owner/RVP and Admin can invite; REP cannot by default", () => {
  assert.equal(roleHasPermission(ROLES.RVP, PERMISSIONS.ADMIN_USERS), true);
  assert.equal(roleHasPermission(ROLES.ADMINISTRATOR, PERMISSIONS.ADMIN_USERS), true);
  assert.equal(roleHasPermission(ROLES.RECRUITER, PERMISSIONS.ADMIN_USERS), false);
  assert.equal(roleHasPermission(ROLES.AGENT, PERMISSIONS.ADMIN_USERS), false);
  assert.equal(roleHasPermission(ROLES.DIVISION_LEADER, PERMISSIONS.ADMIN_USERS), false);
});

test("Atlas invite URL remaps Team Vision marketing FRONTEND_URL", () => {
  const url = buildAcceptInvitationUrl("token-abc", {
    NODE_ENV: "production",
    FRONTEND_URL: "https://www.teamvisionfinancial.com"
  });
  assert.equal(url, `${ATLAS_APP_ORIGIN}/app/accept-invitation?token=token-abc`);
  assert.equal(
    resolveInvitationFrontendBaseUrl({
      NODE_ENV: "production",
      FRONTEND_URL: "https://teamvisionfinancial.com"
    }),
    ATLAS_APP_ORIGIN
  );
  assert.equal(
    resolveInvitationFrontendBaseUrl({
      NODE_ENV: "production",
      FRONTEND_URL: "https://app.useatlas-ai.com"
    }),
    "https://app.useatlas-ai.com"
  );
  assert.equal(
    resolveInvitationFrontendBaseUrl({ NODE_ENV: "production" }),
    ATLAS_APP_ORIGIN
  );
});

test("Support Mode effective org is Team Vision when supporting TV", () => {
  const effective = resolveEffectiveOrganizationId(
    { organizationId: TV_ORG, homeOrganizationId: TV_ORG, saasRole: "SUPER_ADMIN" },
    { organizationId: TL_ORG, active: true }
  );
  assert.equal(effective, TL_ORG);

  const home = resolveEffectiveOrganizationId(
    { organizationId: TV_ORG, homeOrganizationId: TV_ORG },
    null
  );
  assert.equal(home, TV_ORG);
});

test("Team Vision and Team Legacy org IDs remain distinct for invite scoping", () => {
  assert.notEqual(TV_ORG, TL_ORG);
});

test("normalizeBusinessRank rejects Field Trainer / Senior Rep as formal ranks", () => {
  assert.equal(normalizeBusinessRank("field_trainer"), null);
  assert.equal(normalizeBusinessRank("senior_representative"), null);
  assert.equal(normalizeBusinessRank("REP"), "REP");
  assert.equal(normalizeBusinessRank("SRL"), "SRL");
});
