/**
 * Recruit AI v2 Phase 3 — production shadow evaluation.
 * Flags default off. No live WhatsApp. No CE cutover. No appointment writes.
 */

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveShadowConfig,
  isEligibleForShadowEvaluation,
  createMemoryShadowEvaluationRepository,
  createMemoryContextRepository,
  createContextPersistenceService,
  createShadowEvaluationService,
  scheduleRecruitAiV2ShadowEvaluation,
  runRecruitAiV2ShadowEvaluation,
  classifyDivergence,
  extractLiveCeResponseIntent,
  authorizeSideEffects,
  processRecruitAiV2Turn,
  loadContextFromReplayFixture,
  containsInternalDiagnostics,
  DIVERGENCE,
  INTENTS
} = require("../core/recruitAiV2");
const {
  resetShadowEvaluationServiceCache
} = require("../core/recruitAiV2/shadowModeRunner");

const FIXTURE_PATH = path.join(
  __dirname,
  "fixtures/recruitAiV2/tv000028-scheduling-replay.json"
);
const PIPELINE_PATH = path.join(
  __dirname,
  "../core/whatsappInboundPipeline.js"
);
const HUB_PATH = path.join(__dirname, "../core/communicationHub.js");
const CE_PATH = path.join(__dirname, "../core/semanticConversationEngine.js");

const ORG = "00000000-0000-4000-8000-000000000001";
const PROSPECT = "29853100-f151-4ca8-b07d-624fd20c6685";

function loadFixture() {
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));
}

function makeProspect(overrides = {}) {
  return {
    id: PROSPECT,
    organization_id: ORG,
    name: "Fixture Prospect",
    preferred_language: "english",
    city: "Miami",
    state: "FL",
    current_step: "NEW",
    ...overrides
  };
}

function makeShadowService() {
  const shadowRepo = createMemoryShadowEvaluationRepository();
  const contextRepo = createMemoryContextRepository();
  const persistenceService = createContextPersistenceService({
    repository: contextRepo
  });
  const service = createShadowEvaluationService({
    repository: shadowRepo,
    persistenceService
  });
  return { service, shadowRepo, contextRepo, persistenceService };
}

test("1. shadow config defaults to disabled with empty allowlist and zero sample rate", () => {
  const config = resolveShadowConfig({});
  assert.equal(config.enabled, false);
  assert.deepEqual(config.organizationIds, []);
  assert.equal(config.sampleRate, 0);

  const eligibility = isEligibleForShadowEvaluation({
    organizationId: ORG,
    prospectId: PROSPECT,
    inboundMessageId: "wamid.default",
    env: {}
  });
  assert.equal(eligibility.eligible, false);
  assert.equal(eligibility.reason, "SHADOW_DISABLED");
});

test("2. enabled with sampleRate 0 still skips", () => {
  const eligibility = isEligibleForShadowEvaluation({
    organizationId: ORG,
    prospectId: PROSPECT,
    inboundMessageId: "wamid.zero",
    env: {
      RECRUIT_AI_V2_SHADOW_ENABLED: "true",
      RECRUIT_AI_V2_SHADOW_SAMPLE_RATE: "0"
    }
  });
  assert.equal(eligibility.eligible, false);
  assert.equal(eligibility.reason, "SAMPLE_RATE_MISS");
});

test("3. organization allowlist denies non-listed orgs", () => {
  const eligibility = isEligibleForShadowEvaluation({
    organizationId: "11111111-1111-4111-8111-111111111111",
    prospectId: PROSPECT,
    inboundMessageId: "wamid.org",
    env: {
      RECRUIT_AI_V2_SHADOW_ENABLED: "true",
      RECRUIT_AI_V2_SHADOW_ORGANIZATION_IDS: ORG,
      RECRUIT_AI_V2_SHADOW_SAMPLE_RATE: "1"
    }
  });
  assert.equal(eligibility.eligible, false);
  assert.equal(eligibility.reason, "ORG_NOT_ALLOWLISTED");
});

test("4. eligible org + sampleRate 1 runs and persists sanitized shadow row", async () => {
  const { service, shadowRepo, contextRepo } = makeShadowService();
  const result = await service.evaluateShadowTurn({
    prospect: makeProspect(),
    organizationId: ORG,
    inboundMessageId: "wamid.shadow-1",
    messageText: "I prefer at 6",
    conversation: {
      success: true,
      replied: true,
      reason: null,
      engineResult: { reply: "Here are times", outboundIntent: "CONVERSATION_ENGINE_REPLY" }
    }
  });

  assert.equal(result.skipped, false);
  assert.ok(result.row?.id);
  assert.equal(result.row.organization_id, ORG);
  assert.equal(result.row.prospect_id, PROSPECT);
  assert.equal(result.row.inbound_message_id, "wamid.shadow-1");
  assert.equal(result.row.live_ce_response_intent, "CONVERSATION_ENGINE_REPLY");
  assert.equal(result.row.v2_interpreted_intent, INTENTS.SCHEDULING_COUNTEROFFER);
  assert.ok(result.row.v2_decision_code);
  assert.equal(result.row.diagnostic_leak_check, true);
  assert.equal(result.authorizationDenied, true);
  assert.equal(shadowRepo._all().length, 1);
  assert.ok(contextRepo._all().length >= 1);

  const metadata = JSON.stringify(result.row.metadata || {});
  assert.doesNotMatch(metadata, /\+1\d{10}|Bearer\s+\S+/i);
});

test("5. scheduleRecruitAiV2ShadowEvaluation is async and never blocks when disabled", () => {
  let ran = false;
  const scheduled = scheduleRecruitAiV2ShadowEvaluation(
    {
      prospect: makeProspect(),
      organizationId: ORG,
      inbound: { providerMessageId: "wamid.async", body: "Hi" },
      conversation: { success: true, replied: true },
      env: { RECRUIT_AI_V2_SHADOW_ENABLED: "false" }
    },
    {
      schedule: (fn) => {
        ran = true;
        fn();
      }
    }
  );

  assert.equal(scheduled.scheduled, false);
  assert.equal(scheduled.skipped, true);
  assert.equal(ran, false);
});

test("6. schedule runs after live turn when enabled and failures stay isolated", async () => {
  resetShadowEvaluationServiceCache();
  const { service, shadowRepo } = makeShadowService();
  let scheduledFn = null;

  const scheduleResult = scheduleRecruitAiV2ShadowEvaluation(
    {
      prospect: makeProspect(),
      organizationId: ORG,
      inbound: { providerMessageId: "wamid.run", body: "6?" },
      conversation: {
        success: true,
        replied: true,
        engineResult: { outboundIntent: "CONVERSATION_ENGINE_REPLY", reply: "ok" }
      },
      env: {
        RECRUIT_AI_V2_SHADOW_ENABLED: "true",
        RECRUIT_AI_V2_SHADOW_ORGANIZATION_IDS: ORG,
        RECRUIT_AI_V2_SHADOW_SAMPLE_RATE: "1"
      }
    },
    {
      service,
      schedule: (fn) => {
        scheduledFn = fn;
      }
    }
  );

  assert.equal(scheduleResult.scheduled, true);
  assert.equal(typeof scheduledFn, "function");
  assert.equal(shadowRepo._all().length, 0);

  await scheduledFn();
  assert.equal(shadowRepo._all().length, 1);
  assert.equal(shadowRepo._all()[0].v2_interpreted_intent, INTENTS.SCHEDULING_COUNTEROFFER);
});

test("7. shadow evaluation failure is captured and does not throw to caller", async () => {
  const shadowRepo = createMemoryShadowEvaluationRepository();
  const service = createShadowEvaluationService({
    repository: shadowRepo,
    persistenceService: null,
    processTurn: async () => {
      throw new Error("forced shadow boom +15551234567 Bearer secret-token");
    }
  });

  const result = await service.evaluateShadowTurn({
    prospect: makeProspect(),
    organizationId: ORG,
    inboundMessageId: "wamid.fail",
    messageText: "hello",
    conversation: { success: true, replied: true }
  });

  assert.equal(result.divergenceClassification, DIVERGENCE.V2_EVALUATION_FAILED);
  assert.match(result.evaluationError, /forced shadow boom/);
  assert.doesNotMatch(result.evaluationError, /15551234567|secret-token/);
  assert.equal(result.row.divergence_classification, DIVERGENCE.V2_EVALUATION_FAILED);
});

test("8. live CE remains authoritative in inbound pipeline wiring", () => {
  const pipeline = fs.readFileSync(PIPELINE_PATH, "utf8");
  const hub = fs.readFileSync(HUB_PATH, "utf8");
  const ce = fs.readFileSync(CE_PATH, "utf8");

  assert.match(pipeline, /processConversationAfterInbound/);
  assert.match(pipeline, /scheduleRecruitAiV2ShadowEvaluation/);
  assert.match(
    pipeline,
    /processConversationAfterInbound[\s\S]*scheduleRecruitAiV2ShadowEvaluation/
  );
  assert.doesNotMatch(hub, /processRecruitAiV2Turn|scheduleRecruitAiV2ShadowEvaluation/);
  assert.doesNotMatch(ce, /processRecruitAiV2Turn|scheduleRecruitAiV2ShadowEvaluation/);
  assert.match(hub, /handleIncomingMessage/);
});

test("9. side-effect authorizer still deny-all even when shadow enabled", () => {
  const auth = authorizeSideEffects({
    structuredDecision: {
      decision: { nextAction: "create_appointment", shouldEscalate: true },
      reasonCodes: []
    },
    responsePlan: { templateKey: "appointment_confirm_deferred" },
    env: {
      RECRUIT_AI_V2_SHADOW_ENABLED: "true",
      RECRUIT_AI_V2_EXECUTION_ENABLED: "true"
    }
  });
  assert.equal(auth.authorized, false);
  assert.ok(auth.proposals.every((p) => p.authorized === false));
});

test("10. TV-000028 counteroffer shadow comparison uses fixture only", async () => {
  const fx = loadFixture();
  const turn = fx.turns.find((t) => t.id === "t07");
  const inboundIdx = fx.turns.filter((t) => t.direction === "inbound").findIndex((t) => t.id === "t07");
  const context = loadContextFromReplayFixture(fx, inboundIdx);

  const turnResult = await processRecruitAiV2Turn({
    message: { text: turn.text },
    context,
    options: { flexible: true }
  });

  assert.equal(turnResult.interpretation.intent, INTENTS.SCHEDULING_COUNTEROFFER);
  assert.equal(containsInternalDiagnostics(turnResult.rendered.text), false);

  const { service, shadowRepo } = makeShadowService();
  const result = await service.evaluateShadowTurn({
    prospect: makeProspect({ preferred_language: "english" }),
    organizationId: ORG,
    inboundMessageId: "wamid.tv28",
    messageText: turn.text,
    conversation: {
      success: true,
      replied: true,
      engineResult: {
        reply: "Would 5:00 PM or 5:15 PM work?",
        outboundIntent: "CONVERSATION_ENGINE_REPLY"
      }
    }
  });

  assert.equal(result.row.v2_interpreted_intent, INTENTS.SCHEDULING_COUNTEROFFER);
  assert.equal(result.row.language_agreement, true);
  assert.equal(result.row.diagnostic_leak_check, true);
  assert.ok(
    [DIVERGENCE.ALIGNED, DIVERGENCE.ACTION_MISMATCH, DIVERGENCE.INTENT_MISMATCH].includes(
      result.row.divergence_classification
    )
  );
  assert.equal(shadowRepo._all().length, 1);
});

test("11. divergence classifier covers language mismatch and diagnostic leak", () => {
  assert.equal(
    classifyDivergence({
      liveCeResponseIntent: "CONVERSATION_ENGINE_REPLY",
      liveLanguage: "english",
      v2InterpretedIntent: "scheduling_counteroffer",
      v2DecisionCode: "acknowledge_and_check_availability",
      v2Language: "spanish",
      v2RenderedText: "Hola"
    }),
    DIVERGENCE.LANGUAGE_MISMATCH
  );

  assert.equal(
    classifyDivergence({
      liveCeResponseIntent: "CONVERSATION_ENGINE_REPLY",
      liveLanguage: "english",
      v2InterpretedIntent: "unknown",
      v2DecisionCode: "clarify_once",
      v2Language: "english",
      v2RenderedText: "Missing authenticated agent id for appointment persistence."
    }),
    DIVERGENCE.DIAGNOSTIC_LEAK
  );
});

test("12. nested finalizeReply engine payloads still expose live outbound intent", () => {
  const intent = extractLiveCeResponseIntent({
    success: true,
    replied: true,
    engineResult: {
      reply: {
        reply: "Confirmed",
        outboundIntent: "APPOINTMENT_CONFIRMATION"
      }
    }
  });
  assert.equal(intent, "APPOINTMENT_CONFIRMATION");
});

test("13. JSON shadow config and legacy RECRUIT_AI_V2_SHADOW alias are accepted", () => {
  const fromJson = resolveShadowConfig({
    RECRUIT_AI_V2_SHADOW_CONFIG: JSON.stringify({
      enabled: true,
      organizationIds: [ORG],
      sampleRate: 0.5
    })
  });
  assert.equal(fromJson.enabled, true);
  assert.deepEqual(fromJson.organizationIds, [ORG]);
  assert.equal(fromJson.sampleRate, 0.5);

  const fromLegacy = resolveShadowConfig({
    RECRUIT_AI_V2_SHADOW: "true",
    RECRUIT_AI_V2_SHADOW_SAMPLE_RATE: "100"
  });
  assert.equal(fromLegacy.enabled, true);
  assert.equal(fromLegacy.sampleRate, 1);
});

test("14. runRecruitAiV2ShadowEvaluation skips when disabled without writing", async () => {
  resetShadowEvaluationServiceCache();
  const { service, shadowRepo } = makeShadowService();
  const result = await runRecruitAiV2ShadowEvaluation(
    {
      prospect: makeProspect(),
      organizationId: ORG,
      inbound: { providerMessageId: "wamid.skip", body: "Hi" },
      conversation: { success: true, replied: true },
      env: { RECRUIT_AI_V2_SHADOW_ENABLED: "false" }
    },
    { service }
  );
  assert.equal(result.skipped, true);
  assert.equal(shadowRepo._all().length, 0);
});

test("15. shadow package does not send WhatsApp or book appointments", () => {
  const dir = path.join(__dirname, "../core/recruitAiV2");
  for (const name of fs.readdirSync(dir)) {
    if (!name.startsWith("shadow")) {
      continue;
    }
    const src = fs.readFileSync(path.join(dir, name), "utf8");
    assert.doesNotMatch(src, /sendAndPersistWhatsAppMessage|executeScheduleInterview/);
    assert.doesNotMatch(src, /markAiResponding|markHumanAttentionRequired|claimLead\(/);
  }
});

test("16. Meta Review scope is isolated from shadow persistence", async () => {
  const { service } = makeShadowService();
  const result = await service.evaluateShadowTurn({
    prospect: makeProspect({
      id: "metareview-prospect",
      organization_id: "metareview-org"
    }),
    organizationId: "metareview-org",
    inboundMessageId: "wamid.meta",
    messageText: "hello",
    conversation: { success: true, replied: true }
  });
  assert.equal(result.skipped, true);
  assert.equal(result.reason, "META_REVIEW_ISOLATED");
});
