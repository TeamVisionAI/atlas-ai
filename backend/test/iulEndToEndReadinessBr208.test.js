/**
 * BR-208 — IUL end-to-end production readiness regressions.
 * Does not loosen BR-142 / BR-200 / BR-201.
 */

"use strict";

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

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
  INTENTS
} = require("../core/recruitAiV2");
const { NEXT_ACTIONS } = require("../core/recruitAiV2/constants");
const { ASK, CONVERSATION_GOAL, CAMPAIGN_KIND } = require("../core/recruitAiV2/iulAdConversation");
const { IUL_OPTION_IDS } = require("../core/recruitAiV2/iulQualificationOptions");
const { authorizeSideEffects, V2_EXECUTABLE_ACTIONS } = require("../core/recruitAiV2/sideEffectAuthorizer");
const { buildReminderMessage, REMINDER_TYPES } = require("../services/appointmentReminderEngine");
const { isUnsupportedMetaLeadCandidateShape } = require("../core/unsupportedWhatsAppInboundReview/detection");
const { META_UNSUPPORTED_LEAD_ERROR_CODE } = require("../core/unsupportedWhatsAppInboundReview/constants");

const TEAM_VISION_ORG = "00000000-0000-4000-8000-000000000001";
const TV_PHONE_ID = "1213865645144311";
const IUL_CODE = "TVI-0824-VNC8";

function seedIulCode(overrides = {}) {
  return {
    id: "code-iul-br208",
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

function buildService(codes = [seedIulCode()]) {
  const seed = {};
  for (const row of codes) {
    seed[row.code.toUpperCase()] = row;
  }
  return createCampaignIntakeAttributionService({
    repository: createMemoryCampaignIntakeCodeRepository({ codes: seed }),
    linkPolicyReviewFromIulIntake: async () => ({ ok: true, pending: true })
  });
}

function iulContext(overrides = {}) {
  return createConversationContext({
    preferredLanguage: "spanish",
    conversationGoal: CONVERSATION_GOAL,
    campaignKind: CAMPAIGN_KIND,
    campaignIntakePurpose: "IUL",
    ...overrides
  });
}

function turn(message, context) {
  const interpretation = interpretInboundMessage({ message, context });
  const decision = decideConversationTurn({ context, interpretation });
  const rendered = renderCustomerReply(buildResponsePlan(decision));
  return { interpretation, decision, rendered };
}

test("A) valid IUL intake code → IUL flow, not Recruit AI", async () => {
  const service = buildService();
  const resolved = await service.resolveInboundCampaignIntakeMatch({
    organizationId: TEAM_VISION_ORG,
    whatsappPhoneNumberId: TV_PHONE_ID,
    messageBody: buildPrefilledMessage(IUL_CODE, "es"),
    created: true
  });
  assert.equal(resolved.iulReviewEligible, true);
  assert.equal(resolved.recruitingEligible, false);
  assert.equal(hasFreshIulCampaignIntakeMatch({ campaignIntakeMatch: resolved }), true);

  const { rendered, decision } = turn(
    { text: buildPrefilledMessage(IUL_CODE, "es") },
    iulContext()
  );
  assert.doesNotMatch(rendered.text, /ciudad|empleo|oportunidad/i);
  assert.match(rendered.text, /situación|orientarle/i);
  assert.equal(decision.contextPatch.conversationGoal, CONVERSATION_GOAL);
  assert.equal(decision.contextPatch.conversation.lastQuestionAsked, ASK.QUALIFICATION_STATUS);
});

test("B) valid CTWA IUL ad → IUL flow", () => {
  const eligibility = evaluateAtlasInboundAutomationEligibility({
    prospect: { phone: "+17865550101", organization_id: TEAM_VISION_ORG },
    inbound: {
      ctwaReferral: {
        sourceType: "ad",
        ctwaClid: "clid-iul-1",
        headline: "Revisa tu póliza IUL"
      }
    }
  });
  assert.equal(eligibility.eligible, true);
  assert.equal(eligibility.reason, "CTWA_REFERRAL");

  const { resolveIulCampaignFields } = require("../core/recruitAiV2/iulAdConversation");
  const fields = resolveIulCampaignFields({
    ctwaReferral: { headline: "Revisa tu póliza IUL", sourceType: "ad", ctwaClid: "clid-iul-1" }
  });
  assert.equal(fields.conversationGoal, CONVERSATION_GOAL);
  const { rendered } = turn({ text: "Hola" }, iulContext(fields));
  assert.match(rendered.text, /situación|orientarle/i);
  assert.doesNotMatch(rendered.text, /ciudad y estado/i);
});

test("C) existing recruit + IUL intake → IUL session wins", async () => {
  const service = buildService();
  const resolved = await service.resolveInboundCampaignIntakeMatch({
    organizationId: TEAM_VISION_ORG,
    whatsappPhoneNumberId: TV_PHONE_ID,
    messageBody: buildPrefilledMessage(IUL_CODE, "es"),
    created: false,
    prospect: {
      id: "existing-recruit",
      phone: "+17865550102",
      source: "FACEBOOK",
      entry_method: "CLICK_TO_WHATSAPP"
    },
    workflowState: {
      canonicalMilestone: "INTERVIEW_READY",
      conversationGoal: "interview"
    }
  });
  assert.equal(resolved.iulReviewEligible, true);
  assert.equal(resolved.recruitingEligible, false);
  assert.equal(resolved.reason, "MATCHED");

  const { decision } = turn(
    { text: buildPrefilledMessage(IUL_CODE, "es") },
    iulContext({
      knownFacts: { city: "Miami", state: "FL" }
    })
  );
  assert.equal(decision.contextPatch.conversationGoal, CONVERSATION_GOAL);
  assert.equal(decision.contextPatch.campaignKind, CAMPAIGN_KIND);
  assert.doesNotMatch(JSON.stringify(decision), /ask_location|ASK_CITY/);
});

test("D) personal inbound stays silent", () => {
  const result = evaluateAtlasInboundAutomationEligibility({
    prospect: { phone: "+17865550103", organization_id: TEAM_VISION_ORG },
    inbound: { text: "Hola" }
  });
  assert.equal(result.eligible, false);
});

test("E) META_AD_DESTINATION-only stays silent", () => {
  const result = evaluateAtlasInboundAutomationEligibility({
    prospect: {
      phone: "+17865550104",
      organization_id: TEAM_VISION_ORG,
      source: "META_AD_DESTINATION",
      entry_method: "META_AD_DESTINATION"
    },
    inbound: { text: "Hola" }
  });
  assert.equal(result.eligible, false);
});

test("F) IUL session survives FAQ interruption", () => {
  const first = turn({ text: "Hola" }, iulContext());
  const nextContext = createConversationContext({
    ...iulContext(),
    conversation: {
      lastQuestionAsked: ASK.QUALIFICATION_STATUS
    },
    knownFacts: first.decision.contextPatch.knownFacts || {}
  });
  const faq = turn({ text: "¿Cuánto cuesta la revisión?" }, nextContext);
  assert.match(faq.rendered.text, /gratis|revisión/i);
  assert.doesNotMatch(faq.rendered.text, /ciudad y estado|empleo/i);
  assert.equal(faq.decision.contextPatch.conversationGoal, CONVERSATION_GOAL);
});

test("G) IUL session survives multi-turn qualification", () => {
  const greeting = turn({ text: "Hola" }, iulContext());
  assert.equal(greeting.interpretation.intent, INTENTS.IUL_GREETING);
  const afterStatus = turn(
    {
      text: "Tengo un IUL activo",
      interactiveReply: { id: IUL_OPTION_IDS.STATUS_ACTIVE, title: "Tengo un IUL activo" }
    },
    iulContext({
      conversation: { lastQuestionAsked: ASK.QUALIFICATION_STATUS }
    })
  );
  assert.equal(afterStatus.interpretation.intent, INTENTS.IUL_STATUS_ACTIVE);
  assert.equal(afterStatus.decision.contextPatch.knownFacts.iulQualificationStatus, IUL_OPTION_IDS.STATUS_ACTIVE);
  assert.equal(afterStatus.decision.contextPatch.conversation.lastQuestionAsked, ASK.REVIEW_INTENT);
});

test("H) qualified IUL lead moves to Zoom scheduling, not recruiting interview", () => {
  const afterIntent = turn(
    {
      text: "Costos",
      interactiveReply: { id: IUL_OPTION_IDS.REVIEW_COSTS, title: "Costos" }
    },
    iulContext({
      conversation: { lastQuestionAsked: ASK.REVIEW_INTENT },
      knownFacts: { iulQualificationStatus: IUL_OPTION_IDS.STATUS_ACTIVE }
    })
  );
  assert.match(afterIntent.rendered.text, /póliza|horario/i);
  assert.doesNotMatch(afterIntent.rendered.text, /entrevista de reclutamiento|ciudad y estado/i);
  assert.equal(
    afterIntent.decision.contextPatch.knownFacts.reviewMeetingType ||
      afterIntent.decision.contextPatch.appointment?.meetingType,
    "ZOOM"
  );
});

test("I) slot selection does not send a confirmed appointment message", () => {
  const result = turn(
    { text: "10:00" },
    iulContext({
      conversation: { lastQuestionAsked: ASK.OFFER_SLOTS },
      appointment: {
        previouslyOfferedSlots: [
          { date: "2026-09-08", time: "10:00", dateKey: "2026-09-08", timeKey: "10:00" }
        ]
      },
      knownFacts: {
        iulQualificationStatus: IUL_OPTION_IDS.STATUS_ACTIVE,
        iulReviewIntent: IUL_OPTION_IDS.REVIEW_COSTS
      }
    })
  );
  assert.doesNotMatch(result.rendered.text, /quedó confirmad|Perfecto, confirmado/i);
  assert.match(result.rendered.text, /reservando|confirmo cuando/i);
  assert.equal(result.decision.decision.nextAction, NEXT_ACTIONS.IUL_CREATE_REVIEW_APPOINTMENT);
  assert.equal(result.decision.decision.mayCreateAppointment, true);
});

test("J) IUL create action is proposed as CREATE_APPOINTMENT and denied without execution flags", () => {
  const auth = authorizeSideEffects({
    structuredDecision: {
      decision: {
        nextAction: NEXT_ACTIONS.IUL_CREATE_REVIEW_APPOINTMENT,
        mayCreateAppointment: true
      }
    },
    responsePlan: { templateKey: "iul_confirm_review_deferred" },
    context: iulContext({ organizationId: TEAM_VISION_ORG }),
    env: {},
    profileConfigured: false
  });
  assert.equal(auth.authorized, false);
  assert.ok(
    (auth.proposals || []).some((row) => row.type === V2_EXECUTABLE_ACTIONS.CREATE_APPOINTMENT)
  );
});

test("K) IUL scheduling config stays Zoom / policy_review", () => {
  const { resolveSchedulingConfig, WORKFLOW_TYPES } = require("../core/sharedScheduling/sharedSchedulingConfig");
  const config = resolveSchedulingConfig(iulContext());
  assert.equal(config.workflowType, WORKFLOW_TYPES.IUL_POLICY_REVIEW);
  assert.equal(config.purpose, "policy_review");
  assert.equal(config.defaultVirtualProvider, "zoom");
});

test("L) IUL reminders use Policy Review language, recruiting reminders stay entrevista", () => {
  const iul = buildReminderMessage(
    {
      purpose: "policy_review",
      startDateTime: "2026-09-08T14:00:00.000Z",
      timezone: "America/New_York",
      virtualMeetingUrl: "https://zoom.example/j/1"
    },
    REMINDER_TYPES.REMINDER_24H,
    { name: "Ana", preferred_language: "es" }
  );
  assert.match(iul, /su revisión de póliza IUL/);
  assert.match(iul, /por Zoom/);
  assert.doesNotMatch(iul, /entrevista|\btu\b|\bte recordamos\b/);

  const recruiting = buildReminderMessage(
    {
      purpose: "recruiting_interview",
      startDateTime: "2026-09-08T14:00:00.000Z",
      timezone: "America/New_York"
    },
    REMINDER_TYPES.REMINDER_24H,
    { name: "Luis", preferred_language: "es" }
  );
  assert.match(recruiting, /entrevista/);
  assert.doesNotMatch(recruiting, /revisión de póliza IUL/);
});

test("M) unanswered IUL qualification stays Atlas-owned, not NEEDS_ATTENTION", () => {
  const { decision } = turn({ text: "Hola" }, iulContext());
  assert.equal(decision.contextPatch.conversation.lastQuestionAsked, ASK.QUALIFICATION_STATUS);
  assert.notEqual(decision.contextPatch.needsHumanAttention, true);
  assert.notEqual(decision.decision.shouldEscalate, true);
});

test("N) IUL research path stays in IUL and does not invent a recruiting disqualifier", () => {
  const result = turn(
    {
      text: "Estoy buscando información",
      interactiveReply: { id: IUL_OPTION_IDS.STATUS_RESEARCH, title: "Busco información" }
    },
    iulContext({
      conversation: { lastQuestionAsked: ASK.QUALIFICATION_STATUS }
    })
  );
  assert.equal(result.interpretation.intent, INTENTS.IUL_STATUS_RESEARCH);
  assert.equal(result.decision.contextPatch.conversationGoal, CONVERSATION_GOAL);
  assert.equal(result.decision.contextPatch.conversation.lastQuestionAsked, ASK.RESEARCH_INTENT);
});

test("O) 131060 unsupported inbound is not IUL eligibility", () => {
  const inbound = {
    messageType: "unsupported",
    text: "",
    rawMessage: { errors: [{ code: META_UNSUPPORTED_LEAD_ERROR_CODE }] }
  };
  assert.equal(
    isUnsupportedMetaLeadCandidateShape({
      inbound,
      organizationSource: "whatsapp_organization_connection"
    }),
    true
  );
  const eligibility = evaluateAtlasInboundAutomationEligibility({
    prospect: { phone: "+17865550105", organization_id: TEAM_VISION_ORG },
    inbound
  });
  assert.equal(eligibility.eligible, false);
});

test("P) later readable IUL intake after unsupported recovery starts IUL flow", async () => {
  const service = buildService();
  const resolved = await service.resolveInboundCampaignIntakeMatch({
    organizationId: TEAM_VISION_ORG,
    whatsappPhoneNumberId: TV_PHONE_ID,
    messageBody: buildPrefilledMessage(IUL_CODE, "es"),
    created: false,
    prospect: { id: "recovered-1", phone: "+17865550106" },
    workflowState: { pendingUnsupportedMetaRecovery: true }
  });
  assert.equal(resolved.iulReviewEligible, true);
});

test("Q) IUL intake never marks recruitingEligible and keeps CAMPAIGN_INTAKE_IUL source", async () => {
  const service = buildService();
  const resolved = await service.resolveInboundCampaignIntakeMatch({
    organizationId: TEAM_VISION_ORG,
    whatsappPhoneNumberId: TV_PHONE_ID,
    messageBody: buildPrefilledMessage(IUL_CODE, "es"),
    created: true
  });
  assert.equal(resolved.recruitingEligible, false);
  assert.equal(VERIFIED_ATLAS_ELIGIBILITY_SOURCES.CAMPAIGN_INTAKE_IUL, "CAMPAIGN_INTAKE_IUL");
  const eligibility = evaluateAtlasInboundAutomationEligibility({
    prospect: { phone: "+17865550107", organization_id: TEAM_VISION_ORG },
    inbound: { campaignIntakeMatch: resolved }
  });
  assert.equal(eligibility.reason, "CAMPAIGN_INTAKE_IUL");
});
