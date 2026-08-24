/**
 * IUL Policy Review V1 — comprehensive regression suite.
 */

"use strict";

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  interpretInboundMessage,
  decideConversationTurn,
  createConversationContext,
  buildResponsePlan,
  renderCustomerReply,
  INTENTS
} = require("../core/recruitAiV2");
const {
  CAMPAIGN_KIND,
  CONVERSATION_GOAL,
  ASK,
  isIulReviewAdContext,
  nextDiscoveryAsk,
  isDiscoveryComplete
} = require("../core/recruitAiV2/iulAdConversation");
const {
  classifyPolicyType,
  classifyCarrier,
  classifyPolicyAgeRange,
  classifyReviewReason,
  classifyDocumentsAvailable,
  looksLikePolicyIsBadQuestion
} = require("../core/recruitAiV2/iulDiscoveryFacts");
const { classifyOriginalPolicyPurpose } = require("../core/recruitAiV2/originalPolicyPurpose");
const {
  evaluateAtlasInboundAutomationEligibility
} = require("../core/atlasInboundAutomationEligibility");
const {
  createMemoryCampaignIntakeCodeRepository,
  INTAKE_CODE_STATUS
} = require("../core/campaignIntakeCode/campaignIntakeCodeRepository");
const {
  createCampaignIntakeAttributionService
} = require("../core/campaignIntakeCode/campaignIntakeAttributionService");
const {
  buildWhatsAppWindowFields,
  classifyIulFollowUpStatus,
  buildIulFilterCounts,
  rowsToCsv,
  IUL_FOLLOW_UP_FILTERS
} = require("../core/iulFollowUpWorklistEngine");
const { IUL_STAGES } = require("../core/iulWorkflowConstants");
const { buildAuthorizedCsv } = require("../core/iulFollowUpWorklistReadModel");
const { MILESTONES } = require("../core/workflowConstants");

const STATE_FILE = path.join(__dirname, "../data/workflowState.json");
const TEAM_VISION_ORG = "00000000-0000-4000-8000-000000000001";
const TV_PHONE_ID = "1213865645144311";

function iulContext(overrides = {}) {
  return createConversationContext({
    preferredLanguage: "spanish",
    conversationGoal: CONVERSATION_GOAL,
    campaignKind: CAMPAIGN_KIND,
    ctwaReferral: {
      sourceType: "ad",
      headline: "Revisa tu póliza IUL",
      body: "Entiende cómo está tu IUL"
    },
    ...overrides
  });
}

function renderTurn(message, context) {
  const interpretation = interpretInboundMessage({ message: { text: message }, context });
  const decision = decideConversationTurn({ context, interpretation });
  const plan = buildResponsePlan(decision);
  const rendered = renderCustomerReply(plan);
  return { interpretation, decision, plan, rendered };
}

function fullDiscoveryFacts(overrides = {}) {
  return {
    policyType: "IUL",
    carrierResolved: true,
    carrier: "Primerica",
    originalPurposeAsked: true,
    originalPolicyPurpose: "FAMILY_PROTECTION",
    policyAgeRange: "ONE_TO_THREE_YEARS",
    reviewReason: "CASH_VALUE",
    documentsAvailable: "YES",
    reviewMeetingType: "ZOOM",
    ...overrides
  };
}

async function withTempWorkflowState(run) {
  const previous = fs.existsSync(STATE_FILE) ? fs.readFileSync(STATE_FILE, "utf8") : null;
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, "{}");
  try {
    return await run();
  } finally {
    if (previous == null) {
      try {
        fs.unlinkSync(STATE_FILE);
      } catch {
        /* ignore */
      }
    } else {
      fs.writeFileSync(STATE_FILE, previous);
    }
  }
}

test("ROUTING 1-2: IUL intake code routes to policy_review and not Recruit AI", async () => {
  const service = createCampaignIntakeAttributionService({
    repository: createMemoryCampaignIntakeCodeRepository({
      codes: {
        "TVI-0822-IUL1": {
          id: "code-iul",
          organization_id: TEAM_VISION_ORG,
          owner_user_id: "owner-1",
          whatsapp_phone_number_id: TV_PHONE_ID,
          code: "TVI-0822-IUL1",
          campaign_name: "TV-IUL-REVIEW",
          purpose: "IUL",
          language: "es",
          status: INTAKE_CODE_STATUS.ACTIVE
        }
      }
    })
  });
  const match = await service.lookupInboundMatch({
    organizationId: TEAM_VISION_ORG,
    whatsappPhoneNumberId: TV_PHONE_ID,
    messageBody: "Hola TVI-0822-IUL1"
  });
  assert.equal(match.matched, true);
  assert.equal(match.purpose, "IUL");
  const resolved = await service.resolveInboundCampaignIntakeMatch({
    organizationId: TEAM_VISION_ORG,
    whatsappPhoneNumberId: TV_PHONE_ID,
    messageBody: "Hola TVI-0822-IUL1",
    created: true
  });
  assert.equal(resolved.recruitingEligible, false);
  const eligibility = evaluateAtlasInboundAutomationEligibility({
    prospect: { phone: "+17865550001", organization_id: TEAM_VISION_ORG },
    campaignIntakeMatch: resolved,
    created: true
  });
  assert.equal(eligibility.eligible, false);
});

test("ROUTING 3: recruiting code still enters recruiting", async () => {
  const service = createCampaignIntakeAttributionService({
    repository: createMemoryCampaignIntakeCodeRepository({
      codes: {
        "TVR-0822-A7K4": {
          id: "code-rec",
          organization_id: TEAM_VISION_ORG,
          owner_user_id: "owner-1",
          whatsapp_phone_number_id: TV_PHONE_ID,
          code: "TVR-0822-A7K4",
          campaign_name: "TV-RECRUIT",
          purpose: "RECRUITING",
          language: "es",
          status: INTAKE_CODE_STATUS.ACTIVE
        }
      }
    })
  });
  const resolved = await service.resolveInboundCampaignIntakeMatch({
    organizationId: TEAM_VISION_ORG,
    whatsappPhoneNumberId: TV_PHONE_ID,
    messageBody: "Hola TVR-0822-A7K4",
    created: true
  });
  assert.equal(resolved.recruitingEligible, true);
});

test("ROUTING 4: invalid intake stays fail-closed", () => {
  const eligibility = evaluateAtlasInboundAutomationEligibility({
    prospect: { phone: "+17865550002", organization_id: TEAM_VISION_ORG },
    campaignIntakeMatch: { matched: false, reason: "NO_TOKEN" },
    created: true
  });
  assert.equal(eligibility.eligible, false);
});

test("DISCOVERY 5-10: policy type, carrier, purpose C, age, reason, documents", () => {
  assert.equal(classifyPolicyType("tengo una IUL").value, "IUL");
  const carrier = classifyCarrier("no sé");
  assert.equal(carrier.carrier, null);
  assert.equal(carrier.resolved, true);
  assert.equal(
    classifyOriginalPolicyPurpose("para proteger a mi familia").category,
    "FAMILY_PROTECTION"
  );
  assert.equal(classifyPolicyAgeRange("hace 2 años").value, "ONE_TO_THREE_YEARS");
  assert.equal(classifyReviewReason("los costos de la prima").value, "PREMIUM_COST");
  assert.equal(classifyDocumentsAvailable("sí, la tengo").value, "YES");
});

test("DISCOVERY 11: discovery completes in order A→G", () => {
  let facts = {};
  assert.equal(nextDiscoveryAsk(facts), ASK.POLICY_TYPE);
  facts = { policyType: "IUL" };
  assert.equal(nextDiscoveryAsk(facts), ASK.CARRIER);
  facts = { ...facts, carrierResolved: true };
  assert.equal(nextDiscoveryAsk(facts), ASK.ORIGINAL_PURPOSE);
  facts = { ...facts, originalPurposeAsked: true, originalPolicyPurpose: "RETIREMENT" };
  assert.equal(nextDiscoveryAsk(facts), ASK.POLICY_AGE);
  facts = { ...facts, policyAgeRange: "FIVE_PLUS_YEARS" };
  assert.equal(nextDiscoveryAsk(facts), ASK.REVIEW_REASON);
  facts = { ...facts, reviewReason: "PERFORMANCE" };
  assert.equal(nextDiscoveryAsk(facts), ASK.DOCUMENTS);
  facts = { ...facts, documentsAvailable: "NO" };
  assert.equal(nextDiscoveryAsk(facts), ASK.SCHEDULING_DAY_PART);
  assert.equal(isDiscoveryComplete(facts), true);
});

test("SCHEDULING 12-14: enough facts transitions to Zoom scheduling ask", () => {
  const ctx = iulContext({
    knownFacts: fullDiscoveryFacts(),
    conversation: { lastQuestionAsked: ASK.DOCUMENTS }
  });
  const { rendered, decision } = renderTurn("no", ctx);
  assert.match(rendered.text, /Zoom/i);
  assert.match(rendered.text, /mañana|tarde/i);
  assert.equal(
    decision.contextPatch.knownFacts.reviewMeetingType || decision.contextPatch.knownFacts.reviewMeetingType,
    "ZOOM"
  );
  assert.equal(decision.contextPatch.conversation.lastQuestionAsked, ASK.SCHEDULING_DAY_PART);
});

test("SAFETY 21-22: bad policy question stays safe", () => {
  assert.equal(looksLikePolicyIsBadQuestion("¿Mi póliza es mala?"), true);
  const { rendered } = renderTurn("¿Mi póliza es mala?", iulContext());
  assert.match(rendered.text, /no se puede determinar correctamente/i);
  assert.doesNotMatch(rendered.text, /cancel/i);
  assert.doesNotMatch(rendered.text, /reemplaz/i);
});

test("FOLLOW-UP 23-30: classification + WhatsApp window", () => {
  const now = Date.parse("2026-08-23T15:00:00.000Z");
  const todayStart = Date.parse("2026-08-23T00:00:00.000Z");
  assert.equal(
    classifyIulFollowUpStatus({
      nextFollowUpAtMs: todayStart + 3600000,
      todayWindow: { startMs: todayStart, endMs: todayStart + 86400000 - 1 }
    }),
    IUL_FOLLOW_UP_FILTERS.DUE_TODAY
  );
  assert.equal(
    classifyIulFollowUpStatus({
      nextFollowUpAtMs: todayStart - 3600000,
      todayWindow: { startMs: todayStart, endMs: todayStart + 86400000 - 1 }
    }),
    IUL_FOLLOW_UP_FILTERS.OVERDUE
  );
  assert.equal(
    classifyIulFollowUpStatus({ nextFollowUpAtMs: null }),
    IUL_FOLLOW_UP_FILTERS.NO_FOLLOW_UP_SET
  );
  assert.equal(
    classifyIulFollowUpStatus({
      iulWorkflowStage: IUL_STAGES.REVIEW_SCHEDULED,
      appointmentAtMs: todayStart + 7200000
    }),
    IUL_FOLLOW_UP_FILTERS.REVIEW_SCHEDULED
  );
  const open = buildWhatsAppWindowFields({
    latestInboundAt: new Date(now - 3600000).toISOString(),
    now
  });
  assert.equal(open.whatsappWindowStatus, "OPEN");
  assert.equal(open.recommendedFollowUpChannel, "WHATSAPP_FREEFORM");
  const closed = buildWhatsAppWindowFields({
    latestInboundAt: new Date(now - 30 * 3600000).toISOString(),
    now
  });
  assert.equal(closed.whatsappWindowStatus, "CLOSED");
  assert.equal(closed.recommendedFollowUpChannel, "PHONE_CALL");
});

test("EXPORT 31-33: CSV matches filtered dataset with tenant id", () => {
  const payload = {
    items: [
      {
        name: "Ana",
        phone: "+17865550003",
        followUpStatus: IUL_FOLLOW_UP_FILTERS.DUE_TODAY,
        ownerName: "Owner",
        campaign: "TV-IUL",
        iulStage: IUL_STAGES.REVIEW_READY,
        originalPolicyPurpose: "RETIREMENT",
        reviewReason: "CASH_VALUE",
        nextFollowUpAt: "2026-08-23T16:00:00.000Z",
        appointmentAt: null,
        whatsappWindowStatus: "OPEN",
        recommendedFollowUpChannel: "WHATSAPP_FREEFORM"
      }
    ]
  };
  const csv = buildAuthorizedCsv(payload, { organizationId: TEAM_VISION_ORG });
  assert.match(csv, new RegExp(TEAM_VISION_ORG));
  assert.match(csv, /Ana/);
  assert.match(csv, /DUE_TODAY/);
  const counts = buildIulFilterCounts(payload.items);
  assert.equal(counts.all, 1);
});

test("IUL intake attribution persists policy_review workflow state", async () => {
  await withTempWorkflowState(async () => {
    const service = createCampaignIntakeAttributionService({
      repository: createMemoryCampaignIntakeCodeRepository({
        codes: {
          "TVI-0822-IUL1": {
            id: "code-iul",
            organization_id: TEAM_VISION_ORG,
            owner_user_id: "owner-1",
            whatsapp_phone_number_id: TV_PHONE_ID,
            code: "TVI-0822-IUL1",
            campaign_name: "TV-IUL-REVIEW",
            purpose: "IUL",
            language: "es",
            status: INTAKE_CODE_STATUS.ACTIVE
          }
        }
      })
    });
    const match = await service.lookupInboundMatch({
      organizationId: TEAM_VISION_ORG,
      whatsappPhoneNumberId: TV_PHONE_ID,
      messageBody: "Hola TVI-0822-IUL1"
    });
    const result = await service.establishInboundAttribution({
      match,
      prospect: {
        id: "p-iul",
        phone: "+17865550999",
        organization_id: TEAM_VISION_ORG
      },
      created: true,
      organizationId: TEAM_VISION_ORG
    });
    assert.equal(result.iulReviewEligible, true);
    assert.equal(result.recruitingEligible, false);
  });
});

test("recruiting greeting unchanged without IUL context", () => {
  const { interpretation, rendered } = renderTurn(
    "Hola",
    createConversationContext({ preferredLanguage: "spanish" })
  );
  assert.equal(interpretation.intent, INTENTS.GREETING);
  assert.match(rendered.text, /ciudad/i);
  assert.equal(isIulReviewAdContext(createConversationContext()), false);
});

test("IUL opener asks policy type, not recruiting location", () => {
  const { rendered, decision } = renderTurn("Hola", iulContext());
  assert.match(rendered.text, /IUL/i);
  assert.doesNotMatch(rendered.text, /ciudad/i);
  assert.equal(decision.contextPatch.conversation.lastQuestionAsked, ASK.POLICY_TYPE);
});
