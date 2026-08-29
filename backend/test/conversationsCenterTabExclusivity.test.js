/**
 * Conversations My Prospects / Team Prospects are mutually exclusive.
 * Oversight excludes the signed-in user. Personal WhatsApp privacy from BR-165 stays.
 */

require("dotenv").config();
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";
process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");

const { TEAM_VISION_ORGANIZATION_ID } = require("../core/teamVisionSeedTenant");
const { buildConversationsCenterReadModel } = require("../core/conversationsCenter/conversationsCenterReadModel");
const {
  resolveWorkspaceListScope,
  isProspectInWorkspaceListScope,
  WORKSPACE_LIST_SCOPES
} = require("../security/authorizationService");
const { HIERARCHY_MODES } = require("../core/hierarchyScopeEngine");
const { ROLES } = require("../security/roles");
const { permissionsForRole } = require("../security/permissions");
const { isOperationalProspectRecord } = require("../core/prospectPromotionEligibility");
const { evaluateRecruitingInboxEligibility } = require("../core/conversationsCenter/conversationsCenterInboxEligibility");
const { recruitingProspectFixture } = require("./helpers/conversationsCenterRecruitingFixture");

const ORG_A = TEAM_VISION_ORGANIZATION_ID;
const ORG_B = "af8fb707-f26c-4152-ad77-2d079d30bc8a";
const USER_LEADER = "11111111-1111-4111-8111-111111111111";
const USER_DOWNSTREAM = "22222222-2222-4222-8222-222222222222";
const USER_OTHER_ORG = "44444444-4444-4444-8444-444444444444";

function auth(role, userId, extra = {}) {
  return {
    userId,
    role,
    organizationId: extra.organizationId || ORG_A,
    status: "active",
    permissions: extra.permissions || permissionsForRole(role),
    hierarchyMode: extra.hierarchyMode || null,
    hierarchyUserIds: extra.hierarchyUserIds
  };
}

function atlasRow({ id, ownerUserId, organizationId = ORG_A, extra = {} }) {
  return recruitingProspectFixture({
    id,
    organization_id: organizationId,
    owner_user_id: ownerUserId,
    source: extra.source || "car_magnet",
    entry_method: extra.entryMethod || "QR",
    phone: extra.phone || `+1786555${String(id).replace(/\D/g, "").slice(-4).padStart(4, "0")}`,
    name: extra.name || id,
    workflow_state: {
      atlasEligibilitySource: extra.eligibilitySource || "QR",
      ...(extra.workflow_state || {})
    },
    ...extra
  });
}

async function loadInbox({ authContext, workspaceScope, prospects }) {
  return buildConversationsCenterReadModel({
    organizationId: authContext.organizationId,
    authContext,
    workspaceScope,
    prospects,
    conversationLogsByPhone: new Map(),
    persistWindowArchive: false,
    view: "full"
  });
}

const leaderOwn = atlasRow({
  id: "arays",
  ownerUserId: USER_LEADER,
  extra: { phone: "+17865553001", name: "Arays" }
});
const leaderOwnTwo = atlasRow({
  id: "elizabeth",
  ownerUserId: USER_LEADER,
  extra: { phone: "+17865553002", name: "Elizabeth" }
});
const downstream = atlasRow({
  id: "claudia",
  ownerUserId: USER_DOWNSTREAM,
  extra: { phone: "+17865553003", name: "Claudia" }
});
const ordinaryPersonal = atlasRow({
  id: "personal",
  ownerUserId: USER_DOWNSTREAM,
  extra: {
    phone: "+17865553004",
    name: "Ordinary personal",
    source: "UNKNOWN",
    entryMethod: "UNATTRIBUTED",
    eligibilitySource: "PERSONAL_WHATSAPP"
  }
});
const otherTenant = atlasRow({
  id: "other-org",
  ownerUserId: USER_OTHER_ORG,
  organizationId: ORG_B,
  extra: { phone: "+17865553005", name: "Foreign" }
});

const catalog = [leaderOwn, leaderOwnTwo, downstream, ordinaryPersonal, otherTenant];

test("mine-only tab is current user Atlas prospects", async () => {
  const context = auth(ROLES.RVP, USER_LEADER);
  const mine = resolveWorkspaceListScope(context, "mine");
  assert.equal(mine.workspaceScope, WORKSPACE_LIST_SCOPES.MINE);
  assert.equal(mine.ownerUserId, USER_LEADER);
  assert.equal(isProspectInWorkspaceListScope(leaderOwn, mine), true);
  assert.equal(isProspectInWorkspaceListScope(downstream, mine), false);

  const model = await loadInbox({
    authContext: context,
    workspaceScope: "mine",
    prospects: catalog
  });
  assert.deepEqual(model.items.map((item) => item.id).sort(), ["arays", "elizabeth"]);
});

test("team-only tab excludes the current user", async () => {
  const context = auth(ROLES.RVP, USER_LEADER);
  const team = resolveWorkspaceListScope(context, "oversight");
  assert.equal(team.workspaceScope, WORKSPACE_LIST_SCOPES.OVERSIGHT);
  assert.equal(team.excludeOwnerUserId, USER_LEADER);
  assert.equal(isProspectInWorkspaceListScope(leaderOwn, team), false);
  assert.equal(isProspectInWorkspaceListScope(downstream, team), true);

  const model = await loadInbox({
    authContext: context,
    workspaceScope: "oversight",
    prospects: catalog
  });
  assert.deepEqual(model.items.map((item) => item.id), ["claudia"]);
});

test("downstream prospect is visible in Team Prospects", async () => {
  const dl = auth(ROLES.DIVISION_LEADER, USER_LEADER, {
    hierarchyMode: HIERARCHY_MODES.SUBTREE,
    hierarchyUserIds: [USER_LEADER, USER_DOWNSTREAM]
  });
  const model = await loadInbox({
    authContext: dl,
    workspaceScope: "oversight",
    prospects: catalog
  });
  assert.equal(model.items.some((item) => item.id === "claudia"), true);
  assert.equal(model.items.some((item) => item.id === "arays"), false);
});

test("same prospect never appears in both tabs", async () => {
  const context = auth(ROLES.RVP, USER_LEADER);
  const mine = await loadInbox({
    authContext: context,
    workspaceScope: "mine",
    prospects: catalog
  });
  const team = await loadInbox({
    authContext: context,
    workspaceScope: "oversight",
    prospects: catalog
  });
  const mineIds = new Set(mine.items.map((item) => item.id));
  const overlap = team.items.filter((item) => mineIds.has(item.id));
  assert.deepEqual(overlap, []);
});

test("tenant isolation preserved on Team Prospects", async () => {
  const context = auth(ROLES.RVP, USER_LEADER, { organizationId: ORG_A });
  const team = resolveWorkspaceListScope(context, "oversight");
  assert.equal(isProspectInWorkspaceListScope(otherTenant, team), false);

  const model = await loadInbox({
    authContext: context,
    workspaceScope: "oversight",
    prospects: catalog
  });
  assert.equal(model.items.some((item) => item.id === "other-org"), false);
});

test("personal WhatsApp privacy unchanged", async () => {
  assert.equal(isOperationalProspectRecord(ordinaryPersonal), false);
  assert.equal(
    evaluateRecruitingInboxEligibility(ordinaryPersonal, ordinaryPersonal.workflow_state)
      .eligible,
    false
  );

  const context = auth(ROLES.RVP, USER_LEADER);
  const mine = await loadInbox({
    authContext: context,
    workspaceScope: "mine",
    prospects: catalog
  });
  const team = await loadInbox({
    authContext: context,
    workspaceScope: "oversight",
    prospects: catalog
  });
  assert.equal(mine.items.some((item) => item.id === "personal"), false);
  assert.equal(team.items.some((item) => item.id === "personal"), false);
});
