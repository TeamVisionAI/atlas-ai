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
  INTENTS,
  SHADOW_DIVERGENCE
} = require("../core/recruitAiV2");
const {
  resetShadowEvaluationServiceCache,
  withTimeout,
  DEFAULT_TIMEOUT_MS
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

const ENABLED_ENV = {
  RECRUIT_AI_V2_SHADOW_ENABLED: "true",
  RECRUIT_AI_V2_SHADOW_ORGANIZATION_IDS: ORG,
  RECRUIT_AI_V2_SHADOW_SAMPLE_RATE: "1"
};

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

function makeShadowService(overrides = {}) {
  const shadowRepo =
    overrides.shadowRepo || createMemoryShadowEvaluationRepository();
  const contextRepo =
    overrides.contextRepo || createMemoryContextRepository();
  const persistenceService =
    overrides.persistenceService === undefined
      ? createContextPersistenceService({ repository: contextRepo })
      : overrides.persistenceService;
  const service = createShadowEvaluationService({
    repository: shadowRepo,
    persistenceService,
    processTurn: overrides.processTurn
  });
  return { service, shadowRepo, contextRepo, persistenceService };
}

test("1. shadow config defaults to disabled with empty allowlist and zero sample rate", () => {
  const config = resolveShadowConfig({});
  assert.equal(config.enabled, false);
  assert.deepEqual(config.organizationIds, []);
  assert.equal(config.sampleRate, 0);
  assert.equal(config.timeoutMs, DEFAULT_TIMEOUT_MS);

  const eligibility = isEligibleForShadowEvaluation({
    organizationId: ORG,
    prospectId: PROSPECT,
    inboundMessageId: "wamid.default",
    env: {}
  });
  assert.equal(eligibility.eligible, false);
  assert.equal(eligibility.reason, "SHADOW_DISABLED");
});

test("2. enabled with empty allowlist is not eligible (fail closed)", () => {
  const eligibility = isEligibleForShadowEvaluation({
    organizationId: ORG,
    prospectId: PROSPECT,
    inboundMessageId: "wamid.empty-allow",
    env: {
      RECRUIT_AI_V2_SHADOW_ENABLED: "true",
      RECRUIT_AI_V2_SHADOW_SAMPLE_RATE: "1"
    }
  });
  assert.equal(eligibility.eligible, false);
  assert.equal(eligibility.reason, "ORG_ALLOWLIST_EMPTY");
});

test("3. enabled with sampleRate 0 still skips even when allowlisted", () => {
  const eligibility = isEligibleForShadowEvaluation({
    organizationId: ORG,
    prospectId: PROSPECT,
    inboundMessageId: "wamid.zero",
    env: {
      RECRUIT_AI_V2_SHADOW_ENABLED: "true",
      RECRUIT_AI_V2_SHADOW_ORGANIZATION_IDS: ORG,
      RECRUIT_AI_V2_SHADOW_SAMPLE_RATE: "0"
    }
  });
  assert.equal(eligibility.eligible, false);
  assert.equal(eligibility.reason, "SAMPLE_RATE_MISS");
});

test("4. organization allowlist denies non-listed orgs", () => {
  const eligibility = isEligibleForShadowEvaluation({
    organizationId: "11111111-1111-4111-8111-111111111111",
    prospectId: PROSPECT,
    inboundMessageId: "wamid.org",
    env: ENABLED_ENV
  });
  assert.equal(eligibility.eligible, false);
  assert.equal(eligibility.reason, "ORG_NOT_ALLOWLISTED");
});

test("5. malformed JSON config fails closed", () => {
  const config = resolveShadowConfig({
    RECRUIT_AI_V2_SHADOW_CONFIG: "{not-json",
    RECRUIT_AI_V2_SHADOW_ENABLED: "true"
  });
  assert.equal(config.enabled, false);
  assert.equal(config.failClosed, true);

  const eligibility = isEligibleForShadowEvaluation({
    organizationId: ORG,
    prospectId: PROSPECT,
    inboundMessageId: "wamid.badjson",
    env: {
      RECRUIT_AI_V2_SHADOW_CONFIG: "{not-json",
      RECRUIT_AI_V2_SHADOW_ENABLED: "true",
      RECRUIT_AI_V2_SHADOW_ORGANIZATION_IDS: ORG,
      RECRUIT_AI_V2_SHADOW_SAMPLE_RATE: "1"
    }
  });
  assert.equal(eligibility.eligible, false);
});

test("6. eligible org runs and persists sanitized shadow ledger fields", async () => {
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
      replyText: "Here are times",
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
  assert.equal(result.row.metadata.evaluationStatus, "completed");
  assert.equal(result.row.metadata.liveSideEffectCategory, "whatsapp_reply");
  assert.ok(result.row.metadata.v2SideEffectCategory);
  assert.equal(typeof result.row.metadata.appointmentStateAgreement, "boolean");
  assert.equal(typeof result.row.metadata.escalationRecommended, "boolean");
  assert.equal(result.authorizationDenied, true);
  assert.equal(shadowRepo._all().length, 1);
  assert.ok(contextRepo._all().length >= 1);

  const metadata = JSON.stringify(result.row.metadata || {});
  assert.doesNotMatch(metadata, /\+1\d{10}|Bearer\s+\S+|hiddenReasoning|stack/i);
});

test("7. scheduleRecruitAiV2ShadowEvaluation is async and skips when disabled", () => {
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

test("8. schedule runs after live turn when enabled; retries remain 0", async () => {
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
      env: ENABLED_ENV
    },
    {
      service,
      schedule: (fn) => {
        scheduledFn = fn;
      }
    }
  );

  assert.equal(scheduleResult.scheduled, true);
  assert.equal(scheduleResult.retries, 0);
  assert.equal(typeof scheduledFn, "function");
  assert.equal(shadowRepo._all().length, 0);

  await scheduledFn();
  assert.equal(shadowRepo._all().length, 1);
  assert.equal(shadowRepo._all()[0].v2_interpreted_intent, INTENTS.SCHEDULING_COUNTEROFFER);
});

test("9. failure isolation: interpreter/processTurn failure is sanitized", async () => {
  const { service } = makeShadowService({
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

  assert.equal(result.divergenceClassification, DIVERGENCE.SHADOW_ERROR);
  assert.match(result.evaluationError, /forced shadow boom/);
  assert.doesNotMatch(result.evaluationError, /15551234567|secret-token/);
  assert.equal(result.row.metadata.safeErrorCode, "SHADOW_EVALUATION_FAILED");
  assert.equal(result.row.metadata.evaluationStatus, "error");
});

test("10. failure isolation: shadow insert failure does not throw", async () => {
  const shadowRepo = {
    async insert() {
      throw new Error("insert exploded");
    }
  };
  const { service } = makeShadowService({ shadowRepo, persistenceService: null });
  const result = await service.evaluateShadowTurn({
    prospect: makeProspect(),
    organizationId: ORG,
    inboundMessageId: "wamid.insert-fail",
    messageText: "hello",
    conversation: { success: true, replied: true }
  });
  assert.equal(result.reason, "SHADOW_INSERT_FAILED");
  assert.equal(result.row, null);
  assert.equal(result.divergenceClassification, DIVERGENCE.SHADOW_ERROR);
});

test("11. failure isolation: timeout is bounded and does not retry", async () => {
  await assert.rejects(
    () =>
      withTimeout(
        new Promise((resolve) => setTimeout(resolve, 50)),
        5
      ),
    (error) => error.code === "SHADOW_EVALUATION_TIMEOUT"
  );

  resetShadowEvaluationServiceCache();
  const { service } = makeShadowService({
    processTurn: () => new Promise(() => {})
  });
  const result = await runRecruitAiV2ShadowEvaluation(
    {
      prospect: makeProspect(),
      organizationId: ORG,
      inbound: { providerMessageId: "wamid.timeout", body: "Hi" },
      conversation: { success: true, replied: true },
      env: ENABLED_ENV
    },
    { service, timeoutMs: 20 }
  );
  assert.equal(result.reason, "SHADOW_EVALUATION_TIMEOUT");
  assert.equal(result.retries, 0);
  assert.equal(result.timeoutMs, 20);
});

test("12. failure isolation: malformed input and context save conflict stay isolated", async () => {
  const { service } = makeShadowService();
  const malformed = await service.evaluateShadowTurn({
    prospect: makeProspect(),
    organizationId: ORG,
    inboundMessageId: "wamid.malformed",
    messageText: "   ",
    conversation: { success: true, replied: true }
  });
  assert.equal(malformed.divergenceClassification, DIVERGENCE.SHADOW_ERROR);
  assert.equal(malformed.row.metadata.safeErrorCode, "SHADOW_MALFORMED_INPUT");

  const contextRepo = createMemoryContextRepository();
  const persistenceService = createContextPersistenceService({
    repository: contextRepo
  });
  await persistenceService.createContext({
    organizationId: ORG,
    prospectId: PROSPECT,
    context: { preferredLanguage: "english" }
  });
  // Force compare-and-save conflict via stale expected version on second turn.
  const conflictService = createShadowEvaluationService({
    repository: createMemoryShadowEvaluationRepository(),
    persistenceService,
    processTurn: async (args) => {
      const base = await processRecruitAiV2Turn({
        ...args,
        persistenceService: null
      });
      const conflict = await persistenceService.compareAndSaveContext({
        organizationId: ORG,
        prospectId: PROSPECT,
        expectedVersion: 1,
        nextContext: base.nextContext,
        inboundMessageId: "wamid.conflict-a",
        decisionCode: "clarify_once"
      });
      assert.equal(conflict.ok, true);
      try {
        await persistenceService.compareAndSaveContext({
          organizationId: ORG,
          prospectId: PROSPECT,
          expectedVersion: 1,
          nextContext: base.nextContext,
          inboundMessageId: "wamid.conflict-b",
          decisionCode: "clarify_once"
        });
      } catch (error) {
        assert.equal(error.code, "CONTEXT_VERSION_CONFLICT");
        throw error;
      }
      return base;
    }
  });

  const conflictResult = await conflictService.evaluateShadowTurn({
    prospect: makeProspect(),
    organizationId: ORG,
    inboundMessageId: "wamid.conflict",
    messageText: "hello again",
    conversation: { success: true, replied: true }
  });
  assert.equal(conflictResult.divergenceClassification, DIVERGENCE.SHADOW_ERROR);
  assert.equal(conflictResult.row.metadata.safeErrorCode, "CONTEXT_VERSION_CONFLICT");
});

test("13. live CE remains authoritative in inbound pipeline wiring", () => {
  const pipeline = fs.readFileSync(PIPELINE_PATH, "utf8");
  const hub = fs.readFileSync(HUB_PATH, "utf8");
  const ce = fs.readFileSync(CE_PATH, "utf8");

  assert.match(pipeline, /processConversationAfterInbound/);
  assert.match(pipeline, /scheduleRecruitAiV2PostLiveAdvisory/);
  assert.match(
    pipeline,
    /processConversationAfterInbound[\s\S]*markAiResponding[\s\S]*scheduleRecruitAiV2PostLiveAdvisory/
  );
  assert.doesNotMatch(hub, /processRecruitAiV2Turn|scheduleRecruitAiV2ShadowEvaluation/);
  assert.doesNotMatch(ce, /processRecruitAiV2Turn|scheduleRecruitAiV2ShadowEvaluation/);
  assert.match(hub, /handleIncomingMessage/);
});

test("14. side-effect authorizer still deny-all even when shadow enabled", () => {
  const auth = authorizeSideEffects({
    structuredDecision: {
      decision: {
        nextAction: "create_appointment",
        mayCreateAppointment: true,
        shouldEscalate: true
      },
      reasonCodes: []
    },
    responsePlan: { templateKey: "appointment_confirm_deferred" },
    env: {
      RECRUIT_AI_V2_SHADOW_ENABLED: "true",
      RECRUIT_AI_V2_EXECUTION_ENABLED: "true"
    },
    profileConfigured: true,
    actingUserId: "user-1",
    organizationId: "org-1"
  });
  // Shadow + execution flag without allowlists remains fail-closed (BR-111).
  assert.equal(auth.authorized, false);
  assert.ok(auth.proposals.every((p) => p.authorized === false));
});

test("15. TV-000028 counteroffer taxonomy: live misses, v2 detects", async () => {
  const fx = loadFixture();
  const six = fx.turns.find((t) => t.id === "t11");
  const half = fx.turns.find((t) => t.id === "t10");
  const reschedule = fx.turns.find((t) => t.id === "t14");

  const { service } = makeShadowService();

  const sixResult = await service.evaluateShadowTurn({
    prospect: makeProspect({ preferred_language: "english" }),
    organizationId: ORG,
    inboundMessageId: "wamid.tv28-6",
    messageText: six.text,
    conversation: {
      success: true,
      replied: true,
      replyText: "Would 5:00 PM or 5:15 PM work?",
      engineResult: {
        reply: "Would 5:00 PM or 5:15 PM work?",
        outboundIntent: "CONVERSATION_ENGINE_REPLY"
      }
    }
  });
  assert.equal(sixResult.row.v2_interpreted_intent, INTENTS.SCHEDULING_COUNTEROFFER);
  assert.equal(sixResult.row.language_agreement, true);
  assert.equal(
    sixResult.row.divergence_classification,
    DIVERGENCE.TIME_COUNTEROFFER_MISSED_BY_LIVE
  );

  const halfResult = await service.evaluateShadowTurn({
    prospect: makeProspect({ preferred_language: "english" }),
    organizationId: ORG,
    inboundMessageId: "wamid.tv28-630",
    messageText: half.text,
    conversation: {
      success: true,
      replied: true,
      engineResult: { outboundIntent: "CONVERSATION_ENGINE_REPLY", reply: "ok" }
    }
  });
  assert.equal(halfResult.row.v2_interpreted_intent, INTENTS.SCHEDULING_COUNTEROFFER);

  const inboundIdx = fx.turns
    .filter((t) => t.direction === "inbound")
    .findIndex((t) => t.id === "t14");
  const context = loadContextFromReplayFixture(fx, inboundIdx);
  const rescheduleTurn = await processRecruitAiV2Turn({
    message: { text: reschedule.text },
    context,
    options: { flexible: true }
  });
  assert.equal(rescheduleTurn.interpretation.intent, INTENTS.RESCHEDULE_REQUEST);
  assert.equal(containsInternalDiagnostics(rescheduleTurn.rendered.text), false);
  assert.equal(rescheduleTurn.authorization.authorized, false);
});

test("16. divergence taxonomy covers required categories", () => {
  const required = [
    "exact_or_equivalent",
    "language_mismatch",
    "intent_mismatch",
    "time_counteroffer_missed_by_live",
    "time_counteroffer_missed_by_v2",
    "confirmation_duplicate_risk",
    "reschedule_missed",
    "appointment_state_mismatch",
    "unsafe_side_effect_difference",
    "diagnostic_leak_live",
    "diagnostic_leak_v2",
    "human_escalation_difference",
    "unsupported_for_comparison",
    "shadow_error"
  ];
  for (const key of required) {
    assert.ok(Object.values(SHADOW_DIVERGENCE).includes(key), key);
    assert.ok(Object.values(DIVERGENCE).includes(key), key);
  }

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
      liveReplyText: "Missing authenticated agent id for appointment persistence.",
      v2InterpretedIntent: "unknown",
      v2DecisionCode: "clarify_once",
      v2Language: "english",
      v2RenderedText: "ok"
    }),
    DIVERGENCE.DIAGNOSTIC_LEAK_LIVE
  );

  assert.equal(
    classifyDivergence({
      evaluationFailed: true
    }),
    DIVERGENCE.SHADOW_ERROR
  );
});

test("17. nested finalizeReply engine payloads still expose live outbound intent", () => {
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

test("18. JSON shadow config and legacy alias are accepted when well-formed", () => {
  const fromJson = resolveShadowConfig({
    RECRUIT_AI_V2_SHADOW_CONFIG: JSON.stringify({
      enabled: true,
      organizationIds: [ORG],
      sampleRate: 0.5,
      timeoutMs: 4000
    })
  });
  assert.equal(fromJson.enabled, true);
  assert.deepEqual(fromJson.organizationIds, [ORG]);
  assert.equal(fromJson.sampleRate, 0.5);
  assert.equal(fromJson.timeoutMs, 4000);

  const fromLegacy = resolveShadowConfig({
    RECRUIT_AI_V2_SHADOW: "true",
    RECRUIT_AI_V2_SHADOW_ORGANIZATION_IDS: ORG,
    RECRUIT_AI_V2_SHADOW_SAMPLE_RATE: "100"
  });
  assert.equal(fromLegacy.enabled, true);
  assert.equal(fromLegacy.sampleRate, 1);
});

test("19. Meta Review scope is isolated from shadow persistence", async () => {
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

test("20. shadow package does not send WhatsApp or book appointments", () => {
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
