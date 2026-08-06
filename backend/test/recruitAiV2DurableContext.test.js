/**
 * Recruit AI v2 Phase 2 — durable context persistence.
 * Uses in-memory repository + sanitized TV-000028 fixtures.
 * No live WhatsApp, no production CE cutover, no migration apply.
 */

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  processRecruitAiV2Turn,
  processRecruitAiV2TurnSync,
  createMemoryContextRepository,
  createContextPersistenceService,
  sanitizeContextForPersistence,
  loadContextFromReplayFixture,
  INTENTS,
  authorizeSideEffects
} = require("../core/recruitAiV2");

const FIXTURE_PATH = path.join(
  __dirname,
  "fixtures/recruitAiV2/tv000028-scheduling-replay.json"
);
const MIGRATION_PATH = path.join(
  __dirname,
  "../database/migrations/032_br081_recruit_ai_conversation_contexts.sql"
);
const MIGRATION_DOWN_PATH = path.join(
  __dirname,
  "../database/migrations/032_br081_recruit_ai_conversation_contexts_down.sql"
);

const ORG = "00000000-0000-4000-8000-000000000001";
const PROSPECT = "29853100-f151-4ca8-b07d-624fd20c6685";

function loadFixture() {
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));
}

function makeService() {
  return createContextPersistenceService({
    repository: createMemoryContextRepository()
  });
}

test("1. context table migration is additive and RLS-safe", () => {
  const sql = fs.readFileSync(MIGRATION_PATH, "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.recruit_ai_conversation_contexts/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.recruit_ai_v2_shadow_evaluations/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /TO anon/);
  assert.match(sql, /TO authenticated/);
  assert.match(sql, /USING \(false\)/);
  assert.match(sql, /GRANT ALL[\s\S]*service_role/);
  assert.match(sql, /idx_recruit_ai_ctx_active_unique/);
  assert.doesNotMatch(sql, /DROP TABLE(?! IF EXISTS)/);
  assert.doesNotMatch(sql, /UPDATE\s+prospects/i);
  assert.doesNotMatch(sql, /DELETE FROM/i);
  assert.ok(fs.existsSync(MIGRATION_DOWN_PATH));
});

test("2-5. tenant-scoped create/load/save and unique active context", async () => {
  const service = makeService();
  const created = await service.createContext({
    organizationId: ORG,
    prospectId: PROSPECT,
    context: {
      preferredLanguage: "english",
      currentStage: "proposed",
      conversation: { lastQuestionAsked: "offer_time_choices" }
    }
  });

  assert.equal(created.organizationId, ORG);
  assert.equal(created.prospectId, PROSPECT);
  assert.equal(created._persistence.contextVersion, 1);

  const loaded = await service.loadContext({
    organizationId: ORG,
    prospectId: PROSPECT
  });
  assert.equal(loaded.conversation.lastQuestionAsked, "offer_time_choices");

  await assert.rejects(
    () =>
      service.createContext({
        organizationId: ORG,
        prospectId: PROSPECT,
        context: { preferredLanguage: "english" }
      }),
    (error) => error.code === "CONTEXT_UNIQUE_VIOLATION"
  );

  const saved = await service.compareAndSaveContext({
    organizationId: ORG,
    prospectId: PROSPECT,
    expectedVersion: 1,
    nextContext: {
      ...loaded,
      conversation: {
        ...loaded.conversation,
        lastProspectIntent: INTENTS.SCHEDULING_COUNTEROFFER,
        lastCounterofferTime: "18:00"
      }
    },
    inboundMessageId: "msg-1",
    decisionCode: "acknowledge_and_check_availability"
  });

  assert.equal(saved.ok, true);
  assert.equal(saved.context._persistence.contextVersion, 2);
  assert.equal(saved.context.conversation.lastCounterofferTime, "18:00");
});

test("6-9. optimistic conflict, duplicate idempotency, stale writer, safe retry", async () => {
  const service = makeService();
  await service.createContext({
    organizationId: ORG,
    prospectId: PROSPECT,
    context: { preferredLanguage: "english", currentStage: "proposed" }
  });

  await service.compareAndSaveContext({
    organizationId: ORG,
    prospectId: PROSPECT,
    expectedVersion: 1,
    nextContext: {
      preferredLanguage: "english",
      conversation: { lastCounterofferTime: "18:00" }
    },
    inboundMessageId: "msg-a"
  });

  await assert.rejects(
    () =>
      service.compareAndSaveContext({
        organizationId: ORG,
        prospectId: PROSPECT,
        expectedVersion: 1,
        nextContext: {
          preferredLanguage: "english",
          conversation: { lastCounterofferTime: "18:30" }
        },
        inboundMessageId: "msg-b"
      }),
    (error) => error.code === "CONTEXT_VERSION_CONFLICT"
  );

  const idempotent = await service.compareAndSaveContext({
    organizationId: ORG,
    prospectId: PROSPECT,
    expectedVersion: 2,
    nextContext: {
      preferredLanguage: "english",
      conversation: { lastCounterofferTime: "18:00" }
    },
    inboundMessageId: "msg-a"
  });
  assert.equal(idempotent.idempotent, true);
  assert.equal(idempotent.context._persistence.contextVersion, 2);

  const retry = await service.compareAndSaveContext({
    organizationId: ORG,
    prospectId: PROSPECT,
    expectedVersion: 2,
    nextContext: {
      preferredLanguage: "english",
      conversation: { lastCounterofferTime: "18:30" }
    },
    inboundMessageId: "msg-c"
  });
  assert.equal(retry.ok, true);
  assert.equal(retry.context.conversation.lastCounterofferTime, "18:30");
  assert.equal(retry.context._persistence.contextVersion, 3);
});

test("10-11. reconstruction fallback does not invent unsupported facts", async () => {
  const service = makeService();
  const { context, source } = await service.loadOrReconstruct({
    organizationId: ORG,
    prospectId: PROSPECT,
    reconstructionInput: {
      knownFacts: { city: "Miami", state: "FL" },
      preferredLanguage: "english"
    }
  });

  assert.equal(source, "reconstructed");
  assert.equal(context.knownFacts.city, "Miami");
  assert.equal(context.knownFacts.workAuthorization, null);
  assert.equal(context.appointment.status, "none");
  assert.ok(context.conversation.reconstructedAt);
  assert.equal(context.persistenceSource, "reconstructed");
});

test("12-16. language/counteroffer/confirm/reschedule persist across reload", async () => {
  const fx = loadFixture();
  const service = makeService();
  const idx = fx.turns.findIndex((t) => t.id === "t07");
  const seed = loadContextFromReplayFixture(fx, idx);

  const first = await processRecruitAiV2Turn({
    message: { text: "I prefer at 6", id: "in-t07" },
    context: seed,
    persistenceService: service,
    options: { flexible: true, channel: "whatsapp" }
  });

  assert.equal(first.interpretation.intent, INTENTS.SCHEDULING_COUNTEROFFER);
  assert.equal(first.nextContext.preferredLanguage, "english");
  assert.equal(first.nextContext.conversation.lastCounterofferTime, "18:00");
  assert.equal(first.persistence.result.ok, true);

  const reloaded = await service.loadContext({
    organizationId: ORG,
    prospectId: PROSPECT
  });
  assert.equal(reloaded.preferredLanguage, "english");
  assert.equal(reloaded.conversation.lastCounterofferTime, "18:00");

  const second = await processRecruitAiV2Turn({
    message: { text: "What about 6:30 pm?", id: "in-t10" },
    context: reloaded,
    persistenceService: service,
    options: { flexible: true }
  });
  assert.equal(second.interpretation.entities.requestedTime, "18:30");
  assert.equal(second.nextContext.conversation.lastCounterofferTime, "18:30");

  // Simulate confirmed then post-confirm reschedule persistence.
  const confirmed = await service.compareAndSaveContext({
    organizationId: ORG,
    prospectId: PROSPECT,
    expectedVersion: second.nextContext._persistence.contextVersion,
    nextContext: {
      ...second.nextContext,
      currentStage: "confirmed",
      appointment: {
        ...second.nextContext.appointment,
        status: "confirmed",
        confirmedTime: "17:15",
        appointmentId: fx.identity.appointmentId
      },
      conversation: {
        ...second.nextContext.conversation,
        confirmationVersion: 1,
        lastConfirmationSentVersion: 1
      }
    },
    inboundMessageId: "in-confirm"
  });

  const reschedule = await processRecruitAiV2Turn({
    message: { text: "What about 6?", id: "in-t14" },
    context: confirmed.context,
    persistenceService: service,
    options: { flexible: true }
  });

  assert.equal(reschedule.interpretation.intent, INTENTS.RESCHEDULE_REQUEST);
  const afterRestart = await service.loadContext({
    organizationId: ORG,
    prospectId: PROSPECT
  });
  assert.equal(afterRestart.appointment.status, "reschedule_requested");
  assert.equal(afterRestart.conversation.confirmationVersion, 1);
  assert.equal(afterRestart.preferredLanguage, "english");
});

test("17-18. archive behavior and closed prospect blocks writes", async () => {
  const service = makeService();
  await service.createContext({
    organizationId: ORG,
    prospectId: PROSPECT,
    context: { preferredLanguage: "english" }
  });

  await assert.rejects(
    () =>
      service.compareAndSaveContext({
        organizationId: ORG,
        prospectId: PROSPECT,
        expectedVersion: 1,
        nextContext: { preferredLanguage: "english" },
        prospectClosed: true
      }),
    (error) => error.code === "CONTEXT_PROSPECT_CLOSED"
  );

  const archived = await service.archiveContext({
    organizationId: ORG,
    prospectId: PROSPECT,
    reason: "conversation_completed"
  });
  assert.ok(archived._persistence.archivedAt);

  const active = await service.loadContext({
    organizationId: ORG,
    prospectId: PROSPECT
  });
  assert.equal(active, null);
});

test("19-20. cross-org denied and Meta Review fixture isolation", async () => {
  const service = makeService();
  await service.createContext({
    organizationId: ORG,
    prospectId: PROSPECT,
    context: { preferredLanguage: "english" }
  });

  const otherOrg = await service.loadContext({
    organizationId: "11111111-1111-4111-8111-111111111111",
    prospectId: PROSPECT
  });
  assert.equal(otherOrg, null);

  await assert.rejects(
    () =>
      service.createContext({
        organizationId: ORG,
        prospectId: PROSPECT,
        channel: "meta_review",
        context: { preferredLanguage: "english" }
      }),
    (error) => error.code === "CONTEXT_META_REVIEW_ISOLATED"
  );
});

test("21-22. no raw PII / hidden reasoning persisted", () => {
  const sanitized = sanitizeContextForPersistence({
    preferredLanguage: "english",
    phone: "+17865537338",
    hiddenReasoning: "secret chain",
    chainOfThought: "do not store",
    accessToken: "tok_abc",
    conversation: {
      lastAtlasOutboundText: "Call me at +1 (786) 555-7338 please"
    }
  });

  assert.equal(sanitized.hiddenReasoning, undefined);
  assert.equal(sanitized.chainOfThought, undefined);
  assert.equal(sanitized.accessToken, undefined);
  assert.match(String(sanitized.phone), /\*\*\*/);
  assert.doesNotMatch(sanitized.conversation.lastAtlasOutboundText, /7865557338|786-555-7338/);
});

test("23-24. side-effect authorizer still denies; no CE cutover", () => {
  const auth = authorizeSideEffects({
    structuredDecision: {
      decision: { nextAction: "create_appointment", shouldEscalate: true },
      reasonCodes: []
    },
    responsePlan: { templateKey: "x" },
    env: { RECRUIT_AI_V2_EXECUTION_ENABLED: "true" }
  });
  assert.equal(auth.authorized, false);

  const server = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
  const ce = fs.readFileSync(
    path.join(__dirname, "../core/semanticConversationEngine.js"),
    "utf8"
  );
  const inbound = fs.readFileSync(
    path.join(__dirname, "../core/whatsappInboundPipeline.js"),
    "utf8"
  );
  assert.doesNotMatch(server, /processRecruitAiV2Turn/);
  assert.doesNotMatch(ce, /processRecruitAiV2Turn|createContextPersistenceService/);
  assert.doesNotMatch(inbound, /processRecruitAiV2Turn|recruit_ai_conversation_contexts/);
});

test("25-28. BR-075/078/080 contracts unchanged; BR-081 regression still present", () => {
  assert.ok(
    fs.existsSync(path.join(__dirname, "whatsappOutboundSessionWindowGate.test.js"))
  );
  assert.ok(fs.existsSync(path.join(__dirname, "whatsappTemplateCatalogBr078.test.js")));
  assert.ok(
    fs.existsSync(path.join(__dirname, "br080NewLeadAssignmentAttention.test.js"))
  );
  assert.ok(
    fs.existsSync(path.join(__dirname, "recruitAiV2StructuredContextDecision.test.js"))
  );

  const sync = processRecruitAiV2TurnSync({
    message: { text: "6?", id: "x" },
    context: {
      organizationId: ORG,
      prospectId: PROSPECT,
      preferredLanguage: "english",
      currentStage: "proposed",
      appointment: {
        status: "proposed",
        previouslyOfferedSlots: [
          { time: "17:00", timezone: "America/New_York" },
          { time: "17:15", timezone: "America/New_York" }
        ]
      },
      conversation: {},
      knownFacts: {},
      attention: {}
    },
    options: { flexible: true }
  });
  assert.equal(sync.interpretation.intent, INTENTS.SCHEDULING_COUNTEROFFER);
  assert.equal(sync.structuredDecision.decision.mayCreateAppointment, false);
});

test("29. RLS migration contracts for 032 deny anon/authenticated", () => {
  const sql = fs.readFileSync(MIGRATION_PATH, "utf8");
  assert.match(sql, /recruit_ai_conversation_contexts_deny_anon/);
  assert.match(sql, /recruit_ai_conversation_contexts_deny_authenticated/);
  assert.match(sql, /recruit_ai_v2_shadow_evaluations_deny_anon/);
  assert.match(sql, /recruit_ai_v2_shadow_evaluations_deny_authenticated/);
  assert.doesNotMatch(sql, /auth\.uid\s*\(/);
  assert.doesNotMatch(sql, /SECURITY DEFINER/i);
});

test("30-32. no live provider calls; orchestrator persistence is context-only", async () => {
  const orch = fs.readFileSync(
    path.join(__dirname, "../core/recruitAiV2/orchestrator.js"),
    "utf8"
  );
  assert.doesNotMatch(orch, /sendAndPersistWhatsAppMessage|executeScheduleInterview/);
  assert.match(orch, /durable context persistence/i);

  const service = makeService();
  const result = await processRecruitAiV2Turn({
    message: { text: "I prefer at 6", id: "provider-free" },
    contextInput: {
      organizationId: ORG,
      prospectId: PROSPECT,
      preferredLanguage: "english",
      appointment: {
        status: "proposed",
        previouslyOfferedSlots: [{ time: "17:15", timezone: "America/New_York" }]
      }
    },
    persistenceService: service,
    options: { flexible: true }
  });

  assert.equal(result.execution.attempted, false);
  assert.equal(result.authorization.authorized, false);
  assert.equal(result.persistence.attempted, true);
  assert.equal(result.audit.contextPersisted, true);
});
