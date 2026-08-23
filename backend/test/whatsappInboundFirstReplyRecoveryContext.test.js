/**
 * Duplicate first-reply recovery — durable recruiting state restoration.
 */

"use strict";

require("dotenv").config({ quiet: true });

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildStalledFirstReplyRecoveryContext,
  restoreStalledFirstReplyRecruitingState,
  extractCtwaReferralFromObservabilityRow
} = require("../core/whatsappInboundFirstReplyRecoveryContext");
const {
  createCampaignIntakeAttributionService
} = require("../core/campaignIntakeCode/campaignIntakeAttributionService");
const {
  createCampaignIntakeCodeRepository
} = require("../core/campaignIntakeCode/campaignIntakeCodeRepository");
const {
  evaluateAtlasInboundAutomationEligibility
} = require("../core/atlasInboundAutomationEligibility");
const {
  savePersistedWorkflowState,
  loadPersistedWorkflowState
} = require("../core/workflowStateStore");

process.env.ATLAS_WORKFLOW_STATE_BACKEND = "memory";

const ORG = "00000000-0000-4000-8000-000000000001";
const PHONE_ID = "1213865645144311";
const WAMID = "wamid.SORAYA.RECOVERY";
const PHONE = "+584144163784";
const PHONE_HUMAN = "+584144163781";
const BODY = "¡Hola! Quiero más información. TVR-0826-A7K4";
const CODE_ID = "8ad7569c-a97c-4e74-b080-a232b590e4b0";

function seedCode() {
  return {
    id: CODE_ID,
    organizationId: ORG,
    ownerUserId: null,
    whatsappPhoneNumberId: PHONE_ID,
    code: "TVR-0826-A7K4",
    campaignName: "TV-RECRUIT-MIAMI-SP-0826",
    purpose: "RECRUITING",
    language: "es",
    status: "ACTIVE",
    createdAt: "2026-08-22T00:00:00.000Z"
  };
}

function buildObservabilityRow(overrides = {}) {
  return {
    provider_message_id: WAMID,
    organization_id: ORG,
    prospect_phone: PHONE,
    phone_number_id: PHONE_ID,
    waba_id: "1017891724443238",
    has_referral: true,
    has_ctwa_clid: true,
    referral_source_type: "ad",
    payload: {
      value: {
        messages: [
          {
            id: WAMID,
            from: "584144163784",
            type: "text",
            text: { body: BODY },
            referral: {
              source_type: "ad",
              ctwa_clid: "ctwa-clid-soraya-test"
            }
          }
        ],
        metadata: { phone_number_id: PHONE_ID }
      }
    },
    ...overrides
  };
}

function buildService(seed = {}) {
  const repository = createCampaignIntakeCodeRepository({
    kind: "memory",
    seed: {
      codes: { [CODE_ID]: seedCode() },
      ...seed
    }
  });
  return createCampaignIntakeAttributionService({ repository });
}

function prospect(overrides = {}) {
  return {
    id: "8e39fbe3-3487-456b-84c3-4319aad0767e",
    phone: PHONE,
    organization_id: ORG,
    current_step: "NEW",
    entry_method: "CLICK_TO_WHATSAPP",
    source: "FACEBOOK",
    ...overrides
  };
}

test("4. CTWA referral reconstructs from durable observability only", () => {
  const referral = extractCtwaReferralFromObservabilityRow(buildObservabilityRow());
  assert.equal(referral.sourceType, "ad");
  assert.equal(referral.ctwaClid, "ctwa-clid-soraya-test");
});

test("3. recovered token state persists CAMPAIGN_INTAKE_CODE from attribution row", async () => {
  const service = buildService({
    attributions: {
      [`${ORG}:${WAMID}`]: {
        id: "attr-1",
        organization_id: ORG,
        campaign_intake_code_id: CODE_ID,
        prospect_id: "8e39fbe3-3487-456b-84c3-4319aad0767e",
        prospect_phone: PHONE,
        provider_message_id: WAMID,
        phone_number_id: PHONE_ID,
        matched_code: "TVR-0826-A7K4",
        campaign_name: "TV-RECRUIT-MIAMI-SP-0826",
        purpose: "RECRUITING",
        owner_user_id: null,
        eligibility_decision: "CAMPAIGN_INTAKE_CODE",
        matched_at: "2026-08-22T23:53:23.448Z",
        metadata: { recruitingEligible: true }
      }
    }
  });

  const ctx = await buildStalledFirstReplyRecoveryContext({
    inbound: {
      providerMessageId: WAMID,
      phone: PHONE,
      body: BODY,
      messageType: "text"
    },
    prospect: prospect(),
    organizationId: ORG,
    intakeService: service,
    dependencies: {
      campaignIntakeRepository: service.repository,
      observabilityRepository: { findByProviderMessageId: async () => null }
    }
  });

  assert.equal(ctx.ok, true);
  assert.equal(ctx.campaignIntakeMatch.recruitingEligible, true);
  assert.equal(ctx.campaignIntakeMatch.code, "TVR-0826-A7K4");

  const restored = await restoreStalledFirstReplyRecruitingState({
    intakeService: service,
    campaignIntakeMatch: ctx.campaignIntakeMatch,
    prospect: prospect(),
    organizationId: ORG,
    providerMessageId: WAMID,
    phoneNumberId: PHONE_ID,
    workflowState: null,
    attribution: ctx.attribution,
    ctwaReferral: ctx.ctwaReferral
  });
  assert.equal(restored.ok, true);

  const wf = await loadPersistedWorkflowState(PHONE, {
    organizationId: ORG,
    prospectId: prospect().id
  });
  assert.equal(wf.atlasEligibilitySource, "CAMPAIGN_INTAKE_CODE");
  assert.equal(wf.campaignIntakeCodeId, CODE_ID);
  assert.equal(wf.workflowOwnership, "ATLAS");
});

test("2. interrupted token intake + observability reconstructs recruitingEligible match", async () => {
  const service = buildService();
  const observabilityRow = buildObservabilityRow();

  const ctx = await buildStalledFirstReplyRecoveryContext({
    inbound: {
      providerMessageId: WAMID,
      phone: PHONE,
      body: BODY,
      messageType: "text"
    },
    prospect: prospect(),
    organizationId: ORG,
    intakeService: service,
    dependencies: {
      campaignIntakeRepository: service.repository,
      observabilityRepository: {
        findByProviderMessageId: async () => observabilityRow
      }
    }
  });

  assert.equal(ctx.ok, true);
  assert.equal(ctx.campaignIntakeMatch.recruitingEligible, true);
  assert.equal(ctx.inboundForAutomation.phoneNumberId, PHONE_ID);
  assert.equal(ctx.inboundForAutomation.ctwaReferral.ctwaClid, "ctwa-clid-soraya-test");
  assert.match(ctx.inboundForAutomation.body, /Quiero más información/);
  assert.doesNotMatch(ctx.inboundForAutomation.body, /TVR-0826-A7K4/);
});

test("5. recovery without durable evidence fails closed", async () => {
  const service = buildService();
  const ctx = await buildStalledFirstReplyRecoveryContext({
    inbound: {
      providerMessageId: WAMID,
      phone: PHONE,
      body: BODY,
      messageType: "text"
    },
    prospect: prospect(),
    organizationId: ORG,
    intakeService: service,
    dependencies: {
      campaignIntakeRepository: service.repository,
      observabilityRepository: { findByProviderMessageId: async () => null }
    }
  });

  assert.equal(ctx.ok, false);
  assert.equal(ctx.reason, "NO_DURABLE_INBOUND_EVIDENCE");
});

test("9. post-recovery continuation inbound Miami is eligible", async () => {
  await savePersistedWorkflowState(
    PHONE,
    {
      atlasEligibilitySource: "CAMPAIGN_INTAKE_CODE",
      campaignIntakeCodeId: CODE_ID,
      campaignIntakePurpose: "RECRUITING",
      canonicalMilestone: "NEW_LEAD",
      workflowOwnership: "ATLAS",
      manualAgentOwnership: false
    },
    { organizationId: ORG, prospectId: prospect().id }
  );

  const p = prospect({ updated_at: new Date().toISOString() });
  const workflowState = await loadPersistedWorkflowState(PHONE, {
    organizationId: ORG,
    prospectId: p.id
  });
  const eligibility = evaluateAtlasInboundAutomationEligibility({
    prospect: p,
    inbound: { text: "Miami" },
    workflowState
  });

  assert.equal(eligibility.eligible, true);
  assert.notEqual(eligibility.reason, "NOT_ELIGIBLE");
});

test("10. HUMAN ownership blocks recovery episode", async () => {
  await savePersistedWorkflowState(
    PHONE_HUMAN,
    {
      manualAgentOwnership: true,
      humanTakenOverAt: new Date().toISOString()
    },
    { organizationId: ORG, prospectId: "human-owned-prospect" }
  );

  const service = buildService();
  const ctx = await buildStalledFirstReplyRecoveryContext({
    inbound: {
      providerMessageId: WAMID,
      phone: PHONE_HUMAN,
      body: BODY,
      messageType: "text"
    },
    prospect: prospect({ phone: PHONE_HUMAN, id: "human-owned-prospect" }),
    organizationId: ORG,
    intakeService: service,
    dependencies: {
      campaignIntakeRepository: service.repository,
      observabilityRepository: { findByProviderMessageId: async () => buildObservabilityRow({ prospect_phone: PHONE_HUMAN }) }
    }
  });

  assert.equal(ctx.ok, false);
  assert.equal(ctx.reason, "HUMAN_OWNED");
});

test("6. establishInboundAttribution remains idempotent on recovery restore", async () => {
  const service = buildService();
  const match = await service.resolveInboundCampaignIntakeMatch({
    organizationId: ORG,
    whatsappPhoneNumberId: PHONE_ID,
    messageBody: BODY,
    prospect: prospect(),
    created: true
  });

  const first = await service.establishInboundAttribution({
    match,
    prospect: prospect(),
    created: true,
    providerMessageId: WAMID,
    phoneNumberId: PHONE_ID,
    organizationId: ORG
  });
  const second = await restoreStalledFirstReplyRecruitingState({
    intakeService: service,
    campaignIntakeMatch: match,
    prospect: prospect(),
    organizationId: ORG,
    providerMessageId: WAMID,
    phoneNumberId: PHONE_ID,
    workflowState: null,
    attribution: first.attribution,
    ctwaReferral: null
  });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.idempotent, true);
});
