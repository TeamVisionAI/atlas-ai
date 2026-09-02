/**
 * Same phone may exist in two tenants. Null-org logs must not cross.
 */

process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("path");

const { TEAM_VISION_ORGANIZATION_ID } = require("../core/teamVisionSeedTenant");
const { SAAS_ROLES } = require("../security/saasRoles");
const { ROLES } = require("../security/roles");
const { permissionsForRole } = require("../security/permissions");
const {
  buildPhoneOrgIndex,
  filterConversationLogsForTenant,
  isPhoneTenantCollision,
  logBelongsToTenant
} = require("../core/conversationLogTenantScope");
const {
  buildConversationsCenterReadModel
} = require("../core/conversationsCenter/conversationsCenterReadModel");
const {
  resolveEffectiveOrganizationId,
  isGlobalSuperAdminControlPlane
} = require("../core/effectiveOrganizationContext");

const ORG_TV = TEAM_VISION_ORGANIZATION_ID;
const ORG_TL = "af8fb707-f26c-4152-ad77-2d079d30bc8a";
const ORG_NEW = "11111111-2222-4333-8444-555555555555";
const PHONE = "+18134083903";

const TV_PROSPECT = {
  id: "tv-same-phone",
  phone: PHONE,
  name: "Vision Contact",
  organization_id: ORG_TV,
  owner_user_id: "admin-00000000",
  current_step: "QUALIFICATION",
  source: "FACEBOOK",
  entry_method: "CLICK_TO_WHATSAPP",
  appointment_status: "none",
  updated_at: "2026-08-24T20:00:00.000Z",
  workflow_state: { atlasEligibilitySource: "CAMPAIGN_INTAKE_CODE" }
};

const TL_PROSPECT = {
  id: "tl-same-phone",
  phone: PHONE,
  name: "Legacy Contact",
  organization_id: ORG_TL,
  owner_user_id: "admin-af8fb707",
  current_step: "QUALIFICATION",
  source: "FACEBOOK",
  entry_method: "CLICK_TO_WHATSAPP",
  appointment_status: "none",
  updated_at: "2026-08-27T11:35:00.000Z",
  workflow_state: { atlasEligibilitySource: "CAMPAIGN_INTAKE_CODE" }
};

const TV_ONLY = {
  ...TV_PROSPECT,
  id: "tv-only",
  phone: "+17865551001"
};

function tenantAdmin(organizationId) {
  return {
    userId: `admin-${organizationId.slice(0, 8)}`,
    organizationId,
    role: ROLES.ADMINISTRATOR,
    saasRole: SAAS_ROLES.ADMIN,
    permissions: permissionsForRole(ROLES.ADMINISTRATOR),
    status: "active"
  };
}

function superAdmin() {
  return {
    userId: "00000000-0000-4000-8000-000000000002",
    organizationId: ORG_TV,
    role: ROLES.ADMINISTRATOR,
    saasRole: SAAS_ROLES.SUPER_ADMIN,
    permissions: permissionsForRole(ROLES.ADMINISTRATOR),
    status: "active"
  };
}

const COLLISION_INDEX = buildPhoneOrgIndex([TV_PROSPECT, TL_PROSPECT]);
const UNIQUE_INDEX = buildPhoneOrgIndex([TV_ONLY]);

const NULL_ORG_LOG = {
  id: "log-null",
  prospect_phone: PHONE,
  organization_id: null,
  lastMessagePreview: "Disculpe quisiera que pudieramos agendar",
  direction: "outgoing",
  created_at: "2026-08-27T11:35:31.000Z",
  message: "Disculpe quisiera que pudieramos agendar"
};

const TV_LOG = {
  id: "log-tv",
  prospect_phone: PHONE,
  organization_id: ORG_TV,
  direction: "outgoing",
  created_at: "2026-08-24T20:00:48.000Z",
  message: "Team Vision owned reply"
};

const TL_LOG = {
  id: "log-tl",
  prospect_phone: PHONE,
  organization_id: ORG_TL,
  direction: "outgoing",
  created_at: "2026-08-27T11:35:31.000Z",
  message: "Team Legacy owned reply"
};

test("1. same phone may exist in two tenants without collision", () => {
  assert.equal(isPhoneTenantCollision(PHONE, ORG_TV, COLLISION_INDEX), true);
  assert.equal(isPhoneTenantCollision(PHONE, ORG_TL, COLLISION_INDEX), true);
  assert.equal(isPhoneTenantCollision("+17865551001", ORG_TV, UNIQUE_INDEX), false);
});

test("2. Team Vision cannot see Team Legacy conversation", async () => {
  const model = await buildConversationsCenterReadModel({
    organizationId: ORG_TV,
    authContext: tenantAdmin(ORG_TV),
    workspaceScope: "oversight",
    prospects: [TV_PROSPECT, TL_PROSPECT],
    conversationLogsByPhone: new Map([
      [PHONE, filterConversationLogsForTenant([NULL_ORG_LOG, TL_LOG, TV_LOG], ORG_TV, COLLISION_INDEX)]
    ])
  });
  assert.deepEqual(model.items.map((row) => row.id), [TV_PROSPECT.id]);
  assert.equal(model.items[0].lastMessagePreview, "Team Vision owned reply");
  assert.doesNotMatch(String(model.items[0].lastMessagePreview || ""), /Legacy|Disculpe/);
});

test("3. Team Legacy cannot see Team Vision conversation", async () => {
  const model = await buildConversationsCenterReadModel({
    organizationId: ORG_TL,
    authContext: tenantAdmin(ORG_TL),
    workspaceScope: "oversight",
    prospects: [TV_PROSPECT, TL_PROSPECT],
    conversationLogsByPhone: new Map([
      [PHONE, filterConversationLogsForTenant([NULL_ORG_LOG, TL_LOG, TV_LOG], ORG_TL, COLLISION_INDEX)]
    ])
  });
  assert.deepEqual(model.items.map((row) => row.id), [TL_PROSPECT.id]);
  assert.equal(model.items[0].lastMessagePreview, "Team Legacy owned reply");
  assert.doesNotMatch(String(model.items[0].lastMessagePreview || ""), /Team Vision owned/);
});

test("4. null-org conversation_log cannot make a thread operational in a colliding tenant", () => {
  const tv = filterConversationLogsForTenant([NULL_ORG_LOG], ORG_TV, COLLISION_INDEX);
  const tl = filterConversationLogsForTenant([NULL_ORG_LOG], ORG_TL, COLLISION_INDEX);
  assert.deepEqual(tv, []);
  assert.deepEqual(tl, []);
  assert.equal(logBelongsToTenant(NULL_ORG_LOG, ORG_TV, { colliding: true }), false);
});

test("5. phone-only lookup cannot cross tenant", () => {
  assert.equal(logBelongsToTenant(TL_LOG, ORG_TV, { colliding: true }), false);
  assert.equal(logBelongsToTenant(TV_LOG, ORG_TL, { colliding: true }), false);
  assert.equal(logBelongsToTenant({ ...NULL_ORG_LOG, prospect_phone: PHONE }, ORG_NEW, { colliding: true }), false);
});

test("6. Support Mode enter/exit rebinds correctly", () => {
  const home = superAdmin();
  assert.equal(resolveEffectiveOrganizationId(home, { organizationId: ORG_TL }), ORG_TL);
  assert.equal(isGlobalSuperAdminControlPlane(home, { organizationId: ORG_TL }), false);
  assert.equal(isGlobalSuperAdminControlPlane(home, null), true);
  assert.equal(resolveEffectiveOrganizationId(home, null), null);
});

test("7. direct tenant login stays isolated", async () => {
  const tv = await buildConversationsCenterReadModel({
    organizationId: ORG_TV,
    authContext: tenantAdmin(ORG_TV),
    workspaceScope: "oversight",
    prospects: [TV_PROSPECT, TL_PROSPECT],
    conversationLogsByPhone: new Map()
  });
  const tl = await buildConversationsCenterReadModel({
    organizationId: ORG_TL,
    authContext: tenantAdmin(ORG_TL),
    workspaceScope: "oversight",
    prospects: [TV_PROSPECT, TL_PROSPECT],
    conversationLogsByPhone: new Map()
  });
  assert.deepEqual(tv.items.map((row) => row.id), [TV_PROSPECT.id]);
  assert.deepEqual(tl.items.map((row) => row.id), [TL_PROSPECT.id]);
});

test("8. global Super Admin control plane stays empty", () => {
  const home = superAdmin();
  assert.equal(isGlobalSuperAdminControlPlane(home, {}), true);
  assert.equal(resolveEffectiveOrganizationId(home, {}), null);
});

test("9. arbitrary third tenant is isolated", async () => {
  const model = await buildConversationsCenterReadModel({
    organizationId: ORG_NEW,
    authContext: tenantAdmin(ORG_NEW),
    workspaceScope: "oversight",
    prospects: [TV_PROSPECT, TL_PROSPECT],
    conversationLogsByPhone: new Map([[PHONE, [NULL_ORG_LOG, TV_LOG, TL_LOG]]])
  });
  assert.deepEqual(model.items, []);
});

test("10. existing legitimate conversation history still loads for unique phones", () => {
  const uniqueLogs = filterConversationLogsForTenant(
    [{ ...NULL_ORG_LOG, prospect_phone: "+17865551001" }],
    ORG_TV,
    UNIQUE_INDEX
  );
  assert.equal(uniqueLogs.length, 1);
  assert.equal(logBelongsToTenant({ ...NULL_ORG_LOG, prospect_phone: "+17865551001" }, ORG_TV, { colliding: false }), true);
});

test("logService and Conversations list no longer treat phone as tenant identity", () => {
  const logService = fs.readFileSync(
    path.join(__dirname, "../services/logService.js"),
    "utf8"
  );
  const readModel = fs.readFileSync(
    path.join(__dirname, "../core/conversationsCenter/conversationsCenterReadModel.js"),
    "utf8"
  );
  assert.match(logService, /organization_id: data.organizationId/);
  assert.match(readModel, /filterConversationLogsForTenant/);
  assert.match(readModel, /loadProspectPhoneOrgIndex/);
});
