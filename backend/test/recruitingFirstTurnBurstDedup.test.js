/**
 * Recruiting campaign-intake first-turn burst aggregation + dedup.
 */

"use strict";

process.env.RECRUITING_FIRST_TURN_BURST_WAIT_MS = "50";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

require("dotenv").config({ quiet: true });

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  RECRUITING_FIRST_TURN_BURST_WAIT_MS,
  isRecruitingCampaignIntakeFirstTurnBurst,
  looksLikeRecruitingFirstTurnSupplement,
  shouldSkipDuplicateRecruitingFirstTurnReply
} = require("../core/recruitingFirstTurnBurst");
const {
  scheduleInboundBurstAggregation,
  resetInboundBurstAggregationForTests,
  mergeBurstInbound
} = require("../core/whatsappInboundBurstAggregator");
const { processInboundWhatsAppMessage } = require("../core/whatsappInboundPipeline");
const {
  createMemoryWhatsAppInboundClaimStore
} = require("../core/whatsappInboundClaim");
const {
  interpretInboundMessage,
  createConversationContext,
  INTENTS
} = require("../core/recruitAiV2");

const ORG_A = "00000000-0000-4000-8000-000000000001";
const ORG_B = "00000000-0000-4000-8000-000000000002";
const PHONE_ID = "1347188398469744";
const BURST_WAIT_MS = Number(process.env.RECRUITING_FIRST_TURN_BURST_WAIT_MS);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const RECRUITING_MATCH = {
  matched: true,
  purpose: "RECRUITING",
  recruitingEligible: true,
  code: "TVR-0826-A7K4",
  campaignId: "camp-recruit-1",
  campaignName: "Team Vision Recruiting"
};

const IUL_MATCH = {
  matched: true,
  purpose: "IUL",
  status: "ACTIVE",
  recruitingEligible: false,
  iulReviewEligible: true,
  code: "TVI-0824-VNC8",
  campaignId: "camp-iul-1"
};

function recruitingIntakeBody(code = RECRUITING_MATCH.code) {
  return `¡Hola! Quiero más información. ${code}`;
}

function createPipelineHarness({
  phone = "+17867728901",
  organizationId = ORG_A,
  campaignIntakeMatch = RECRUITING_MATCH,
  hasDeliveredOutbound = false
} = {}) {
  const claimStore = createMemoryWhatsAppInboundClaimStore();
  const counts = { log: 0, hub: 0 };
  const hubBodies = [];
  const logBodies = [];
  let deliveredOutbound = hasDeliveredOutbound;

  const deps = {
    resolveWhatsAppInboundOrganizationId: async () => ({
      organizationId,
      source: "explicit"
    }),
    claimWhatsAppInboundCorrelation: (input) => claimStore.claim(input),
    campaignIntakeAttributionService: {
      lookupInboundMatch: async ({ messageBody }) =>
        String(messageBody || "").includes(RECRUITING_MATCH.code) ||
        String(messageBody || "").includes(IUL_MATCH.code)
          ? campaignIntakeMatch
          : null,
      establishInboundAttribution: async () => ({ success: true })
    },
    locateOrCreateWhatsAppProspect: async ({ firstMessage }) => {
      const match =
        String(firstMessage || "").includes(RECRUITING_MATCH.code) ||
        String(firstMessage || "").includes(IUL_MATCH.code)
          ? campaignIntakeMatch
          : null;
      return {
        prospect: {
          id: "prospect-1",
          phone,
          name: "Tania",
          current_step: "NEW",
          organization_id: organizationId,
          city: null,
          state: null
        },
        created: !deliveredOutbound,
        storagePhone: phone,
        organizationId,
        campaignIntakeMatch: match
      };
    },
    logConversation: async ({ message }) => {
      counts.log += 1;
      logBodies.push(message);
      return { success: true, log: { id: `log-${counts.log}` } };
    },
    processConversationAfterInbound: async ({ inbound }) => {
      counts.hub += 1;
      hubBodies.push(inbound?.body || inbound?.text || "");
      deliveredOutbound = true;
      return {
        success: true,
        replied: true,
        delivery: { success: true },
        reason: "TEST_AUTHORED_DELIVERED"
      };
    },
    prospectHasDeliveredAutomatedOutbound: async () => deliveredOutbound,
    prospectHasAutomatedOutboundReply: async () => deliveredOutbound,
    disableFirstReplyRecovery: true
  };

  return { deps, counts, hubBodies, logBodies, claimStore, getDeliveredOutbound: () => deliveredOutbound };
}

test("recruiting first-turn burst eligibility requires fresh recruiting intake", () => {
  assert.equal(
    isRecruitingCampaignIntakeFirstTurnBurst({
      campaignIntakeMatch: RECRUITING_MATCH,
      hasDeliveredAutomatedOutbound: false
    }),
    true
  );
  assert.equal(
    isRecruitingCampaignIntakeFirstTurnBurst({
      campaignIntakeMatch: RECRUITING_MATCH,
      hasDeliveredAutomatedOutbound: true
    }),
    false
  );
  assert.equal(
    isRecruitingCampaignIntakeFirstTurnBurst({
      campaignIntakeMatch: IUL_MATCH,
      hasDeliveredAutomatedOutbound: false
    }),
    false
  );
});

test("looksLikeRecruitingFirstTurnSupplement detects Hola busco trabajo", () => {
  assert.equal(looksLikeRecruitingFirstTurnSupplement("Hola busco trabajo"), true);
  assert.equal(looksLikeRecruitingFirstTurnSupplement("Miami FL"), false);
});

test("mergeBurstInbound preserves campaignIntakeMatch from earlier fragment", () => {
  const merged = mergeBurstInbound(
    [
      {
        text: recruitingIntakeBody(),
        inbound: {
          providerMessageId: "wamid.1",
          campaignIntakeMatch: RECRUITING_MATCH
        }
      },
      {
        text: "Hola busco trabajo",
        inbound: { providerMessageId: "wamid.2" }
      }
    ],
    { providerMessageId: "wamid.2" }
  );
  assert.equal(merged.campaignIntakeMatch?.code, RECRUITING_MATCH.code);
  assert.equal(merged.providerMessageId, "wamid.2");
});

test("1. intake code + Hola busco trabajo within burst window → one hub call", async () => {
  resetInboundBurstAggregationForTests();
  const phone = "+17867728901";
  const { deps, counts, hubBodies } = createPipelineHarness({ phone });

  const msg1Promise = processInboundWhatsAppMessage(
    {
      providerMessageId: "wamid.TANIA1",
      phone,
      body: recruitingIntakeBody(),
      phoneNumberId: PHONE_ID
    },
    deps
  );

  await sleep(20);

  const msg2Promise = processInboundWhatsAppMessage(
    {
      providerMessageId: "wamid.TANIA2",
      phone,
      body: "Hola busco trabajo",
      phoneNumberId: PHONE_ID
    },
    deps
  );

  await sleep(BURST_WAIT_MS + 20);

  const [r1, r2] = await Promise.all([msg1Promise, msg2Promise]);

  assert.equal(r1.reason, "BURST_AGGREGATED_DEFERRED");
  assert.equal(r2.skipped, false);
  assert.equal(counts.hub, 1);
  assert.match(hubBodies[0], /busco trabajo/i);
  assert.match(hubBodies[0], /informaci/i);

  resetInboundBurstAggregationForTests();
});

test("2. combined burst text interprets as job opportunity not location", () => {
  const combined =
    "¡Hola! Quiero más información. Hola busco trabajo";
  const interpretation = interpretInboundMessage({
    message: { text: combined },
    context: createConversationContext({ preferredLanguage: "spanish" })
  });
  assert.equal(interpretation.intent, INTENTS.JOB_OPPORTUNITY_QUESTION);
});

test("3. both inbound messages remain in transcript logs", async () => {
  resetInboundBurstAggregationForTests();
  const phone = "+17867728902";
  const { deps, logBodies } = createPipelineHarness({ phone });
  const p1 = processInboundWhatsAppMessage(
    {
      providerMessageId: "wamid.LOG1",
      phone,
      body: recruitingIntakeBody(),
      phoneNumberId: PHONE_ID
    },
    deps
  );
  await sleep(15);
  const p2 = processInboundWhatsAppMessage(
    {
      providerMessageId: "wamid.LOG2",
      phone,
      body: "Hola busco trabajo",
      phoneNumberId: PHONE_ID
    },
    deps
  );
  await sleep(BURST_WAIT_MS + 20);
  await Promise.all([p1, p2]);

  assert.equal(logBodies.length, 2);
  assert.match(logBodies[0], /TVR-0826-A7K4/);
  assert.equal(logBodies[1], "Hola busco trabajo");

  resetInboundBurstAggregationForTests();
});

test("4. campaign attribution preserved on merged inbound", async () => {
  resetInboundBurstAggregationForTests();
  const phone = "+17867728903";
  let attributedCode = null;
  const { deps } = createPipelineHarness({ phone });
  deps.processConversationAfterInbound = async ({ inbound }) => {
    attributedCode = inbound?.campaignIntakeMatch?.code || null;
    return { success: true, replied: true, delivery: { success: true } };
  };

  const p1 = processInboundWhatsAppMessage(
    {
      providerMessageId: "wamid.ATTR1",
      phone,
      body: recruitingIntakeBody(),
      phoneNumberId: PHONE_ID
    },
    deps
  );
  await sleep(20);
  await processInboundWhatsAppMessage(
    {
      providerMessageId: "wamid.ATTR2",
      phone,
      body: "Hola busco trabajo",
      phoneNumberId: PHONE_ID
    },
    deps
  );
  await sleep(BURST_WAIT_MS + 20);
  await p1;

  assert.equal(attributedCode, RECRUITING_MATCH.code);

  resetInboundBurstAggregationForTests();
});

test("5. single intake message replies after bounded wait", async () => {
  resetInboundBurstAggregationForTests();
  const phone = "+17867728904";
  const { deps, counts } = createPipelineHarness({ phone });
  const resultPromise = processInboundWhatsAppMessage(
    {
      providerMessageId: "wamid.SOLO",
      phone,
      body: recruitingIntakeBody(),
      phoneNumberId: PHONE_ID
    },
    deps
  );

  await sleep(BURST_WAIT_MS - 5);
  assert.equal(counts.hub, 0);

  await sleep(10);
  const result = await resultPromise;

  assert.equal(result.skipped, false);
  assert.equal(counts.hub, 1);

  resetInboundBurstAggregationForTests();
});

test("6. second message outside burst window processes as separate turn", async () => {
  resetInboundBurstAggregationForTests();
  const phone = "+17867728905";
  const { deps, counts } = createPipelineHarness({ phone });
  const p1 = processInboundWhatsAppMessage(
    {
      providerMessageId: "wamid.OUT1",
      phone,
      body: recruitingIntakeBody(),
      phoneNumberId: PHONE_ID
    },
    deps
  );
  await sleep(BURST_WAIT_MS + 30);
  await p1;

  const p2 = processInboundWhatsAppMessage(
    {
      providerMessageId: "wamid.OUT2",
      phone,
      body: "Hola busco trabajo",
      phoneNumberId: PHONE_ID
    },
    deps
  );
  await sleep(600);
  await p2;

  assert.equal(counts.hub, 2);

  resetInboundBurstAggregationForTests();
});

test("7. duplicate webhook retry does not duplicate hub", async () => {
  resetInboundBurstAggregationForTests();
  const phone = "+17867728906";
  const { deps, counts } = createPipelineHarness({ phone });
  const msg = {
    providerMessageId: "wamid.DUP",
    phone,
    body: recruitingIntakeBody(),
    phoneNumberId: PHONE_ID
  };

  const p1 = processInboundWhatsAppMessage(msg, deps);
  await sleep(BURST_WAIT_MS + 20);
  await p1;

  const replay = await processInboundWhatsAppMessage(msg, deps);
  assert.equal(replay.reason, "DUPLICATE_PROVIDER_MESSAGE");
  assert.equal(counts.hub, 1);

  resetInboundBurstAggregationForTests();
});

test("8. dedup skip leaves failed first reply retryable via recovery path", async () => {
  const skip = shouldSkipDuplicateRecruitingFirstTurnReply({
    campaignIntakeMatch: RECRUITING_MATCH,
    hasDeliveredAutomatedOutbound: false,
    workflowState: { canonicalMilestone: "NEW_LEAD" },
    semanticBody: "Hola busco trabajo"
  });
  assert.equal(skip, false);
});

test("9. IUL intake does not use recruiting first-turn burst window", async () => {
  resetInboundBurstAggregationForTests();

  assert.equal(
    isRecruitingCampaignIntakeFirstTurnBurst({
      campaignIntakeMatch: IUL_MATCH,
      hasDeliveredAutomatedOutbound: false
    }),
    false
  );

  const { evaluateAtlasInboundAutomationEligibility } = require("../core/atlasInboundAutomationEligibility");
  const eligibility = evaluateAtlasInboundAutomationEligibility({
    prospect: { phone: "+17867728907", organization_id: ORG_A, current_step: "NEW" },
    inbound: { campaignIntakeMatch: IUL_MATCH }
  });
  assert.equal(eligibility.eligible, true);
  assert.equal(eligibility.reason, "CAMPAIGN_INTAKE_IUL");

  const p = scheduleInboundBurstAggregation({
    phone: "+17867728907",
    text: `Quiero info ${IUL_MATCH.code}`,
    inbound: { providerMessageId: "wamid.IUL", campaignIntakeMatch: IUL_MATCH },
    recruitingFirstTurnBurst: false
  });
  await sleep(600);
  const result = await p;
  assert.equal(result.burst, false);

  resetInboundBurstAggregationForTests();
});

test("10. tenant isolation unchanged — org-scoped harness only touches own org", async () => {
  resetInboundBurstAggregationForTests();

  const orgA = createPipelineHarness({ phone: "+17867728908", organizationId: ORG_A });
  const orgB = createPipelineHarness({
    phone: "+17867728909",
    organizationId: ORG_B,
    campaignIntakeMatch: null
  });

  const pA = processInboundWhatsAppMessage(
    {
      providerMessageId: "wamid.ORGA",
      phone: "+17867728908",
      body: recruitingIntakeBody(),
      phoneNumberId: PHONE_ID
    },
    orgA.deps
  );
  await sleep(BURST_WAIT_MS + 20);
  await pA;

  await processInboundWhatsAppMessage(
    {
      providerMessageId: "wamid.ORGB",
      phone: "+17867728909",
      body: "Hola",
      phoneNumberId: PHONE_ID
    },
    orgB.deps
  );
  await sleep(600);

  assert.equal(orgA.counts.hub, 1);
  assert.equal(orgB.counts.hub, 1);

  resetInboundBurstAggregationForTests();
});

test("late supplement skipped when first reply already delivered", () => {
  const skip = shouldSkipDuplicateRecruitingFirstTurnReply({
    campaignIntakeMatch: RECRUITING_MATCH,
    hasDeliveredAutomatedOutbound: true,
    workflowState: {
      canonicalMilestone: "GREETING_SENT",
      conversation: { lastQuestionAsked: "ask_location" }
    },
    semanticBody: "Hola busco trabajo"
  });
  assert.equal(skip, true);
});

test("PR246 safety 1: Miami after opener is not dedup-skipped", () => {
  assert.equal(
    shouldSkipDuplicateRecruitingFirstTurnReply({
      campaignIntakeMatch: RECRUITING_MATCH,
      hasDeliveredAutomatedOutbound: true,
      workflowState: {
        canonicalMilestone: "GREETING_SENT",
        conversation: { lastQuestionAsked: "ask_location" }
      },
      semanticBody: "Miami"
    }),
    false
  );
});

test("PR246 safety 2: Pompano after opener is not dedup-skipped", () => {
  assert.equal(
    shouldSkipDuplicateRecruitingFirstTurnReply({
      campaignIntakeMatch: RECRUITING_MATCH,
      hasDeliveredAutomatedOutbound: true,
      workflowState: {
        canonicalMilestone: "GREETING_SENT",
        conversation: { lastQuestionAsked: "ask_location" }
      },
      semanticBody: "Pompano"
    }),
    false
  );
});

test("PR246 safety: outbound alone does not trigger dedup skip", () => {
  assert.equal(
    shouldSkipDuplicateRecruitingFirstTurnReply({
      campaignIntakeMatch: RECRUITING_MATCH,
      hasDeliveredAutomatedOutbound: true,
      workflowState: {
        canonicalMilestone: "GREETING_SENT",
        conversation: { lastQuestionAsked: "ask_location" }
      },
      semanticBody: "Ok"
    }),
    false
  );
});

test("PR246 safety: dedup requires first-turn supplement semantics", () => {
  const base = {
    campaignIntakeMatch: RECRUITING_MATCH,
    hasDeliveredAutomatedOutbound: true,
    workflowState: {
      canonicalMilestone: "GREETING_SENT",
      conversation: { lastQuestionAsked: "ask_location" }
    }
  };
  assert.equal(
    shouldSkipDuplicateRecruitingFirstTurnReply({
      ...base,
      semanticBody: "Hola busco trabajo"
    }),
    true
  );
  assert.equal(
    shouldSkipDuplicateRecruitingFirstTurnReply({
      ...base,
      semanticBody: "Miami FL"
    }),
    false
  );
  assert.equal(
    shouldSkipDuplicateRecruitingFirstTurnReply({
      ...base,
      hasDeliveredAutomatedOutbound: false,
      semanticBody: "Hola busco trabajo"
    }),
    false
  );
});

test("PR246 safety: no dedup when workflow moved past initial location ask", () => {
  assert.equal(
    shouldSkipDuplicateRecruitingFirstTurnReply({
      campaignIntakeMatch: RECRUITING_MATCH,
      hasDeliveredAutomatedOutbound: true,
      workflowState: {
        canonicalMilestone: "QUALIFYING",
        conversation: { lastQuestionAsked: "ask_day_part" }
      },
      semanticBody: "Hola busco trabajo"
    }),
    false
  );
});

test("aggregator: recruiting burst deadline does not extend on second fragment", async () => {
  resetInboundBurstAggregationForTests();

  const phone = "+15550009999";
  const startedAt = Date.now();
  const p1 = scheduleInboundBurstAggregation({
    phone,
    text: recruitingIntakeBody(),
    inbound: {
      providerMessageId: "wamid.frag1",
      campaignIntakeMatch: RECRUITING_MATCH
    },
    recruitingFirstTurnBurst: true
  });
  await sleep(35);
  const p2 = scheduleInboundBurstAggregation({
    phone,
    text: "Hola busco trabajo",
    inbound: { providerMessageId: "wamid.frag2" }
  });
  const [r1, r2] = await Promise.all([p1, p2]);
  const elapsed = Date.now() - startedAt;

  assert.equal(r1.burst, true);
  assert.equal(r2.burst, true);
  assert.match(r2.combinedText, /busco trabajo/i);
  assert.equal(r2.inbound.campaignIntakeMatch?.code, RECRUITING_MATCH.code);
  assert.ok(elapsed >= BURST_WAIT_MS - 5);
  assert.ok(elapsed <= BURST_WAIT_MS + 40);

  resetInboundBurstAggregationForTests();
});
