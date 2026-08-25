/**
 * BR-147 — IUL campaign intake auto-eligibility (policy_review lane only).
 */

"use strict";

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  evaluateAtlasInboundAutomationEligibility,
  hasFreshIulCampaignIntakeMatch,
  VERIFIED_ATLAS_ELIGIBILITY_SOURCES
} = require("../core/atlasInboundAutomationEligibility");
const {
  createMemoryCampaignIntakeCodeRepository,
  INTAKE_CODE_STATUS
} = require("../core/campaignIntakeCode/campaignIntakeCodeRepository");
const {
  createCampaignIntakeAttributionService
} = require("../core/campaignIntakeCode/campaignIntakeAttributionService");
const { buildPrefilledMessage } = require("../core/campaignIntakeCode/intakeCodeGenerator");
const {
  createConversationContext,
  interpretInboundMessage,
  decideConversationTurn,
  buildResponsePlan,
  renderCustomerReply,
  INTENTS,
  isExecutionEnabled
} = require("../core/recruitAiV2");
const {
  CONVERSATION_GOAL,
  CAMPAIGN_KIND,
  ASK
} = require("../core/recruitAiV2/iulAdConversation");
const {
  isLiveExecutionPathEnabled
} = require("../core/recruitAiV2/liveExecutionPathConfig");

const TEAM_VISION_ORG = "00000000-0000-4000-8000-000000000001";
const TV_PHONE_ID = "1213865645144311";
const OTHER_ORG = "00000000-0000-4000-8000-000000000099";
const OTHER_PHONE_ID = "9999999999999999";
const IUL_CODE = "TVI-0824-VNC8";

function seedIulCode(overrides = {}) {
  return {
    id: "code-iul-canary",
    organization_id: TEAM_VISION_ORG,
    owner_user_id: "33ad243a-9d00-4a4d-810b-df2762c0f076",
    whatsapp_phone_number_id: TV_PHONE_ID,
    code: IUL_CODE,
    campaign_name: "TV-IUL-REVIEW-MIAMI-SP-0826",
    purpose: "IUL",
    language: "es",
    status: INTAKE_CODE_STATUS.ACTIVE,
    ...overrides
  };
}

function buildService(codes = []) {
  const seed = {};
  for (const row of codes) {
    seed[row.code.toUpperCase()] = row;
  }
  return createCampaignIntakeAttributionService({
    repository: createMemoryCampaignIntakeCodeRepository({ codes: seed })
  });
}

function iulIntakeContext(overrides = {}) {
  return createConversationContext({
    preferredLanguage: "spanish",
    conversationGoal: CONVERSATION_GOAL,
    campaignKind: CAMPAIGN_KIND,
    campaignIntakePurpose: "IUL",
    ...overrides
  });
}

function renderPrefilledTurn(code = IUL_CODE) {
  const text = buildPrefilledMessage(code, "es");
  const context = iulIntakeContext();
  const interpretation = interpretInboundMessage({ message: { text }, context });
  const decision = decideConversationTurn({ context, interpretation });
  const rendered = renderCustomerReply(buildResponsePlan(decision));
  return { text, interpretation, decision, rendered };
}

test("valid ACTIVE IUL intake → CAMPAIGN_INTAKE_IUL eligible", async () => {
  const service = buildService([seedIulCode()]);
  const body = buildPrefilledMessage(IUL_CODE, "es");
  const resolved = await service.resolveInboundCampaignIntakeMatch({
    organizationId: TEAM_VISION_ORG,
    whatsappPhoneNumberId: TV_PHONE_ID,
    messageBody: body,
    created: true
  });
  assert.equal(resolved.matched, true);
  assert.equal(resolved.recruitingEligible, false);
  assert.equal(resolved.iulReviewEligible, true);
  assert.equal(hasFreshIulCampaignIntakeMatch({ campaignIntakeMatch: resolved }), true);
  const eligibility = evaluateAtlasInboundAutomationEligibility({
    prospect: {
      phone: "+17865559001",
      organization_id: TEAM_VISION_ORG,
      current_step: "NEW"
    },
    inbound: { campaignIntakeMatch: resolved }
  });
  assert.equal(eligibility.eligible, true);
  assert.equal(eligibility.reason, "CAMPAIGN_INTAKE_IUL");
});

test("valid IUL intake never recruiting eligible", async () => {
  const service = buildService([seedIulCode()]);
  const resolved = await service.resolveInboundCampaignIntakeMatch({
    organizationId: TEAM_VISION_ORG,
    whatsappPhoneNumberId: TV_PHONE_ID,
    messageBody: buildPrefilledMessage(IUL_CODE, "es"),
    created: true
  });
  assert.equal(resolved.recruitingEligible, false);
});

test("fake token → not eligible", async () => {
  const service = buildService([seedIulCode()]);
  const lookup = await service.lookupInboundMatch({
    organizationId: TEAM_VISION_ORG,
    whatsappPhoneNumberId: TV_PHONE_ID,
    messageBody: "Hola TVI-9999-FAKE"
  });
  assert.equal(lookup.matched, false);
  assert.equal(
    evaluateAtlasInboundAutomationEligibility({
      prospect: { phone: "+17865559002", organization_id: TEAM_VISION_ORG },
      inbound: { campaignIntakeMatch: lookup }
    }).eligible,
    false
  );
});

test("paused IUL code → not eligible", async () => {
  const service = buildService([
    seedIulCode({ status: INTAKE_CODE_STATUS.PAUSED })
  ]);
  const lookup = await service.lookupInboundMatch({
    organizationId: TEAM_VISION_ORG,
    whatsappPhoneNumberId: TV_PHONE_ID,
    messageBody: buildPrefilledMessage(IUL_CODE, "es")
  });
  assert.equal(lookup.matched, false);
});

test("retired IUL code → not eligible", async () => {
  const service = buildService([
    seedIulCode({ status: INTAKE_CODE_STATUS.RETIRED })
  ]);
  const lookup = await service.lookupInboundMatch({
    organizationId: TEAM_VISION_ORG,
    whatsappPhoneNumberId: TV_PHONE_ID,
    messageBody: buildPrefilledMessage(IUL_CODE, "es")
  });
  assert.equal(lookup.matched, false);
});

test("wrong org → not eligible", async () => {
  const service = buildService([seedIulCode()]);
  const lookup = await service.lookupInboundMatch({
    organizationId: OTHER_ORG,
    whatsappPhoneNumberId: TV_PHONE_ID,
    messageBody: buildPrefilledMessage(IUL_CODE, "es")
  });
  assert.equal(lookup.matched, false);
});

test("wrong WhatsApp phone ID → not eligible", async () => {
  const service = buildService([seedIulCode()]);
  const lookup = await service.lookupInboundMatch({
    organizationId: TEAM_VISION_ORG,
    whatsappPhoneNumberId: OTHER_PHONE_ID,
    messageBody: buildPrefilledMessage(IUL_CODE, "es")
  });
  assert.equal(lookup.matched, false);
});

test("RECRUITING intake unchanged", async () => {
  const service = buildService([
    {
      id: "code-rec",
      organization_id: TEAM_VISION_ORG,
      owner_user_id: "owner-1",
      whatsapp_phone_number_id: TV_PHONE_ID,
      code: "TVR-0824-ABCD",
      campaign_name: "TV-RECRUIT",
      purpose: "RECRUITING",
      language: "es",
      status: INTAKE_CODE_STATUS.ACTIVE
    }
  ]);
  const resolved = await service.resolveInboundCampaignIntakeMatch({
    organizationId: TEAM_VISION_ORG,
    whatsappPhoneNumberId: TV_PHONE_ID,
    messageBody: "Hola TVR-0824-ABCD",
    created: true
  });
  assert.equal(resolved.recruitingEligible, true);
  assert.notEqual(resolved.iulReviewEligible, true);
  const eligibility = evaluateAtlasInboundAutomationEligibility({
    prospect: { phone: "+17865559003", organization_id: TEAM_VISION_ORG },
    inbound: { campaignIntakeMatch: resolved }
  });
  assert.equal(eligibility.eligible, true);
  assert.equal(eligibility.reason, "CAMPAIGN_INTAKE_CODE");
});

test("BR-142 CTWA still eligible without intake", () => {
  const result = evaluateAtlasInboundAutomationEligibility({
    prospect: {
      phone: "+17865559004",
      organization_id: TEAM_VISION_ORG,
      source: "UNKNOWN",
      entry_method: "UNATTRIBUTED"
    },
    inbound: { ctwaReferral: { sourceType: "ad" } }
  });
  assert.equal(result.eligible, true);
  assert.equal(result.reason, "CTWA_REFERRAL");
});

test("Spanish prefilled IUL text uses intake opener not info-only education", () => {
  const { interpretation, decision, rendered } = renderPrefilledTurn(IUL_CODE);
  assert.equal(interpretation.intent, INTENTS.IUL_GREETING);
  assert.match(rendered.text, /orientarle/i);
  assert.doesNotMatch(rendered.text, /solo una inversión/i);
  assert.doesNotMatch(rendered.text, /Zoom/i);
  assert.equal(decision.contextPatch.conversation.lastQuestionAsked, ASK.QUALIFICATION_STATUS);
  assert.equal(decision.decision.mayCreateAppointment, false);
});

test("IUL intake turn routes to policy_review not recruiting city ask", () => {
  const { rendered } = renderPrefilledTurn(IUL_CODE);
  assert.doesNotMatch(rendered.text, /ciudad/i);
  assert.match(rendered.text, /orientarle|situación/i);
});

test("execution and appointment gates remain OFF", () => {
  assert.equal(isExecutionEnabled({ env: process.env }), false);
  assert.equal(isLiveExecutionPathEnabled({ env: process.env }), false);
});

test("CAMPAIGN_INTAKE_IUL is a verified eligibility source enum", () => {
  assert.equal(VERIFIED_ATLAS_ELIGIBILITY_SOURCES.CAMPAIGN_INTAKE_IUL, "CAMPAIGN_INTAKE_IUL");
});
