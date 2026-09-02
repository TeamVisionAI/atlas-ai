/**
 * Continuation must not downgrade CTWA_REFERRAL to META_AD_DESTINATION.
 * Implements BR-142 / BR-193 priority and BR-201 inbound-specific proof.
 * Does not implement BR-215 (META-only stays LEGACY_AMBIGUOUS).
 */

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  evaluatePositiveAtlasLeadProvenance,
  evaluateAtlasInboundAutomationEligibility,
  resolveVerifiedAtlasEligibilitySource,
  persistVerifiedAtlasEligibilitySource,
  resolveInboundCtwaReferral,
  resolveMonotonicVerifiedEligibilitySource,
  buildDurableCtwaEvidence,
  hasRealStoredCtwaEvidence,
  VERIFIED_ATLAS_ELIGIBILITY_SOURCES
} = require("../core/atlasInboundAutomationEligibility");
const {
  evaluateOperationalProspectRecord
} = require("../core/prospectPromotionEligibility");
const {
  evaluateRecruitingInboxEligibility
} = require("../core/conversationsCenter/conversationsCenterInboxEligibility");
const {
  loadPersistedWorkflowState,
  clearMemoryWorkflowStateStore
} = require("../core/workflowStateStore");
const { evaluateProspectPromotion } = require("../core/prospectPromotionEligibility");
const { WHATSAPP_ENTRY_METHOD, WHATSAPP_SOURCE } = require("../core/whatsappConstants");

const PHONE = "+13053312923";
const ORG = "00000000-0000-4000-8000-000000000001";
const AD_PHONE_ID = "336196332914297";

const CTWA = VERIFIED_ATLAS_ELIGIBILITY_SOURCES.CTWA_REFERRAL;
const META = VERIFIED_ATLAS_ELIGIBILITY_SOURCES.META_AD_DESTINATION;
const QR = VERIFIED_ATLAS_ELIGIBILITY_SOURCES.QR;
const CAMPAIGN = VERIFIED_ATLAS_ELIGIBILITY_SOURCES.CAMPAIGN_INTAKE_CODE;
const LEAD_ADS = VERIFIED_ATLAS_ELIGIBILITY_SOURCES.FACEBOOK_LEAD_ADS;

function enabledAdConnection() {
  return {
    status: "connected",
    phone_number_id: AD_PHONE_ID,
    organization_id: ORG,
    user_id: "d8d75c0e-d93e-42c9-950e-004fbfabdc8d",
    metaAdDestinationAutomationEnabled: true
  };
}

function ctwaReferral() {
  return {
    source_type: "ad",
    ctwa_clid: "clid-yoan-test",
    source_id: "120250992826890386",
    source_url: "https://fb.me/example",
    headline: "Misleisys Tamayo"
  };
}

function prospect(overrides = {}) {
  return {
    id: "7c6c9e04-103e-48c6-857f-e55894047199",
    phone: PHONE,
    organization_id: ORG,
    owner_user_id: "d8d75c0e-d93e-42c9-950e-004fbfabdc8d",
    source: null,
    entry_method: null,
    current_step: "NEW",
    status: "NEW",
    ...overrides
  };
}

async function withMemoryState(run) {
  const previousBackend = process.env.ATLAS_WORKFLOW_STATE_BACKEND;
  const previousKey = process.env.ATLAS_WORKFLOW_STATE_MEMORY_KEY;
  process.env.ATLAS_WORKFLOW_STATE_BACKEND = "memory";
  process.env.ATLAS_WORKFLOW_STATE_MEMORY_KEY = `ctwa-preserve-${Date.now()}-${Math.random()}`;
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

test("A) first CTWA inbound persists CTWA_REFERRAL and durable evidence", async () => {
  await withMemoryState(async () => {
    const referral = ctwaReferral();
    await persistVerifiedAtlasEligibilitySource(PHONE, CTWA, {
      organizationId: ORG,
      prospectId: prospect().id,
      ctwaReferral: referral
    });
    const state = await loadPersistedWorkflowState(PHONE, { organizationId: ORG });
    assert.equal(state.atlasEligibilitySource, CTWA);
    assert.equal(state.ctwa_clid, "clid-yoan-test");
    assert.equal(state.ctwaReferral.sourceType, "ad");
    assert.equal(state.ctwaReferral.sourceId, "120250992826890386");
    assert.ok(state.ctwaEvidencePersistedAt);
    assert.equal(hasRealStoredCtwaEvidence(prospect(), state), true);
  });
});

test("B) later inbound without referral does not downgrade CTWA_REFERRAL", async () => {
  await withMemoryState(async () => {
    await persistVerifiedAtlasEligibilitySource(PHONE, CTWA, {
      organizationId: ORG,
      ctwaReferral: ctwaReferral()
    });
    await persistVerifiedAtlasEligibilitySource(PHONE, META, {
      organizationId: ORG
    });
    const state = await loadPersistedWorkflowState(PHONE, { organizationId: ORG });
    assert.equal(state.atlasEligibilitySource, CTWA);
    assert.equal(state.ctwa_clid, "clid-yoan-test");
  });
});

test("C) multiple continuation turns keep strong provenance", async () => {
  await withMemoryState(async () => {
    await persistVerifiedAtlasEligibilitySource(PHONE, CTWA, {
      organizationId: ORG,
      ctwaReferral: ctwaReferral()
    });
    for (let i = 0; i < 3; i += 1) {
      const resolved = resolveVerifiedAtlasEligibilitySource({
        ctwaReferral: null,
        whatsappConnection: enabledAdConnection(),
        inboundPhoneNumberId: AD_PHONE_ID,
        expectedOrganizationId: ORG,
        prospect: prospect(),
        workflowState: await loadPersistedWorkflowState(PHONE, { organizationId: ORG })
      });
      await persistVerifiedAtlasEligibilitySource(PHONE, resolved, {
        organizationId: ORG
      });
    }
    const state = await loadPersistedWorkflowState(PHONE, { organizationId: ORG });
    assert.equal(state.atlasEligibilitySource, CTWA);
    assert.equal(state.ctwa_clid, "clid-yoan-test");
  });
});

test("D) META_AD_DESTINATION upgrades to CTWA_REFERRAL when later real CTWA arrives", async () => {
  await withMemoryState(async () => {
    await persistVerifiedAtlasEligibilitySource(PHONE, META, { organizationId: ORG });
    assert.equal(
      (await loadPersistedWorkflowState(PHONE, { organizationId: ORG })).atlasEligibilitySource,
      META
    );
    await persistVerifiedAtlasEligibilitySource(PHONE, CTWA, {
      organizationId: ORG,
      ctwaReferral: ctwaReferral()
    });
    const state = await loadPersistedWorkflowState(PHONE, { organizationId: ORG });
    assert.equal(state.atlasEligibilitySource, CTWA);
    assert.equal(state.ctwa_clid, "clid-yoan-test");
  });
});

test("E/F/G) weak META cannot overwrite campaign, QR, or Facebook Lead Ads", () => {
  assert.equal(resolveMonotonicVerifiedEligibilitySource(CAMPAIGN, META), CAMPAIGN);
  assert.equal(resolveMonotonicVerifiedEligibilitySource(QR, META), QR);
  assert.equal(resolveMonotonicVerifiedEligibilitySource(LEAD_ADS, META), LEAD_ADS);
  assert.equal(resolveMonotonicVerifiedEligibilitySource(CTWA, META), CTWA);
  assert.equal(resolveMonotonicVerifiedEligibilitySource(META, META), META);
  assert.equal(resolveMonotonicVerifiedEligibilitySource(META, CTWA), CTWA);
  assert.equal(resolveMonotonicVerifiedEligibilitySource(null, META), META);
});

test("H) rawMessage.referral is recovered if parsed origin missed it", () => {
  const recovered = resolveInboundCtwaReferral({
    ctwaReferral: null,
    rawMessage: {
      type: "text",
      text: { body: "Hola Miami" },
      referral: ctwaReferral()
    }
  });
  assert.equal(recovered.sourceType, "ad");
  assert.equal(recovered.ctwaClid, "clid-yoan-test");

  const fromResolve = resolveVerifiedAtlasEligibilitySource({
    ctwaReferral: null,
    rawMessage: { referral: ctwaReferral() },
    whatsappConnection: enabledAdConnection(),
    inboundPhoneNumberId: AD_PHONE_ID,
    expectedOrganizationId: ORG
  });
  assert.equal(fromResolve, CTWA);
});

test("I) stored CTWA evidence keeps BR-201 operational and inbox eligibility", () => {
  const evidence = buildDurableCtwaEvidence(ctwaReferral());
  const row = prospect({
    workflow_state: {
      atlasEligibilitySource: CTWA,
      ...evidence
    }
  });
  const provenance = evaluatePositiveAtlasLeadProvenance(row, row.workflow_state);
  const operational = evaluateOperationalProspectRecord(row, row.workflow_state);
  const inbox = evaluateRecruitingInboxEligibility(row, row.workflow_state);
  assert.equal(provenance.eligible, true);
  assert.equal(operational.operational, true);
  assert.equal(inbox.eligible, true);
  assert.notEqual(provenance.reason, "LEGACY_AMBIGUOUS");
});

test("J) ordinary personal inbound remains silent and unpromoted", () => {
  const eligibility = evaluateAtlasInboundAutomationEligibility({
    prospect: prospect({
      source: WHATSAPP_SOURCE.PERSONAL_WHATSAPP,
      entry_method: WHATSAPP_ENTRY_METHOD.PERSONAL_WHATSAPP
    }),
    inbound: {
      text: "Hola. ¿Puedes darme más información sobre esto?",
      whatsappConnectionSource: "whatsapp_personal_connection",
      whatsappConnection: {
        ...enabledAdConnection(),
        metaAdDestinationAutomationEnabled: false
      },
      phoneNumberId: AD_PHONE_ID
    }
  });
  assert.equal(eligibility.eligible, false);

  const promotion = evaluateProspectPromotion({
    existingProspect: null,
    ctwaReferral: null,
    whatsappConnection: {
      ...enabledAdConnection(),
      metaAdDestinationAutomationEnabled: false
    },
    inboundPhoneNumberId: AD_PHONE_ID,
    expectedOrganizationId: ORG,
    whatsappConnectionSource: "whatsapp_personal_connection"
  });
  assert.equal(promotion.promote, false);
});

test("K) META-only remains LEGACY_AMBIGUOUS — BR-215 not implemented", () => {
  const row = prospect({
    source: WHATSAPP_SOURCE.META_AD_DESTINATION,
    entry_method: WHATSAPP_ENTRY_METHOD.META_AD_DESTINATION,
    workflow_state: { atlasEligibilitySource: META }
  });
  const provenance = evaluatePositiveAtlasLeadProvenance(row, row.workflow_state);
  const operational = evaluateOperationalProspectRecord(row, row.workflow_state);
  const inbox = evaluateRecruitingInboxEligibility(row, row.workflow_state);
  assert.equal(provenance.eligible, false);
  assert.equal(provenance.reason, "LEGACY_AMBIGUOUS");
  assert.equal(operational.operational, false);
  assert.equal(inbox.eligible, false);
});

test("continuation resolve uses stored CTWA before META fallback", () => {
  const source = resolveVerifiedAtlasEligibilitySource({
    ctwaReferral: null,
    whatsappConnection: enabledAdConnection(),
    inboundPhoneNumberId: AD_PHONE_ID,
    expectedOrganizationId: ORG,
    prospect: prospect(),
    workflowState: {
      atlasEligibilitySource: CTWA,
      ctwa_clid: "clid-yoan-test",
      ctwaReferral: { sourceType: "ad", ctwaClid: "clid-yoan-test" }
    }
  });
  assert.equal(source, CTWA);
});

test("connection toggle alone does not invent CTWA", () => {
  assert.equal(resolveInboundCtwaReferral({ ctwaReferral: null, rawMessage: { type: "text" } }), null);
  const source = resolveVerifiedAtlasEligibilitySource({
    ctwaReferral: null,
    whatsappConnection: enabledAdConnection(),
    inboundPhoneNumberId: AD_PHONE_ID,
    expectedOrganizationId: ORG
  });
  assert.equal(source, META);
});
