/**
 * BR-201 — META_AD_DESTINATION alone is not operational lead provenance.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  evaluatePositiveAtlasLeadProvenance,
  evaluateAtlasInboundAutomationEligibility,
  POSITIVE_LEAD_PROVENANCE_SOURCE_SET,
  VERIFIED_ATLAS_ELIGIBILITY_SOURCES
} = require("../core/atlasInboundAutomationEligibility");
const {
  evaluateRecruitingInboxEligibility
} = require("../core/conversationsCenter/conversationsCenterInboxEligibility");
const {
  isOperationalProspectRecord,
  filterOperationalProspects
} = require("../core/prospectPromotionEligibility");
const {
  evaluateAutomationOutboundEligibility,
  OUTBOUND_REASONS
} = require("../core/automationOutboundEligibility");
const { buildConversationsCenterReadModel } = require("../core/conversationsCenter/conversationsCenterReadModel");
const { HIERARCHY_MODES } = require("../core/hierarchyScopeEngine");
const { ROLES } = require("../security/roles");
const { permissionsForRole } = require("../security/permissions");
const { WHATSAPP_ENTRY_METHOD, WHATSAPP_SOURCE } = require("../core/whatsappConstants");

const ORG = "00000000-0000-4000-8000-000000000001";
const MISLEISYS = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CANARY_ID = "cd323de4-a666-4ac0-b2fc-4a6a6a0f2f5f";

function auth() {
  return {
    userId: MISLEISYS,
    role: ROLES.AGENT,
    organizationId: ORG,
    status: "active",
    permissions: permissionsForRole(ROLES.AGENT),
    hierarchyMode: HIERARCHY_MODES.SELF
  };
}

function row(overrides = {}) {
  return {
    id: overrides.id || "p1",
    organization_id: ORG,
    owner_user_id: overrides.owner_user_id || MISLEISYS,
    phone: overrides.phone || "+17865557083",
    name: overrides.name || "Contact",
    source: overrides.source ?? null,
    entry_method: overrides.entry_method ?? null,
    current_step: overrides.current_step || "NEW",
    updated_at: "2026-09-01T12:00:00.000Z",
    created_at: "2026-09-01T12:00:00.000Z",
    workflow_state: overrides.workflow_state || {},
    ...overrides
  };
}

function canary(overrides = {}) {
  return row({
    id: CANARY_ID,
    phone: "+17865557083",
    name: "Canary 7083",
    source: null,
    entry_method: null,
    workflow_state: { atlasEligibilitySource: "META_AD_DESTINATION" },
    ...overrides
  });
}

async function inbox(prospects) {
  return buildConversationsCenterReadModel({
    organizationId: ORG,
    authContext: auth(),
    workspaceScope: "mine",
    filter: "active",
    prospects,
    conversationLogsByPhone: new Map(),
    persistWindowArchive: false,
    view: "full"
  });
}

test("docs: BR-201 documented", () => {
  const rules = fs.readFileSync(
    path.join(__dirname, "../../docs/06-business/BUSINESS_RULES.md"),
    "utf8"
  );
  assert.match(rules, /## BR-201 — Tighten Operational Provenance for META_AD_DESTINATION/);
  assert.match(rules, /META_AD_DESTINATION alone is not proof/);
  assert.equal(
    POSITIVE_LEAD_PROVENANCE_SOURCE_SET.has(VERIFIED_ATLAS_ELIGIBILITY_SOURCES.META_AD_DESTINATION),
    false
  );
});

test("canary META_AD_DESTINATION-only is not operational", async () => {
  const prospect = canary();
  const provenance = evaluatePositiveAtlasLeadProvenance(prospect, prospect.workflow_state);
  assert.deepEqual(provenance, { eligible: false, reason: "LEGACY_AMBIGUOUS" });
  assert.equal(isOperationalProspectRecord(prospect), false);
  assert.equal(
    evaluateRecruitingInboxEligibility(prospect, prospect.workflow_state).eligible,
    false
  );
  const model = await inbox([prospect]);
  assert.equal(model.items.length, 0);
  assert.equal(filterOperationalProspects([prospect]).length, 0);
});

test("META_AD_DESTINATION + ctwa_clid remains eligible", () => {
  const prospect = canary({
    ctwa_clid: "clid-real-1",
    workflow_state: { atlasEligibilitySource: "META_AD_DESTINATION" }
  });
  const provenance = evaluatePositiveAtlasLeadProvenance(prospect, prospect.workflow_state);
  assert.equal(provenance.eligible, true);
  assert.equal(provenance.reason, "CTWA_PROVENANCE");
  assert.equal(isOperationalProspectRecord(prospect), true);
});

test("META_AD_DESTINATION + referral.source_type=ad remains eligible", () => {
  const prospect = canary({
    workflow_state: {
      atlasEligibilitySource: "META_AD_DESTINATION",
      referral: { source_type: "ad", ctwa_clid: "clid-ad" }
    }
  });
  const provenance = evaluatePositiveAtlasLeadProvenance(prospect, prospect.workflow_state);
  assert.equal(provenance.eligible, true);
  assert.equal(isOperationalProspectRecord(prospect), true);
});

test("META_AD_DESTINATION + QR remains eligible", () => {
  const prospect = canary({
    source: "car_magnet",
    entry_method: "QR",
    workflow_state: { atlasEligibilitySource: "META_AD_DESTINATION" }
  });
  const provenance = evaluatePositiveAtlasLeadProvenance(prospect, prospect.workflow_state);
  assert.equal(provenance.eligible, true);
  assert.equal(provenance.reason, "QR_ATTRIBUTION");
  assert.equal(isOperationalProspectRecord(prospect), true);
});

test("META_AD_DESTINATION + campaign intake remains eligible", () => {
  const prospect = canary({
    source: WHATSAPP_SOURCE.CAMPAIGN_INTAKE,
    entry_method: WHATSAPP_ENTRY_METHOD.CAMPAIGN_INTAKE_CODE,
    workflow_state: { atlasEligibilitySource: "META_AD_DESTINATION" }
  });
  const provenance = evaluatePositiveAtlasLeadProvenance(prospect, prospect.workflow_state);
  assert.equal(provenance.eligible, true);
  assert.equal(isOperationalProspectRecord(prospect), true);
});

test("explicit trusted create remains eligible", () => {
  const prospect = row({
    entry_method: "MANUAL_CREATE",
    workflow_state: { atlasEligibilitySource: "META_AD_DESTINATION" }
  });
  assert.equal(evaluatePositiveAtlasLeadProvenance(prospect, prospect.workflow_state).eligible, true);
  assert.equal(isOperationalProspectRecord(prospect), true);
});

test("CTWA_REFERRAL historical rows remain eligible", () => {
  const prospect = row({
    workflow_state: { atlasEligibilitySource: "CTWA_REFERRAL" }
  });
  const provenance = evaluatePositiveAtlasLeadProvenance(prospect, prospect.workflow_state);
  assert.equal(provenance.eligible, true);
  assert.equal(provenance.reason, "VERIFIED_ELIGIBILITY_SOURCE");
  assert.equal(isOperationalProspectRecord(prospect), true);
});

test("explicit atlasAutomationEnabled remains eligible", () => {
  const prospect = canary({
    workflow_state: {
      atlasEligibilitySource: "META_AD_DESTINATION",
      atlasAutomationEnabled: true
    }
  });
  assert.equal(evaluatePositiveAtlasLeadProvenance(prospect, prospect.workflow_state).eligible, true);
});

test("BR-200 META-only outbound stays fail-closed", () => {
  const outbound = evaluateAutomationOutboundEligibility({
    prospect: canary(),
    workflowState: { atlasEligibilitySource: "META_AD_DESTINATION" },
    inboundEvent: { messageType: "image" },
    actor: "ATLAS"
  });
  assert.equal(outbound.eligible, false);
  assert.equal(outbound.reason, OUTBOUND_REASONS.LEGACY_AMBIGUOUS);
  assert.equal(outbound.failClosed, true);
});

test("HUMAN / AGENT outbound stays allowed on META-only rows", () => {
  const human = evaluateAutomationOutboundEligibility({
    prospect: canary(),
    workflowState: { atlasEligibilitySource: "META_AD_DESTINATION" },
    inboundEvent: { messageType: "text", body: "Hola" },
    actor: "HUMAN"
  });
  assert.equal(human.eligible, true);
  assert.equal(human.reason, OUTBOUND_REASONS.MANUAL_HUMAN_OR_AGENT);

  const agent = evaluateAutomationOutboundEligibility({
    prospect: canary(),
    actor: "AGENT"
  });
  assert.equal(agent.eligible, true);
});

test("BR-142 inbound META continuation is unchanged", () => {
  const inbound = evaluateAtlasInboundAutomationEligibility({
    prospect: row({
      source: WHATSAPP_SOURCE.META_AD_DESTINATION,
      entry_method: WHATSAPP_ENTRY_METHOD.META_AD_DESTINATION,
      updated_at: new Date().toISOString()
    }),
    inbound: { text: "Sí" },
    workflowState: {
      atlasEligibilitySource: VERIFIED_ATLAS_ELIGIBILITY_SOURCES.META_AD_DESTINATION,
      canonicalMilestone: "NEW_LEAD"
    }
  });
  assert.equal(inbound.eligible, true);
});
