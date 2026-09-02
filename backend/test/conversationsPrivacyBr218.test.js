/**
 * BR-218 — Conversations privacy boundary.
 * Owner/servicing-user only. No hierarchy Team Conversations.
 * Support Mode is explicit, target-user scoped, and audited.
 */

require("dotenv").config();
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";
process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("path");

const { TEAM_VISION_ORGANIZATION_ID } = require("../core/teamVisionSeedTenant");
const { buildConversationsCenterReadModel } = require("../core/conversationsCenter/conversationsCenterReadModel");
const { isProspectInConversationsUserScope } = require("../core/conversationsCenter/conversationsCenterAccess");
const {
  CONVERSATIONS_SUPPORT_PERMISSION,
  CONVERSATIONS_LIST_SCOPES,
  canUseConversationsSupportAccess,
  resolveConversationsListScope,
  isProspectInConversationsPrivacyScope,
  shouldAuditConversationsSupportAccess,
  denyConversationsSupportMutation,
  isConversationsSupportReadOnly,
  withConversationsSupportCapability
} = require("../core/conversationsPrivacyEngine");
const {
  resolveWorkspaceListScope,
  isProspectInWorkspaceListScope,
  canAccessProspect,
  WORKSPACE_LIST_SCOPES
} = require("../security/authorizationService");
const { ROLES } = require("../security/roles");
const { SAAS_ROLES } = require("../security/saasRoles");
const { PERMISSIONS, ROLE_PERMISSIONS, permissionsForRole } = require("../security/permissions");
const { HIERARCHY_MODES } = require("../core/hierarchyScopeEngine");
const { WHATSAPP_ENTRY_METHOD, WHATSAPP_SOURCE } = require("../core/whatsappConstants");
const { recruitingProspectFixture } = require("./helpers/conversationsCenterRecruitingFixture");
const { toReportRow } = require("../core/prospectReportReadModel");
const { VERIFIED_ATLAS_ELIGIBILITY_SOURCES } = require("../core/atlasInboundAutomationEligibility");

const ORG = TEAM_VISION_ORGANIZATION_ID;
const OTHER_ORG = "af8fb707-f26c-4152-ad77-2d079d30bc8a";
const AGENT = "d8d75c0e-d93e-42c9-950e-004fbfabdc8d";
const RVP = "33ad243a-9d00-4a4d-810b-df2762c0f076";
const SRL = "00000000-0000-4000-8000-000000000021";
const ADMIN = "00000000-0000-4000-8000-000000000022";
const SUPER = "00000000-0000-4000-8000-000000000002";
const OTHER_ORG_USER = "00000000-0000-4000-8000-000000000099";

function auth(role, userId, extra = {}) {
  return {
    userId,
    role,
    saasRole: extra.saasRole || null,
    organizationId: extra.organizationId || ORG,
    status: "active",
    permissions: extra.permissions || permissionsForRole(role),
    hierarchyMode: extra.hierarchyMode || HIERARCHY_MODES.SUBTREE,
    hierarchyUserIds: extra.hierarchyUserIds || [userId, AGENT],
    explicitConversationsSupport: extra.explicitConversationsSupport === true,
    supportMode: extra.supportMode || null
  };
}

function agentAuth() {
  return auth(ROLES.AGENT, AGENT, { hierarchyUserIds: [AGENT] });
}

function rvpAuth() {
  return auth(ROLES.RVP, RVP, { saasRole: SAAS_ROLES.RVP });
}

function srlAuth() {
  return auth(ROLES.DIVISION_LEADER, SRL, { saasRole: SAAS_ROLES.REGIONAL_LEADER });
}

function orgAdminAuth(extra = {}) {
  return auth(ROLES.ADMINISTRATOR, ADMIN, {
    saasRole: SAAS_ROLES.ADMIN,
    hierarchyMode: HIERARCHY_MODES.ORGANIZATION,
    ...extra
  });
}

function superAdminAuth(extra = {}) {
  return auth(ROLES.ADMINISTRATOR, SUPER, {
    saasRole: SAAS_ROLES.SUPER_ADMIN,
    hierarchyMode: HIERARCHY_MODES.ORGANIZATION,
    ...extra
  });
}

function owned({ id, ownerUserId, extra = {} }) {
  return recruitingProspectFixture({
    id,
    organization_id: extra.organizationId || ORG,
    owner_user_id: ownerUserId,
    phone: extra.phone || `+1786555${String(id).replace(/\D/g, "").slice(-4).padStart(4, "0")}`,
    name: extra.name || id,
    source: extra.source || "car_magnet",
    entry_method: extra.entryMethod || "QR",
    workflow_state: {
      atlasEligibilitySource: extra.eligibilitySource || "QR",
      ...(extra.workflow_state || {})
    },
    ...extra
  });
}

async function inbox(authContext, prospects, options = {}) {
  return buildConversationsCenterReadModel({
    organizationId: options.organizationId || authContext.organizationId,
    authContext,
    workspaceScope: options.workspaceScope || "oversight",
    supportUserId: options.supportUserId,
    conversationsSupport: options.conversationsSupport,
    supportModeActive: options.supportModeActive,
    prospects,
    conversationLogsByPhone: options.conversationLogsByPhone || new Map(),
    persistWindowArchive: false,
    view: "full"
  });
}

const agentCtwa = owned({
  id: "agent-ctwa",
  ownerUserId: AGENT,
  extra: {
    phone: "+17865552101",
    name: "CTWA lead",
    source: WHATSAPP_SOURCE.FACEBOOK,
    entryMethod: WHATSAPP_ENTRY_METHOD.CLICK_TO_WHATSAPP,
    eligibilitySource: "CTWA_REFERRAL"
  }
});

const agentPersonal = owned({
  id: "agent-personal",
  ownerUserId: AGENT,
  extra: {
    phone: "+17865552102",
    name: "Personal WA",
    source: WHATSAPP_SOURCE.PERSONAL_WHATSAPP,
    entryMethod: WHATSAPP_ENTRY_METHOD.PERSONAL_WHATSAPP,
    eligibilitySource: "PERSONAL_WHATSAPP"
  }
});

const agentMixedUse = owned({
  id: "agent-mixed",
  ownerUserId: AGENT,
  extra: {
    phone: "+17865552103",
    name: "Mixed-use WA",
    source: WHATSAPP_SOURCE.PERSONAL_WHATSAPP,
    entryMethod: WHATSAPP_ENTRY_METHOD.PERSONAL_WHATSAPP,
    eligibilitySource: "CTWA_REFERRAL"
  }
});

const agentReview = owned({
  id: "agent-review",
  ownerUserId: AGENT,
  extra: {
    phone: "+17865552104",
    name: "Suspected Meta",
    source: null,
    entryMethod: null,
    eligibilitySource: VERIFIED_ATLAS_ELIGIBILITY_SOURCES.META_AD_DESTINATION,
    workflow_state: {
      atlasEligibilitySource: VERIFIED_ATLAS_ELIGIBILITY_SOURCES.META_AD_DESTINATION,
      eligibilityReason: "AD_DESTINATION_FALLBACK_NO_CTWA_METADATA"
    }
  }
});

const rvpOwn = owned({
  id: "rvp-own",
  ownerUserId: RVP,
  extra: { phone: "+17865552105", name: "RVP own" }
});

const otherOrgLead = owned({
  id: "other-org",
  ownerUserId: OTHER_ORG_USER,
  extra: {
    organizationId: OTHER_ORG,
    phone: "+17865552106",
    name: "Foreign"
  }
});

const catalog = [agentCtwa, agentPersonal, agentMixedUse, agentReview, rvpOwn, otherOrgLead];

test("docs: BR-218 documented and BR-165 points Conversations to it", () => {
  const rules = fs.readFileSync(
    path.join(__dirname, "../../docs/06-business/BUSINESS_RULES.md"),
    "utf8"
  );
  assert.match(rules, /## BR-218 — Conversations privacy boundary/);
  assert.match(rules, /owner\/servicing-user only/);
  assert.match(rules, /conversations:support/);
  assert.match(rules, /Conversations Team Prospects removed \(BR-218\)/);
});

test("conversations:support is never granted by role matrix", () => {
  assert.equal(PERMISSIONS.CONVERSATIONS_SUPPORT, "conversations:support");
  for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
    assert.equal(
      perms.includes(PERMISSIONS.CONVERSATIONS_SUPPORT),
      false,
      `${role} must not receive conversations:support`
    );
  }
});

test("A) agent sees own conversations", async () => {
  const model = await inbox(agentAuth(), catalog, { workspaceScope: "mine" });
  const ids = model.items.map((item) => item.id).sort();
  assert.ok(ids.includes("agent-ctwa"));
  assert.ok(ids.includes("agent-mixed"));
  assert.equal(ids.includes("rvp-own"), false);
  assert.equal(model.workspaceScope, CONVERSATIONS_LIST_SCOPES.MINE);
  assert.equal(model.supportAccess, false);
});

test("B) RVP cannot list subordinate agent conversations", async () => {
  const model = await inbox(rvpAuth(), catalog, { workspaceScope: "oversight" });
  assert.equal(model.workspaceScope, CONVERSATIONS_LIST_SCOPES.MINE);
  assert.deepEqual(model.items.map((item) => item.id), ["rvp-own"]);
  assert.equal(
    isProspectInConversationsUserScope(agentCtwa, ORG, rvpAuth()),
    false
  );
  assert.equal(canAccessProspect(rvpAuth(), agentCtwa), true);
});

test("C) SRL/RL cannot list subordinate conversations", async () => {
  const model = await inbox(srlAuth(), catalog, { workspaceScope: "oversight" });
  assert.equal(model.items.length, 0);
  assert.equal(isProspectInConversationsPrivacyScope(agentCtwa, ORG, srlAuth()), false);
});

test("D) other org denied", async () => {
  const foreign = auth(ROLES.RVP, OTHER_ORG_USER, { organizationId: OTHER_ORG });
  const model = await inbox(foreign, catalog, {
    workspaceScope: "oversight",
    organizationId: OTHER_ORG
  });
  assert.equal(model.items.some((item) => item.organizationId === ORG || item.id === "agent-ctwa"), false);
  assert.equal(isProspectInConversationsUserScope(agentCtwa, ORG, foreign), false);
});

test("E) PERSONAL_WHATSAPP never leaks upward", async () => {
  const model = await inbox(rvpAuth(), catalog, { workspaceScope: "oversight" });
  assert.equal(model.items.some((item) => item.id === "agent-personal"), false);
  assert.equal(isProspectInConversationsUserScope(agentPersonal, ORG, rvpAuth()), false);
});

test("F) suspected Meta review remains owner-only", async () => {
  const owner = await inbox(agentAuth(), [agentReview], { workspaceScope: "mine" });
  assert.equal(owner.items.some((item) => item.id === "agent-review"), true);
  const rvp = await inbox(rvpAuth(), [agentReview], { workspaceScope: "oversight" });
  assert.equal(rvp.items.length, 0);
});

test("G) CTWA operational conversation remains owner-only in Conversations", async () => {
  const owner = await inbox(agentAuth(), [agentCtwa], { workspaceScope: "mine" });
  assert.deepEqual(owner.items.map((item) => item.id), ["agent-ctwa"]);
  const rvp = await inbox(rvpAuth(), [agentCtwa], { workspaceScope: "oversight" });
  assert.equal(rvp.items.length, 0);
});

test("H) support mode works only when explicitly invoked", async () => {
  const saNormal = superAdminAuth();
  assert.equal(canUseConversationsSupportAccess(saNormal), true);
  const mine = resolveConversationsListScope(saNormal, {
    supportUserId: AGENT,
    supportModeActive: false
  });
  assert.equal(mine.workspaceScope, CONVERSATIONS_LIST_SCOPES.MINE);
  assert.equal(mine.ownerUserId, SUPER);
  assert.equal(mine.supportAccess, false);

  const saSupport = resolveConversationsListScope(saNormal, {
    supportUserId: AGENT,
    supportModeActive: true
  });
  assert.equal(saSupport.workspaceScope, CONVERSATIONS_LIST_SCOPES.SUPPORT);
  assert.equal(saSupport.ownerUserId, AGENT);
  assert.equal(saSupport.supportAccess, true);

  const listed = await inbox(saNormal, catalog, {
    supportUserId: AGENT,
    supportModeActive: true
  });
  assert.equal(listed.supportAccess, true);
  assert.equal(listed.supportTargetUserId, AGENT);
  assert.ok(listed.items.some((item) => item.id === "agent-ctwa"));
  assert.equal(listed.items.some((item) => item.id === "rvp-own"), false);
});

test("I) team metrics still work without conversation content", () => {
  const teamScope = resolveWorkspaceListScope(rvpAuth(), "oversight");
  assert.equal(teamScope.workspaceScope, WORKSPACE_LIST_SCOPES.OVERSIGHT);
  assert.equal(isProspectInWorkspaceListScope(agentCtwa, teamScope), true);

  const reportItem = toReportRow({
    phone: agentCtwa.phone,
    name: agentCtwa.name,
    ownerUserId: AGENT,
    canonicalMilestone: "QUALIFICATION",
    lastActivityAt: agentCtwa.updated_at
  });
  assert.equal(reportItem.phone, agentCtwa.phone);
  assert.equal(reportItem.owner, AGENT);
  assert.equal(Object.prototype.hasOwnProperty.call(reportItem, "body"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(reportItem, "messages"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(reportItem, "transcript"), false);
});

test("J) Prospect Center team reporting unchanged", () => {
  const center = fs.readFileSync(
    path.join(__dirname, "../routes/prospectCenter.js"),
    "utf8"
  );
  assert.match(center, /resolveWorkspaceListScope/);
  assert.match(center, /req\.query\.workspaceScope/);
  const teamScope = resolveWorkspaceListScope(rvpAuth(), "oversight");
  assert.equal(isProspectInWorkspaceListScope(agentMixedUse, teamScope), true);
  assert.equal(isProspectInWorkspaceListScope(rvpOwn, teamScope), false);
});

test("3) org admin without support permission cannot see subordinate conversations", async () => {
  const admin = orgAdminAuth();
  assert.equal(canUseConversationsSupportAccess(admin), false);
  const model = await inbox(admin, catalog, {
    workspaceScope: "oversight",
    supportUserId: AGENT,
    conversationsSupport: true
  });
  assert.equal(model.supportAccess, false);
  assert.equal(model.items.some((item) => item.id === "agent-ctwa"), false);
});

test("4) Super Admin in normal mode cannot see others in My Conversations", async () => {
  const model = await inbox(superAdminAuth(), catalog, { workspaceScope: "mine" });
  assert.equal(model.workspaceScope, CONVERSATIONS_LIST_SCOPES.MINE);
  assert.equal(model.supportAccess, false);
  assert.equal(model.items.some((item) => item.id === "agent-ctwa"), false);
});

test("5) Super Admin in explicit Support Mode can access target user", async () => {
  const model = await inbox(superAdminAuth(), catalog, {
    supportUserId: AGENT,
    supportModeActive: true
  });
  assert.equal(model.supportAccess, true);
  assert.ok(model.items.some((item) => item.id === "agent-ctwa"));
  assert.equal(model.items.some((item) => item.id === "rvp-own"), false);
});

test("6) authorized Admin needs Support Mode session, not a query flag", async () => {
  const admin = orgAdminAuth({ explicitConversationsSupport: true });
  assert.equal(canUseConversationsSupportAccess(admin), true);
  const flagOnly = await inbox(admin, catalog, {
    supportUserId: AGENT,
    conversationsSupport: true
  });
  assert.equal(flagOnly.supportAccess, false);
  assert.equal(flagOnly.items.some((item) => item.id === "agent-ctwa"), false);

  const allowed = await inbox(admin, catalog, {
    supportUserId: AGENT,
    supportModeActive: true
  });
  assert.equal(allowed.supportAccess, true);
  assert.ok(allowed.items.some((item) => item.id === "agent-ctwa"));
});

test("7) support access is audited", () => {
  const scope = resolveConversationsListScope(superAdminAuth(), {
    supportUserId: AGENT,
    supportModeActive: true
  });
  assert.equal(shouldAuditConversationsSupportAccess(scope), true);
  const mine = resolveConversationsListScope(superAdminAuth(), {});
  assert.equal(shouldAuditConversationsSupportAccess(mine), false);

  const routes = fs.readFileSync(
    path.join(__dirname, "../routes/conversationsCenter.js"),
    "utf8"
  );
  assert.match(routes, /conversations\.support_access/);
  assert.match(routes, /conversations\.support_read/);
});

test("8-9) personal and mixed-use WhatsApp never leak through hierarchy", async () => {
  const rvp = await inbox(rvpAuth(), catalog, { workspaceScope: "oversight" });
  assert.equal(rvp.items.some((item) => item.id === "agent-personal"), false);
  assert.equal(rvp.items.some((item) => item.id === "agent-mixed"), false);
  const srl = await inbox(srlAuth(), catalog, { workspaceScope: "oversight" });
  assert.equal(srl.items.some((item) => item.id === "agent-personal"), false);
  assert.equal(srl.items.some((item) => item.id === "agent-mixed"), false);
});

test("explicit conversations:support grant is loaded without role wildcards", async () => {
  const admin = orgAdminAuth({ explicitConversationsSupport: false });
  const granted = await withConversationsSupportCapability(admin, {
    loadUserOrganizationId: async () => ORG,
    loadUserPermissions: async () => [
      { permission_code: CONVERSATIONS_SUPPORT_PERMISSION, granted: true }
    ]
  });
  assert.equal(granted.explicitConversationsSupport, true);
  const denied = await withConversationsSupportCapability(rvpAuth(), {
    loadUserOrganizationId: async () => ORG,
    loadUserPermissions: async () => [
      { permission_code: CONVERSATIONS_SUPPORT_PERMISSION, granted: true }
    ]
  });
  assert.equal(denied.explicitConversationsSupport, false);
});

test("A) RVP cannot read subordinate conversation", () => {
  assert.equal(isProspectInConversationsUserScope(agentCtwa, ORG, rvpAuth()), false);
  assert.equal(
    isProspectInConversationsUserScope(agentCtwa, ORG, rvpAuth(), {
      supportUserId: AGENT,
      supportModeActive: false
    }),
    false
  );
});

test("B) Admin with conversations:support but NOT Support Mode cannot read it", async () => {
  const admin = orgAdminAuth({ explicitConversationsSupport: true });
  const model = await inbox(admin, [agentCtwa], {
    supportUserId: AGENT,
    conversationsSupport: true
  });
  assert.equal(model.supportAccess, false);
  assert.equal(model.items.length, 0);
  assert.equal(
    isProspectInConversationsUserScope(agentCtwa, ORG, admin, {
      supportUserId: AGENT,
      conversationsSupport: true
    }),
    false
  );
});

test("C) Admin with permission + active Support Mode + target can read", async () => {
  const admin = orgAdminAuth({ explicitConversationsSupport: true });
  const model = await inbox(admin, [agentCtwa], {
    supportUserId: AGENT,
    supportModeActive: true
  });
  assert.equal(model.supportAccess, true);
  assert.deepEqual(model.items.map((item) => item.id), ["agent-ctwa"]);
});

test("D) Super Admin normal mode cannot read", async () => {
  const model = await inbox(superAdminAuth(), [agentCtwa], {
    supportUserId: AGENT,
    conversationsSupport: true
  });
  assert.equal(model.supportAccess, false);
  assert.equal(model.items.length, 0);
});

test("E) Super Admin active Support Mode can read", async () => {
  const model = await inbox(superAdminAuth(), [agentCtwa], {
    supportUserId: AGENT,
    supportModeActive: true
  });
  assert.equal(model.supportAccess, true);
  assert.deepEqual(model.items.map((item) => item.id), ["agent-ctwa"]);
});

test("F–K) Support view mutations fail closed for another user", () => {
  const admin = orgAdminAuth({ explicitConversationsSupport: true });
  const supportScope = resolveConversationsListScope(admin, {
    supportUserId: AGENT,
    supportModeActive: true
  });
  assert.equal(isConversationsSupportReadOnly(supportScope, admin), true);
  const denied = denyConversationsSupportMutation(supportScope, admin);
  assert.equal(denied?.code, "CONVERSATIONS_SUPPORT_READ_ONLY");
  assert.equal(denied.statusCode, 403);

  const flagOnly = resolveConversationsListScope(admin, {
    supportUserId: AGENT,
    conversationsSupport: true
  });
  assert.equal(flagOnly.supportAccess, false);
  assert.equal(denyConversationsSupportMutation(flagOnly, admin), null);

  const routes = fs.readFileSync(
    path.join(__dirname, "../routes/conversationsCenter.js"),
    "utf8"
  );
  assert.match(routes, /requireConversationsWrite/);
  assert.match(routes, /denyConversationsSupportMutation/);
  assert.match(routes, /humanReplyHandler/);
  assert.match(routes, /takeOverHandler/);
  assert.match(routes, /returnToAtlasHandler/);
  assert.match(routes, /metaLeadReviewAction/);
  assert.match(routes, /scopedLifecycleAction/);
  assert.match(routes, /mark-read/);
});

test("L) normal owner retains all existing actions", () => {
  const owner = agentAuth();
  const mine = resolveConversationsListScope(owner, {});
  assert.equal(mine.workspaceScope, CONVERSATIONS_LIST_SCOPES.MINE);
  assert.equal(isConversationsSupportReadOnly(mine, owner), false);
  assert.equal(denyConversationsSupportMutation(mine, owner), null);
  assert.equal(isProspectInConversationsUserScope(agentCtwa, ORG, owner), true);
});

test("M) Prospect Center / Mission Control unchanged", () => {
  const center = fs.readFileSync(
    path.join(__dirname, "../routes/prospectCenter.js"),
    "utf8"
  );
  const mission = fs.readFileSync(
    path.join(__dirname, "../core/prospectReportReadModel.js"),
    "utf8"
  );
  assert.match(center, /resolveWorkspaceListScope/);
  assert.doesNotMatch(center, /resolveConversationsListScope/);
  assert.doesNotMatch(mission, /resolveConversationsListScope/);
  const teamScope = resolveWorkspaceListScope(rvpAuth(), "oversight");
  assert.equal(isProspectInWorkspaceListScope(agentCtwa, teamScope), true);
});

test("UI and routes no longer expose Team Conversations", () => {
  const page = fs.readFileSync(
    path.join(__dirname, "../../frontend/src/pages/ConversationsPage.jsx"),
    "utf8"
  );
  const engine = fs.readFileSync(
    path.join(__dirname, "../../frontend/src/engines/conversationsWorkspaceScope.js"),
    "utf8"
  );
  assert.doesNotMatch(page, /conversationsTeamProspects/);
  assert.doesNotMatch(page, /Team Prospects/);
  assert.match(page, /conversations-support-mode/);
  assert.match(engine, /return false;/);
});
