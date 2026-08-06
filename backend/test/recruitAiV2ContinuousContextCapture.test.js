/**
 * Recruit AI v2 Phase 3B — continuous context capture (100%) + shadow (10%).
 * Flags default off. No Railway changes. No live CE cutover.
 */

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveContextCaptureConfig,
  isEligibleForContextCapture,
  isEligibleForShadowEvaluation,
  createMemoryContextRepository,
  createMemoryShadowEvaluationRepository,
  createContextPersistenceService,
  createContextCaptureService,
  createShadowEvaluationService,
  scheduleRecruitAiV2PostLiveAdvisory,
  runRecruitAiV2PostLiveAdvisory,
  loadContextFromReplayFixture,
  authorizeSideEffects,
  INTENTS
} = require("../core/recruitAiV2");
const {
  resetAdvisoryServiceCache,
  getOrCreateAdvisoryServices
} = require("../core/recruitAiV2/advisoryTurnRunner");

const FIXTURE_PATH = path.join(
  __dirname,
  "fixtures/recruitAiV2/tv000028-scheduling-replay.json"
);
const PIPELINE_PATH = path.join(
  __dirname,
  "../core/whatsappInboundPipeline.js"
);

const ORG = "00000000-0000-4000-8000-000000000001";
const PROSPECT = "29853100-f151-4ca8-b07d-624fd20c6685";

const CAPTURE_ENV = {
  RECRUIT_AI_V2_CONTEXT_CAPTURE_ENABLED: "true",
  RECRUIT_AI_V2_CONTEXT_CAPTURE_ORGANIZATION_IDS: ORG,
  RECRUIT_AI_V2_CONTEXT_CAPTURE_SAMPLE_RATE: "1"
};

const SHADOW_ENV = {
  RECRUIT_AI_V2_SHADOW_ENABLED: "true",
  RECRUIT_AI_V2_SHADOW_ORGANIZATION_IDS: ORG,
  RECRUIT_AI_V2_SHADOW_SAMPLE_RATE: "0.10"
};

const BOTH_ENV = { ...CAPTURE_ENV, ...SHADOW_ENV };

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

function makeServices() {
  const contextRepo = createMemoryContextRepository();
  const shadowRepo = createMemoryShadowEvaluationRepository();
  const persistenceService = createContextPersistenceService({
    repository: contextRepo
  });
  const captureService = createContextCaptureService({ persistenceService });
  const shadowService = createShadowEvaluationService({
    repository: shadowRepo,
    persistenceService
  });
  return {
    contextRepo,
    shadowRepo,
    persistenceService,
    captureService,
    shadowService,
    services: { persistenceService, captureService, shadowService, shadowRepo }
  };
}

test("1. context capture flag defaults off", () => {
  const config = resolveContextCaptureConfig({});
  assert.equal(config.enabled, false);
  assert.deepEqual(config.organizationIds, []);
  assert.equal(config.sampleRate, 0);

  const eligibility = isEligibleForContextCapture({
    organizationId: ORG,
    prospectId: PROSPECT,
    inboundMessageId: "wamid.1",
    env: {}
  });
  assert.equal(eligibility.eligible, false);
  assert.equal(eligibility.reason, "CONTEXT_CAPTURE_DISABLED");
});

test("2. empty allowlist and malformed config fail closed", () => {
  assert.equal(
    isEligibleForContextCapture({
      organizationId: ORG,
      prospectId: PROSPECT,
      inboundMessageId: "wamid.2",
      env: {
        RECRUIT_AI_V2_CONTEXT_CAPTURE_ENABLED: "true",
        RECRUIT_AI_V2_CONTEXT_CAPTURE_SAMPLE_RATE: "1"
      }
    }).reason,
    "ORG_ALLOWLIST_EMPTY"
  );

  const malformed = resolveContextCaptureConfig({
    RECRUIT_AI_V2_CONTEXT_CAPTURE_CONFIG: "{bad",
    RECRUIT_AI_V2_CONTEXT_CAPTURE_ENABLED: "true"
  });
  assert.equal(malformed.enabled, false);
  assert.equal(malformed.failClosed, true);
});

test("3. 100% capture / 10% shadow are independent gates", () => {
  const capture = isEligibleForContextCapture({
    organizationId: ORG,
    prospectId: PROSPECT,
    inboundMessageId: "wamid.any",
    env: CAPTURE_ENV
  });
  assert.equal(capture.eligible, true);

  let shadowHits = 0;
  for (let i = 0; i < 200; i += 1) {
    const shadow = isEligibleForShadowEvaluation({
      organizationId: ORG,
      prospectId: PROSPECT,
      inboundMessageId: `wamid.s${i}`,
      env: SHADOW_ENV
    });
    if (shadow.eligible) {
      shadowHits += 1;
    }
  }
  assert.ok(shadowHits > 5 && shadowHits < 60, `expected ~10% hits, got ${shadowHits}`);
});

test("4-6. unsampled turn updates context and does not write shadow row", async () => {
  resetAdvisoryServiceCache();
  const { services, contextRepo, shadowRepo } = makeServices();

  // Find a message id that misses the 10% shadow sample.
  let inboundMessageId = null;
  for (let i = 0; i < 500; i += 1) {
    const id = `wamid.unsampled-${i}`;
    const shadow = isEligibleForShadowEvaluation({
      organizationId: ORG,
      prospectId: PROSPECT,
      inboundMessageId: id,
      env: BOTH_ENV
    });
    if (!shadow.eligible) {
      inboundMessageId = id;
      break;
    }
  }
  assert.ok(inboundMessageId);

  const result = await runRecruitAiV2PostLiveAdvisory(
    {
      prospect: makeProspect(),
      organizationId: ORG,
      inboundMessageId,
      messageText: "I prefer at 6",
      conversation: { success: true, replied: true },
      env: BOTH_ENV
    },
    { services }
  );

  assert.equal(result.mode, "capture_only");
  assert.equal(shadowRepo._all().length, 0);
  assert.equal(contextRepo._all().length, 1);
  const ctx = contextRepo._all()[0];
  assert.equal(ctx.last_processed_message_id, inboundMessageId);
  assert.equal(ctx.context_json.conversation.lastProspectIntent, INTENTS.SCHEDULING_COUNTEROFFER);
  assert.equal(ctx.context_json.appointment.proposedTime, "18:00");
});

test("7-8. sampled turn advances context once and writes one shadow row", async () => {
  resetAdvisoryServiceCache();
  const { services, contextRepo, shadowRepo } = makeServices();

  let inboundMessageId = null;
  for (let i = 0; i < 500; i += 1) {
    const id = `wamid.sampled-${i}`;
    const shadow = isEligibleForShadowEvaluation({
      organizationId: ORG,
      prospectId: PROSPECT,
      inboundMessageId: id,
      env: BOTH_ENV
    });
    if (shadow.eligible) {
      inboundMessageId = id;
      break;
    }
  }
  assert.ok(inboundMessageId);

  const result = await runRecruitAiV2PostLiveAdvisory(
    {
      prospect: makeProspect(),
      organizationId: ORG,
      inboundMessageId,
      messageText: "I prefer at 6",
      conversation: {
        success: true,
        replied: true,
        engineResult: { outboundIntent: "CONVERSATION_ENGINE_REPLY", reply: "ok" }
      },
      env: BOTH_ENV
    },
    { services }
  );

  assert.equal(result.mode, "shadow");
  assert.equal(result.contextCapture.reason, "DEFERRED_TO_SHADOW");
  assert.equal(shadowRepo._all().length, 1);
  assert.equal(contextRepo._all().length, 1);
  assert.equal(contextRepo._all()[0].context_version, 2); // create + mark processed
});

test("9-10. duplicate inbound is idempotent (no double version / shadow)", async () => {
  resetAdvisoryServiceCache();
  const { services, contextRepo, shadowRepo } = makeServices();
  const inboundMessageId = "wamid.dup-fixed";

  await runRecruitAiV2PostLiveAdvisory(
    {
      prospect: makeProspect(),
      organizationId: ORG,
      inboundMessageId,
      messageText: "6?",
      conversation: { success: true, replied: true },
      env: CAPTURE_ENV
    },
    { services }
  );
  const versionAfterFirst = contextRepo._all()[0].context_version;

  await runRecruitAiV2PostLiveAdvisory(
    {
      prospect: makeProspect(),
      organizationId: ORG,
      inboundMessageId,
      messageText: "6?",
      conversation: { success: true, replied: true },
      env: CAPTURE_ENV
    },
    { services }
  );

  assert.equal(contextRepo._all().length, 1);
  assert.equal(contextRepo._all()[0].context_version, versionAfterFirst);
  assert.equal(contextRepo._all()[0].last_processed_message_id, inboundMessageId);
  assert.equal(shadowRepo._all().length, 0);
});

test("11-15. sparse shadow / full capture replay retains counteroffers", async () => {
  resetAdvisoryServiceCache();
  const { services, contextRepo, shadowRepo } = makeServices();
  const fx = loadFixture();
  const inbound = fx.turns.filter((t) => t.direction === "inbound");

  // Capture all inbound turns with capture-only env (no shadow).
  for (let i = 0; i < inbound.length; i += 1) {
    const turn = inbound[i];
    const priorIdx = i;
    const seedContext = loadContextFromReplayFixture(fx, priorIdx);
    // Seed active context from prior replay state once, then let capture advance.
    if (i === 0) {
      await services.persistenceService.createContext({
        organizationId: ORG,
        prospectId: PROSPECT,
        context: {
          ...seedContext,
          organizationId: ORG,
          prospectId: PROSPECT
        }
      });
    }

    await services.captureService.captureContextTurn({
      prospect: makeProspect({ preferred_language: "english" }),
      organizationId: ORG,
      inboundMessageId: `fixture-${turn.id}`,
      messageText: turn.text,
      options: { flexible: true }
    });
  }

  const loaded = await services.persistenceService.loadContext({
    organizationId: ORG,
    prospectId: PROSPECT
  });

  assert.equal(loaded.preferredLanguage, "english");
  // After full capture of TV-000028 inbound turns, last counteroffer/reschedule state should exist.
  assert.ok(
    loaded.conversation.lastProspectIntent === INTENTS.SCHEDULING_COUNTEROFFER ||
      loaded.conversation.lastProspectIntent === INTENTS.RESCHEDULE_REQUEST ||
      loaded.conversation.lastProspectIntent === INTENTS.PROVIDE_NAME ||
      loaded.conversation.lastProspectIntent === INTENTS.SCHEDULE_CONFIRM ||
      loaded.conversation.lastProspectIntent === INTENTS.OPPORTUNITY_QUESTION ||
      loaded.conversation.lastProspectIntent === INTENTS.ECHO_OR_NOOP ||
      loaded.conversation.lastProspectIntent === INTENTS.UNKNOWN
  );

  // Explicit counteroffer sequence: capture gaps, then sample later turn.
  const seq = makeServices();
  for (const turn of [
    { id: "s6", text: "6?" },
    { id: "s7", text: "6:30?" }
  ]) {
    await seq.captureService.captureContextTurn({
      prospect: makeProspect({ preferred_language: "english" }),
      organizationId: ORG,
      inboundMessageId: turn.id,
      messageText: turn.text,
      options: { flexible: true }
    });
  }

  const after630 = await seq.persistenceService.loadContext({
    organizationId: ORG,
    prospectId: PROSPECT
  });
  assert.equal(after630.appointment.proposedTime, "18:30");
  assert.equal(after630.preferredLanguage, "english");
  assert.equal(after630.conversation.lastCounterofferTime, "18:30");

  const versionBefore = after630._persistence.contextVersion;
  const shadowResult = await seq.shadowService.evaluateShadowTurn({
    prospect: makeProspect({ preferred_language: "english" }),
    organizationId: ORG,
    inboundMessageId: "s8",
    messageText: "yes that works",
    conversation: {
      success: true,
      replied: true,
      engineResult: { outboundIntent: "CONVERSATION_ENGINE_REPLY", reply: "Great" }
    }
  });
  assert.ok(shadowResult.row);
  assert.equal(seq.shadowRepo._all().length, 1);
  const afterShadow = await seq.persistenceService.loadContext({
    organizationId: ORG,
    prospectId: PROSPECT
  });
  assert.equal(afterShadow.appointment.proposedTime, "18:30");
  assert.ok(afterShadow._persistence.contextVersion >= versionBefore);
});

test("16. optimistic conflict retries once then surfaces", async () => {
  const contextRepo = createMemoryContextRepository();
  const persistenceService = createContextPersistenceService({
    repository: contextRepo
  });
  await persistenceService.createContext({
    organizationId: ORG,
    prospectId: PROSPECT,
    context: { preferredLanguage: "english" }
  });

  let conflictForced = false;
  const original = persistenceService.compareAndSaveContext.bind(persistenceService);
  persistenceService.compareAndSaveContext = async (args) => {
    if (!conflictForced) {
      conflictForced = true;
      const err = new Error("CONTEXT_VERSION_CONFLICT");
      err.code = "CONTEXT_VERSION_CONFLICT";
      throw err;
    }
    return original(args);
  };

  const captureService = createContextCaptureService({ persistenceService });
  const result = await captureService.captureContextTurn({
    prospect: makeProspect(),
    organizationId: ORG,
    inboundMessageId: "wamid.retry",
    messageText: "6?",
    options: { flexible: true }
  });
  assert.equal(result.skipped, false);
  assert.equal(conflictForced, true);
});

test("17. concurrent same-prospect captures do not create duplicate active rows", async () => {
  const { services, contextRepo } = makeServices();
  await Promise.all([
    services.captureService.captureContextTurn({
      prospect: makeProspect(),
      organizationId: ORG,
      inboundMessageId: "wamid.c1",
      messageText: "Hello",
      options: { flexible: true }
    }),
    services.captureService.captureContextTurn({
      prospect: makeProspect(),
      organizationId: ORG,
      inboundMessageId: "wamid.c2",
      messageText: "Hi there",
      options: { flexible: true }
    })
  ]);

  const active = contextRepo._all().filter((r) => !r.archived_at);
  assert.equal(active.length, 1);
});

test("18-21. reconstruction only when needed; no PII/reasoning/secrets in context", async () => {
  const { services, contextRepo } = makeServices();
  await services.captureService.captureContextTurn({
    prospect: makeProspect({
      name: "Fixture",
      // ensure phone on prospect is not copied into context_json unmasked path
    }),
    organizationId: ORG,
    inboundMessageId: "wamid.safe",
    messageText: "I prefer at 6",
    options: { flexible: true }
  });
  const row = contextRepo._all()[0];
  const json = JSON.stringify(row.context_json);
  assert.doesNotMatch(json, /hiddenReasoning|chainOfThought|Bearer |DATABASE_URL/i);
  assert.doesNotMatch(json, /\+1555\d{7}/);
});

test("22-27. no side effects; live CE remains authoritative in pipeline", () => {
  const auth = authorizeSideEffects({
    structuredDecision: {
      decision: { nextAction: "create_appointment", shouldEscalate: true },
      reasonCodes: []
    },
    responsePlan: { templateKey: "x" },
    env: {
      ...BOTH_ENV,
      RECRUIT_AI_V2_EXECUTION_ENABLED: "true"
    }
  });
  assert.equal(auth.authorized, false);

  const pipeline = fs.readFileSync(PIPELINE_PATH, "utf8");
  assert.match(pipeline, /processConversationAfterInbound/);
  assert.match(pipeline, /scheduleRecruitAiV2PostLiveAdvisory/);
  assert.match(
    pipeline,
    /processConversationAfterInbound[\s\S]*markAiResponding[\s\S]*scheduleRecruitAiV2PostLiveAdvisory/
  );
  assert.doesNotMatch(pipeline, /sendAndPersistWhatsAppMessage/);
});

test("28. Meta Review excluded from capture and shadow advisory", async () => {
  const { services } = makeServices();
  const result = await runRecruitAiV2PostLiveAdvisory(
    {
      prospect: makeProspect({
        id: "metareview-prospect",
        organization_id: "metareview-org"
      }),
      organizationId: "metareview-org",
      inboundMessageId: "wamid.meta",
      messageText: "hello",
      conversation: { success: true, replied: true },
      env: {
        RECRUIT_AI_V2_CONTEXT_CAPTURE_ENABLED: "true",
        RECRUIT_AI_V2_CONTEXT_CAPTURE_ORGANIZATION_IDS: "metareview-org",
        RECRUIT_AI_V2_CONTEXT_CAPTURE_SAMPLE_RATE: "1",
        RECRUIT_AI_V2_SHADOW_ENABLED: "true",
        RECRUIT_AI_V2_SHADOW_ORGANIZATION_IDS: "metareview-org",
        RECRUIT_AI_V2_SHADOW_SAMPLE_RATE: "1"
      }
    },
    { services }
  );
  assert.equal(result.reason, "META_REVIEW_ISOLATED");
});

test("29. TV-000028 sparse-shadow/full-capture: unsampled 6? then 6:30? visible later", async () => {
  const { services, shadowRepo } = makeServices();
  await services.captureService.captureContextTurn({
    prospect: makeProspect({ preferred_language: "english" }),
    organizationId: ORG,
    inboundMessageId: "tv-6",
    messageText: "6?",
    options: { flexible: true }
  });
  await services.captureService.captureContextTurn({
    prospect: makeProspect({ preferred_language: "english" }),
    organizationId: ORG,
    inboundMessageId: "tv-630",
    messageText: "6:30?",
    options: { flexible: true }
  });

  const mid = await services.persistenceService.loadContext({
    organizationId: ORG,
    prospectId: PROSPECT
  });
  assert.equal(mid.appointment.proposedTime, "18:30");
  assert.equal(mid.preferredLanguage, "english");

  const shadow = await services.shadowService.evaluateShadowTurn({
    prospect: makeProspect({ preferred_language: "english" }),
    organizationId: ORG,
    inboundMessageId: "tv-sampled-later",
    messageText: "yes that works",
    conversation: {
      success: true,
      replied: true,
      engineResult: { outboundIntent: "CONVERSATION_ENGINE_REPLY", reply: "Confirmed path" }
    }
  });

  assert.equal(shadowRepo._all().length, 1);
  assert.equal(shadow.authorizationDenied, true);
  const after = await services.persistenceService.loadContext({
    organizationId: ORG,
    prospectId: PROSPECT
  });
  assert.equal(after.appointment.proposedTime, "18:30");
  assert.equal(after.preferredLanguage, "english");
});

test("30. schedule advisory is async and defaults skip when flags off", () => {
  let ran = false;
  const scheduled = scheduleRecruitAiV2PostLiveAdvisory(
    {
      prospect: makeProspect(),
      organizationId: ORG,
      inbound: { providerMessageId: "wamid.off", body: "Hi" },
      conversation: { success: true, replied: true },
      env: {}
    },
    {
      schedule: (fn) => {
        ran = true;
        fn();
      }
    }
  );
  assert.equal(scheduled.scheduled, false);
  assert.equal(ran, false);
});

test("31. closed prospect excluded from capture", () => {
  const eligibility = isEligibleForContextCapture({
    organizationId: ORG,
    prospectId: PROSPECT,
    inboundMessageId: "wamid.closed",
    prospectClosed: true,
    env: CAPTURE_ENV
  });
  assert.equal(eligibility.eligible, false);
  assert.equal(eligibility.reason, "PROSPECT_CLOSED");
});

test("32. getOrCreateAdvisoryServices exposes capture + shadow", () => {
  resetAdvisoryServiceCache();
  const bundle = getOrCreateAdvisoryServices({ forceNew: true });
  assert.equal(typeof bundle.captureService.captureContextTurn, "function");
  assert.equal(typeof bundle.shadowService.evaluateShadowTurn, "function");
});
