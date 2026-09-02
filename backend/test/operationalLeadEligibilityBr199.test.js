/**
 * BR-199 — eligibility-first operational prospect views.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  evaluatePositiveAtlasLeadProvenance,
  evaluateAtlasInboundAutomationEligibility
} = require("../core/atlasInboundAutomationEligibility");
const {
  evaluateRecruitingInboxEligibility
} = require("../core/conversationsCenter/conversationsCenterInboxEligibility");
const {
  isOperationalProspectRecord,
  filterOperationalProspects
} = require("../core/prospectPromotionEligibility");
const { buildConversationsCenterReadModel } = require("../core/conversationsCenter/conversationsCenterReadModel");
const { buildProspectCenterReadModel } = require("../core/prospectCenterReadModel");
const {
  resolveWorkspaceListScope,
  isProspectInWorkspaceListScope,
  WORKSPACE_LIST_SCOPES
} = require("../security/authorizationService");
const { HIERARCHY_MODES } = require("../core/hierarchyScopeEngine");
const { ROLES } = require("../security/roles");
const { permissionsForRole } = require("../security/permissions");
const { WHATSAPP_ENTRY_METHOD, WHATSAPP_SOURCE } = require("../core/whatsappConstants");

const ORG = "00000000-0000-4000-8000-000000000001";
const MISLEISYS = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NIOVEL = "33ad243a-9d00-4a4d-810b-df2762c0f076";

function auth(role, userId) {
  return {
    userId,
    role,
    organizationId: ORG,
    status: "active",
    permissions: permissionsForRole(role),
    hierarchyMode: role === ROLES.RVP ? HIERARCHY_MODES.SUBTREE : null,
    hierarchyUserIds: role === ROLES.RVP ? [NIOVEL, MISLEISYS] : undefined
  };
}

function row(overrides = {}) {
  return {
    id: overrides.id || "p1",
    organization_id: ORG,
    owner_user_id: overrides.owner_user_id || MISLEISYS,
    phone: overrides.phone || "+17865550101",
    name: overrides.name || "Contact",
    source: overrides.source ?? WHATSAPP_SOURCE.UNKNOWN,
    entry_method: overrides.entry_method ?? WHATSAPP_ENTRY_METHOD.UNATTRIBUTED,
    current_step: overrides.current_step || "NEW",
    updated_at: "2026-09-01T12:00:00.000Z",
    created_at: "2026-09-01T12:00:00.000Z",
    workflow_state: overrides.workflow_state || {},
    ...overrides
  };
}

async function inbox(prospects, { userId = MISLEISYS, workspaceScope = "mine", filter = "active" } = {}) {
  return buildConversationsCenterReadModel({
    organizationId: ORG,
    authContext: auth(userId === NIOVEL ? ROLES.RVP : ROLES.AGENT, userId),
    workspaceScope,
    filter,
    prospects,
    conversationLogsByPhone: new Map(),
    persistWindowArchive: false,
    view: "full"
  });
}

test("docs: BR-199 documented", () => {
  const rules = fs.readFileSync(
    path.join(__dirname, "../../docs/06-business/BUSINESS_RULES.md"),
    "utf8"
  );
  assert.match(rules, /## BR-199 — Eligibility-first operational prospect views/);
  assert.match(rules, /HUMAN or ATLAS ownership is not enough/);
});

test("A) personal HUMAN contact with no provenance is excluded", async () => {
  const misleisysPersonal = row({
    id: "misleisys-personal",
    name: "Misleisys personal",
    owner_user_id: MISLEISYS,
    source: WHATSAPP_SOURCE.PERSONAL_WHATSAPP,
    entry_method: WHATSAPP_ENTRY_METHOD.PERSONAL_WHATSAPP,
    workflow_state: {
      atlasEligibilitySource: "PERSONAL_WHATSAPP",
      workflowOwnership: "AGENT",
      manualAgentOwnership: true,
      humanTakenOverAt: "2026-09-01T10:00:00.000Z"
    }
  });
  assert.equal(evaluatePositiveAtlasLeadProvenance(misleisysPersonal, misleisysPersonal.workflow_state).eligible, false);
  assert.equal(isOperationalProspectRecord(misleisysPersonal), false);
  assert.equal(
    evaluateRecruitingInboxEligibility(misleisysPersonal, misleisysPersonal.workflow_state).eligible,
    false
  );
  const model = await inbox([misleisysPersonal], { filter: "human" });
  assert.equal(model.items.length, 0);
  assert.equal(model.counts.human, 0);
});

test("B) personal ATLAS-state contact with no provenance is excluded", async () => {
  const eduardo = row({
    id: "eduardojose9",
    name: "Eduardojose9",
    owner_user_id: NIOVEL,
    source: WHATSAPP_SOURCE.FACEBOOK,
    entry_method: WHATSAPP_ENTRY_METHOD.CLICK_TO_WHATSAPP,
    workflow_state: { workflowOwnership: "ATLAS" }
  });
  assert.equal(isOperationalProspectRecord(eduardo), false);
  const model = await inbox([eduardo], { userId: NIOVEL, filter: "atlas" });
  assert.equal(model.items.length, 0);
  assert.equal(filterOperationalProspects([eduardo]).length, 0);
});

test("C) valid CTWA personal-line lead is included for the owner", async () => {
  const adLead = row({
    id: "misleisys-ctwa",
    name: "Valid ad lead",
    owner_user_id: MISLEISYS,
    source: WHATSAPP_SOURCE.PERSONAL_WHATSAPP,
    entry_method: WHATSAPP_ENTRY_METHOD.PERSONAL_WHATSAPP,
    workflow_state: { atlasEligibilitySource: "CTWA_REFERRAL" }
  });
  assert.equal(isOperationalProspectRecord(adLead), true);
  const model = await inbox([adLead], { userId: MISLEISYS });
  assert.deepEqual(model.items.map((item) => item.id), ["misleisys-ctwa"]);
});

test("D) valid QR/campaign lead is included", async () => {
  const qr = row({
    id: "qr-lead",
    source: "car_magnet",
    entry_method: "QR",
    phone: "+17865550111"
  });
  const campaign = row({
    id: "campaign-lead",
    source: WHATSAPP_SOURCE.CAMPAIGN_INTAKE,
    entry_method: WHATSAPP_ENTRY_METHOD.CAMPAIGN_INTAKE_CODE,
    phone: "+17865550112",
    workflow_state: { atlasEligibilitySource: "CAMPAIGN_INTAKE_CODE" }
  });
  assert.equal(isOperationalProspectRecord(qr), true);
  assert.equal(isOperationalProspectRecord(campaign), true);
});

test("E) UNKNOWN legitimate lead remains included", async () => {
  const unknownPerson = row({
    id: "unknown-ad",
    name: null,
    source: WHATSAPP_SOURCE.UNKNOWN,
    entry_method: WHATSAPP_ENTRY_METHOD.UNATTRIBUTED,
    workflow_state: { atlasEligibilitySource: "CTWA_REFERRAL" }
  });
  assert.equal(evaluatePositiveAtlasLeadProvenance(unknownPerson, unknownPerson.workflow_state).eligible, true);
  assert.equal(isOperationalProspectRecord(unknownPerson), true);
  const model = await inbox([unknownPerson]);
  assert.equal(model.items.length, 1);
});

test("F) My Prospects remains owner-only", async () => {
  const owned = row({
    id: "mine",
    owner_user_id: MISLEISYS,
    workflow_state: { atlasEligibilitySource: "CTWA_REFERRAL" }
  });
  const other = row({
    id: "niovel-owned",
    owner_user_id: NIOVEL,
    phone: "+17865550999",
    workflow_state: { atlasEligibilitySource: "CTWA_REFERRAL" }
  });
  const model = await inbox([owned, other], { userId: MISLEISYS, workspaceScope: "mine" });
  assert.deepEqual(model.items.map((item) => item.id), ["mine"]);
});

test("G) Conversations oversight is owner-only; Prospect Center team scope remains", async () => {
  const ownedByAgent = row({
    id: "team-lead",
    owner_user_id: MISLEISYS,
    workflow_state: { atlasEligibilitySource: "QR" },
    source: "car_magnet",
    entry_method: "QR"
  });
  const model = await inbox([ownedByAgent], { userId: NIOVEL, workspaceScope: "oversight" });
  assert.equal(model.workspaceScope, WORKSPACE_LIST_SCOPES.MINE);
  assert.deepEqual(model.items.map((item) => item.id), []);
  const mine = await inbox([ownedByAgent], { userId: NIOVEL, workspaceScope: "mine" });
  assert.equal(mine.items.length, 0);

  const prospectCenterScope = resolveWorkspaceListScope(auth(ROLES.RVP, NIOVEL), "oversight");
  assert.equal(prospectCenterScope.workspaceScope, WORKSPACE_LIST_SCOPES.OVERSIGHT);
  assert.equal(isProspectInWorkspaceListScope(ownedByAgent, prospectCenterScope), true);
});

test("H) counts exclude personal non-leads", async () => {
  const personal = row({
    id: "personal",
    source: WHATSAPP_SOURCE.PERSONAL_WHATSAPP,
    entry_method: WHATSAPP_ENTRY_METHOD.PERSONAL_WHATSAPP,
    workflow_state: { atlasEligibilitySource: "PERSONAL_WHATSAPP", workflowOwnership: "AGENT" }
  });
  const lead = row({
    id: "lead",
    phone: "+17865550888",
    workflow_state: { atlasEligibilitySource: "CTWA_REFERRAL" }
  });
  const model = await inbox([personal, lead], { userId: MISLEISYS });
  assert.equal(model.counts.active, 1);
  assert.equal(model.items.length, 1);
  const center = await buildProspectCenterReadModel({
    organizationId: ORG,
    prospects: filterOperationalProspects([personal, lead])
  });
  assert.equal(center.totalCount, 1);
});

test("J) BR-142 eligibility remains fail-closed", () => {
  const greeting = evaluateAtlasInboundAutomationEligibility({
    prospect: row({ source: WHATSAPP_SOURCE.FACEBOOK, entry_method: WHATSAPP_ENTRY_METHOD.CLICK_TO_WHATSAPP }),
    inbound: { body: "Hola" },
    workflowState: {}
  });
  assert.equal(greeting.eligible, false);
  const ctwa = evaluateAtlasInboundAutomationEligibility({
    prospect: row(),
    inbound: { ctwaReferral: { source_type: "ad", ctwa_clid: "clid-1" } },
    workflowState: {}
  });
  assert.equal(ctwa.eligible, true);
});

test("workspace mine scope still uses owner_user_id", () => {
  const mine = resolveWorkspaceListScope(auth(ROLES.AGENT, MISLEISYS), "mine");
  assert.equal(isProspectInWorkspaceListScope(row({ owner_user_id: MISLEISYS }), mine), true);
  assert.equal(isProspectInWorkspaceListScope(row({ owner_user_id: NIOVEL }), mine), false);
});
