/**
 * BR-215 — owner-only review for BR-193 META_AD_DESTINATION fallback prospects.
 * Does not weaken BR-200. Does not treat META or 131060 as CTWA.
 */

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  evaluateSuspectedMetaLeadReview,
  isOwnerVisibleSuspectedMetaLead,
  confirmMetaLead,
  dismissMetaLeadAsPersonal,
  SUSPECTED_META_LEAD_REVIEW,
  HUMAN_VERIFIED_META_LEAD
} = require("../core/metaLeadReview");
const {
  evaluatePositiveAtlasLeadProvenance,
  persistVerifiedAtlasEligibilitySource,
  resolveMonotonicVerifiedEligibilitySource,
  hasRealStoredCtwaEvidence,
  POSITIVE_LEAD_PROVENANCE_SOURCE_SET,
  VERIFIED_ATLAS_ELIGIBILITY_SOURCES
} = require("../core/atlasInboundAutomationEligibility");
const {
  evaluateOperationalProspectRecord
} = require("../core/prospectPromotionEligibility");
const {
  evaluateRecruitingInboxEligibility
} = require("../core/conversationsCenter/conversationsCenterInboxEligibility");
const {
  evaluateAutomationOutboundEligibility,
  OUTBOUND_REASONS
} = require("../core/automationOutboundEligibility");
const { buildConversationsCenterReadModel } = require("../core/conversationsCenter/conversationsCenterReadModel");
const {
  evaluateConversationPerformanceEligibility
} = require("../core/conversationPerformanceEngine");
const {
  loadPersistedWorkflowState,
  clearMemoryWorkflowStateStore
} = require("../core/workflowStateStore");
const { HIERARCHY_MODES } = require("../core/hierarchyScopeEngine");
const { ROLES } = require("../security/roles");
const { permissionsForRole } = require("../security/permissions");
const { WHATSAPP_ENTRY_METHOD, WHATSAPP_SOURCE } = require("../core/whatsappConstants");

const ORG = "00000000-0000-4000-8000-000000000001";
const OWNER = "d8d75c0e-d93e-42c9-950e-004fbfabdc8d";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PHONE = "+17864039802";

function ownerAuth() {
  return {
    userId: OWNER,
    role: ROLES.DIVISION_LEADER,
    organizationId: ORG,
    status: "active",
    permissions: permissionsForRole(ROLES.DIVISION_LEADER),
    hierarchyMode: HIERARCHY_MODES.SELF
  };
}

function otherAuth() {
  return {
    ...ownerAuth(),
    userId: OTHER,
    role: ROLES.AGENT,
    permissions: permissionsForRole(ROLES.AGENT)
  };
}

function metaFallbackProspect(overrides = {}) {
  return {
    id: "5d0b1088-70e0-4422-89e0-b9d718fcb161",
    organization_id: ORG,
    owner_user_id: OWNER,
    phone: PHONE,
    name: "Maria Rodriguez",
    source: null,
    entry_method: null,
    current_step: "NEW",
    updated_at: "2026-09-02T17:15:26.000Z",
    created_at: "2026-09-02T17:15:26.000Z",
    workflow_state: {
      atlasEligibilitySource: VERIFIED_ATLAS_ELIGIBILITY_SOURCES.META_AD_DESTINATION,
      eligibilityReason: "AD_DESTINATION_FALLBACK_NO_CTWA_METADATA"
    },
    ...overrides
  };
}

function personalProspect() {
  return metaFallbackProspect({
    id: "personal-1",
    phone: "+13055550111",
    name: "Family",
    source: WHATSAPP_SOURCE.PERSONAL_WHATSAPP,
    entry_method: WHATSAPP_ENTRY_METHOD.PERSONAL_WHATSAPP,
    workflow_state: {
      atlasEligibilitySource: VERIFIED_ATLAS_ELIGIBILITY_SOURCES.PERSONAL_WHATSAPP
    }
  });
}

async function withMemoryState(run) {
  const previousBackend = process.env.ATLAS_WORKFLOW_STATE_BACKEND;
  const previousKey = process.env.ATLAS_WORKFLOW_STATE_MEMORY_KEY;
  process.env.ATLAS_WORKFLOW_STATE_BACKEND = "memory";
  process.env.ATLAS_WORKFLOW_STATE_MEMORY_KEY = `br215-${Date.now()}-${Math.random()}`;
  clearMemoryWorkflowStateStore();
  try {
    return await run();
  } finally {
    clearMemoryWorkflowStateStore();
    if (previousBackend == null) delete process.env.ATLAS_WORKFLOW_STATE_BACKEND;
    else process.env.ATLAS_WORKFLOW_STATE_BACKEND = previousBackend;
    if (previousKey == null) delete process.env.ATLAS_WORKFLOW_STATE_MEMORY_KEY;
    else process.env.ATLAS_WORKFLOW_STATE_MEMORY_KEY = previousKey;
  }
}

async function inbox(prospects, authContext) {
  return buildConversationsCenterReadModel({
    organizationId: ORG,
    authContext,
    workspaceScope: "mine",
    filter: "active",
    prospects,
    conversationLogsByPhone: new Map(),
    persistWindowArchive: false,
    view: "full"
  });
}

test("docs: BR-215 documented and META stays out of positive provenance", () => {
  const rules = fs.readFileSync(
    path.join(__dirname, "../../docs/06-business/BUSINESS_RULES.md"),
    "utf8"
  );
  assert.match(rules, /## BR-215 — Mixed-Use WhatsApp Suspected Meta Lead Review/);
  assert.match(rules, /HUMAN_VERIFIED_META_LEAD/);
  assert.match(rules, /Possible Meta Lead — Verify/);
  assert.equal(
    POSITIVE_LEAD_PROVENANCE_SOURCE_SET.has(
      VERIFIED_ATLAS_ELIGIBILITY_SOURCES.META_AD_DESTINATION
    ),
    false
  );
  assert.equal(
    POSITIVE_LEAD_PROVENANCE_SOURCE_SET.has(HUMAN_VERIFIED_META_LEAD),
    true
  );
  assert.equal(
    POSITIVE_LEAD_PROVENANCE_SOURCE_SET.has(SUSPECTED_META_LEAD_REVIEW),
    false
  );
});

test("A) BR-193 fallback prospect is review-visible to the connection owner", async () => {
  const prospect = metaFallbackProspect();
  const decision = evaluateSuspectedMetaLeadReview(prospect, prospect.workflow_state);
  assert.equal(decision.review, true);
  assert.equal(decision.reason, SUSPECTED_META_LEAD_REVIEW);
  assert.equal(isOwnerVisibleSuspectedMetaLead(prospect, OWNER), true);
  assert.equal(
    evaluateRecruitingInboxEligibility(prospect, prospect.workflow_state).eligible,
    false
  );
  const model = await inbox([prospect], ownerAuth());
  assert.equal(model.items.length, 1);
  assert.equal(model.items[0].suspectedMetaLead, true);
  assert.equal(model.items[0].metaLeadReview.reviewOnly, true);
  assert.equal(model.metaLeadsAwaitingVerification, 1);
});

test("B) suspected Meta lead is still BR-200 automation ineligible", () => {
  const prospect = metaFallbackProspect();
  const outbound = evaluateAutomationOutboundEligibility({
    prospect,
    workflowState: prospect.workflow_state,
    inboundEvent: { messageType: "text", body: "Hola" },
    actor: "ATLAS"
  });
  assert.equal(outbound.eligible, false);
  assert.equal(outbound.reason, OUTBOUND_REASONS.LEGACY_AMBIGUOUS);
  assert.equal(outbound.failClosed, true);
  assert.equal(evaluateOperationalProspectRecord(prospect).operational, false);
  assert.equal(
    evaluateConversationPerformanceEligibility(prospect).eligible,
    false
  );
});

test("C) manual HUMAN reply remains allowed before confirmation", () => {
  const human = evaluateAutomationOutboundEligibility({
    prospect: metaFallbackProspect(),
    workflowState: metaFallbackProspect().workflow_state,
    inboundEvent: { messageType: "text", body: "Hola" },
    actor: "HUMAN"
  });
  assert.equal(human.eligible, true);
  assert.equal(human.reason, OUTBOUND_REASONS.MANUAL_HUMAN_OR_AGENT);
});

test("D) other agents cannot see the suspected Meta lead", async () => {
  const prospect = metaFallbackProspect();
  assert.equal(isOwnerVisibleSuspectedMetaLead(prospect, OTHER), false);
  const teamAuth = {
    ...otherAuth(),
    hierarchyMode: HIERARCHY_MODES.TEAM
  };
  const model = await inbox([prospect], teamAuth);
  assert.equal(model.items.length, 0);
});

test("E/F/G) Confirm Meta Lead writes HUMAN_VERIFIED_META_LEAD without fabricating CTWA", async () => {
  await withMemoryState(async () => {
    const prospect = metaFallbackProspect();
    const result = await confirmMetaLead({
      prospect,
      organizationId: ORG,
      authContext: ownerAuth(),
      connectionId: "6675cca3-28bf-4aa4-9ac8-0d38801069e1",
      phoneNumberId: "336196332914297"
    });
    assert.equal(result.ok, true);
    assert.equal(result.source, HUMAN_VERIFIED_META_LEAD);

    const state = await loadPersistedWorkflowState(PHONE, { organizationId: ORG });
    assert.equal(state.atlasEligibilitySource, HUMAN_VERIFIED_META_LEAD);
    assert.equal(state.metaLeadReview.status, "CONFIRMED");
    assert.equal(state.metaLeadReview.confirmedByUserId, OWNER);
    assert.equal(
      state.metaLeadReview.originalFallbackReason,
      "AD_DESTINATION_FALLBACK_NO_CTWA_METADATA"
    );
    assert.equal(state.metaLeadReview.connectionId, "6675cca3-28bf-4aa4-9ac8-0d38801069e1");
    assert.equal(state.metaLeadReview.phoneNumberId, "336196332914297");
    assert.ok(!state.ctwa_clid);
    assert.ok(!state.ctwaReferral);
    assert.equal(hasRealStoredCtwaEvidence(prospect, state), false);

    const confirmed = {
      ...prospect,
      workflow_state: state
    };
    assert.equal(evaluateSuspectedMetaLeadReview(confirmed, state).review, false);
    assert.equal(evaluatePositiveAtlasLeadProvenance(confirmed, state).eligible, true);
    assert.equal(evaluateOperationalProspectRecord(confirmed, state).operational, true);
    assert.equal(evaluateRecruitingInboxEligibility(confirmed, state).eligible, true);

    const outbound = evaluateAutomationOutboundEligibility({
      prospect: confirmed,
      workflowState: state,
      inboundEvent: { messageType: "text", body: "Hola" },
      actor: "ATLAS"
    });
    assert.equal(outbound.eligible, true);
    assert.notEqual(state.atlasEligibilitySource, "CTWA_REFERRAL");
  });
});

test("H) Not a Lead / Personal keeps Atlas silent", async () => {
  await withMemoryState(async () => {
    const prospect = metaFallbackProspect({ phone: "+19048881952" });
    const result = await dismissMetaLeadAsPersonal({
      prospect,
      organizationId: ORG,
      authContext: ownerAuth()
    });
    assert.equal(result.ok, true);
    const state = await loadPersistedWorkflowState("+19048881952", {
      organizationId: ORG
    });
    const dismissed = { ...prospect, workflow_state: state };
    assert.equal(evaluateSuspectedMetaLeadReview(dismissed, state).review, false);
    assert.equal(evaluateOperationalProspectRecord(dismissed, state).operational, false);
    const outbound = evaluateAutomationOutboundEligibility({
      prospect: dismissed,
      workflowState: state,
      actor: "ATLAS"
    });
    assert.equal(outbound.eligible, false);
    const model = await inbox([dismissed], ownerAuth());
    assert.equal(model.items.length, 0);
  });
});

test("I) known personal inbound does not become a suspected lead", () => {
  const prospect = personalProspect();
  const decision = evaluateSuspectedMetaLeadReview(prospect, prospect.workflow_state);
  assert.equal(decision.review, false);
  assert.equal(decision.reason, "PERSONAL_WHATSAPP_NOT_ELIGIBLE");
});

test("J) 131060 alone is not proof of a Meta lead", () => {
  const unsupportedOnly = metaFallbackProspect({
    workflow_state: {
      lastInboundError: { code: 131060, title: "Message unavailable" },
      lastInboundType: "unsupported"
    }
  });
  assert.equal(
    evaluateSuspectedMetaLeadReview(unsupportedOnly, unsupportedOnly.workflow_state).review,
    false
  );

  const withFallback = metaFallbackProspect({
    workflow_state: {
      atlasEligibilitySource: VERIFIED_ATLAS_ELIGIBILITY_SOURCES.META_AD_DESTINATION,
      lastInboundError: { code: 131060 }
    }
  });
  assert.equal(
    evaluateSuspectedMetaLeadReview(withFallback, withFallback.workflow_state).review,
    true
  );
});

test("K) later real CTWA upgrades automatically through monotonic persist", async () => {
  await withMemoryState(async () => {
    await persistVerifiedAtlasEligibilitySource(PHONE, HUMAN_VERIFIED_META_LEAD, {
      organizationId: ORG
    });
    await persistVerifiedAtlasEligibilitySource(
      PHONE,
      VERIFIED_ATLAS_ELIGIBILITY_SOURCES.CTWA_REFERRAL,
      {
        organizationId: ORG,
        ctwaReferral: { source_type: "ad", ctwa_clid: "clid-later" }
      }
    );
    const state = await loadPersistedWorkflowState(PHONE, { organizationId: ORG });
    assert.equal(state.atlasEligibilitySource, "CTWA_REFERRAL");
    assert.equal(state.ctwa_clid, "clid-later");
    assert.equal(
      resolveMonotonicVerifiedEligibilitySource(HUMAN_VERIFIED_META_LEAD, "META_AD_DESTINATION"),
      HUMAN_VERIFIED_META_LEAD
    );
    assert.equal(
      resolveMonotonicVerifiedEligibilitySource(HUMAN_VERIFIED_META_LEAD, "CTWA_REFERRAL"),
      "CTWA_REFERRAL"
    );
  });
});

test("O) other users cannot confirm or dismiss", async () => {
  await withMemoryState(async () => {
    const prospect = metaFallbackProspect();
    const confirm = await confirmMetaLead({
      prospect,
      organizationId: ORG,
      authContext: otherAuth()
    });
    assert.equal(confirm.ok, false);
    assert.equal(confirm.reason, "OWNER_ONLY");
    const dismiss = await dismissMetaLeadAsPersonal({
      prospect,
      organizationId: ORG,
      authContext: otherAuth()
    });
    assert.equal(dismiss.ok, false);
    assert.equal(dismiss.reason, "OWNER_ONLY");
  });
});
