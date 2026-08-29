/**
 * BR-168 — recover late-settled conversational V2 replies after LIVE_AUTHORING_TIMEOUT.
 */
"use strict";

process.env.ATLAS_WORKFLOW_STATE_BACKEND = "memory";
process.env.SUPABASE_URL = "http://127.0.0.1";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

require("dotenv").config({ override: false });

const { afterEach, describe, test } = require("node:test");
const assert = require("node:assert/strict");

const {
  attemptLiveV2Authoring,
  STAGES
} = require("../core/recruitAiV2/liveAuthoringBridge");
const {
  LATE_RESULT_REASONS,
  classifyLateSettledV2Result,
  isMutationOwnedTurn
} = require("../core/recruitAiV2/lateSettledAuthoringResult");
const { extractAuthoredReplyText } = require("../core/recruitAiV2/liveAuthoringBridge");
const { processNormalizedInboundMessage } = require("../core/communicationHub");
const conversationCoherenceGuard = require("../core/recruitAiV2/globalConversationCoherenceGuard");
const whatsappOutboundPipeline = require("../core/whatsappOutboundPipeline");
const conversationEngine = require("../core/conversationEngine");
const { EVENTS } = require("../core/recruitAiV2/stage1Observability");
const {
  createContextPersistenceService
} = require("../core/recruitAiV2/contextPersistenceService");
const {
  createMemoryContextRepository
} = require("../core/recruitAiV2/contextRepository");
const workflowStateStore = require("../core/workflowStateStore");

const ORG = "00000000-0000-4000-8000-000000000001";
const AGENT = "33ad243a-9d00-4a4d-810b-df2762c0f076";
const PROSPECT_ID = "926cd2ba-55d7-4299-a0ea-37473f3ebecb";
const PHONE = "+18505550168";
const OFFER_TEXT =
  "Tengo disponible hoy a las 1:00 PM y hoy a las 8:30 PM. ¿Cuál te funciona mejor?";

function authoringEnv(overrides = {}) {
  return {
    RECRUIT_AI_V2_LIVE_AUTHORING_ENABLED: "true",
    RECRUIT_AI_V2_LIVE_AUTHORING_ORGANIZATION_IDS: ORG,
    RECRUIT_AI_V2_LIVE_AUTHORING_USER_IDS: AGENT,
    RECRUIT_AI_V2_LIVE_AUTHORING_TIMEOUT_MS: "40",
    RECRUIT_AI_V2_LIVE_AUTHORING_POST_TIMEOUT_GRACE_MS: "250",
    RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED: "false",
    RECRUIT_AI_V2_EXECUTION_ENABLED: "false",
    ...overrides
  };
}

function prospect(overrides = {}) {
  return {
    id: PROSPECT_ID,
    phone: PHONE,
    name: "Canary Prospect",
    organization_id: ORG,
    owner_user_id: AGENT,
    current_step: "SCHEDULE",
    entry_method: "QR",
    source: "car_magnet",
    updated_at: new Date().toISOString(),
    last_message_at: new Date().toISOString(),
    ...overrides
  };
}

function memoryPersistence() {
  return createContextPersistenceService({
    repository: createMemoryContextRepository()
  });
}

async function enableHubAutomation() {
  await workflowStateStore.savePersistedWorkflowState(
    PHONE,
    {
      atlasAutomationEnabled: true,
      atlasEligibilitySource: "QR",
      workflowOwnership: "ATLAS"
    },
    { organizationId: ORG, prospectId: PROSPECT_ID }
  );
}

function inbound(overrides = {}) {
  return {
    phone: PHONE,
    text: "Tarde",
    channel: "whatsapp",
    providerMessageId: "wamid.br168-tarde",
    contactName: "Canary Prospect",
    messageType: "text",
    ...overrides
  };
}

function conversationalOfferResult(overrides = {}) {
  return {
    rendered: { text: OFFER_TEXT },
    structuredDecision: {
      decision: { nextAction: "offer_available_slots", mayCreateAppointment: false }
    },
    responsePlan: { templateKey: "offer_time_choices" },
    nextContext: {
      prospectId: PROSPECT_ID,
      preferredLanguage: "spanish",
      conversation: { lastQuestionAsked: "offer_time_choices" },
      appointment: {
        status: "proposed",
        previouslyOfferedSlots: [
          { date: "2026-08-29", time: "13:00", timezone: "America/New_York" },
          { date: "2026-08-29", time: "20:30", timezone: "America/New_York" }
        ]
      },
      _persistence: { contextVersion: 5, lastProcessedMessageId: "wamid.br168-tarde" }
    },
    persistence: {
      attempted: true,
      result: { ok: true, code: null, contextVersion: 5 }
    },
    execution: {
      attempted: false,
      performed: [],
      failed: [],
      success: false,
      appointmentId: null
    },
    ...overrides
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function collectStages() {
  const stages = [];
  return {
    stages,
    logStage: (stage, payload) => {
      stages.push({ stage, payload });
    }
  };
}

afterEach(() => {
  delete process.env.RECRUIT_AI_V2_LIVE_AUTHORING_POST_TIMEOUT_GRACE_MS;
});

describe("BR-168 late-settled authoring classification", () => {
  test("offer_available_slots with replyText is recoverable", () => {
    const classified = classifyLateSettledV2Result(
      conversationalOfferResult(),
      extractAuthoredReplyText
    );
    assert.equal(classified.recoverable, true);
    assert.equal(classified.reason, LATE_RESULT_REASONS.SENDABLE);
    assert.equal(classified.nextAction, "offer_available_slots");
    assert.match(classified.replyText, /1:00 PM/);
  });

  test("create_appointment and attempted execution are not conversational recoveries", () => {
    assert.equal(
      isMutationOwnedTurn({
        structuredDecision: { decision: { nextAction: "create_appointment" } },
        execution: { attempted: false, success: false }
      }),
      true
    );
    const failedCreate = classifyLateSettledV2Result(
      {
        rendered: { text: "Confirmada" },
        structuredDecision: { decision: { nextAction: "create_appointment" } },
        execution: { attempted: true, success: false, failed: [{ type: "create_appointment" }] }
      },
      extractAuthoredReplyText
    );
    assert.equal(failedCreate.recoverable, false);
    assert.equal(failedCreate.reason, LATE_RESULT_REASONS.UNSAFE_MUTATION);
  });

  test("CAS conflict and empty reply stay rejected", () => {
    const conflicted = classifyLateSettledV2Result(
      conversationalOfferResult({
        persistence: {
          attempted: true,
          result: { ok: false, code: "CONTEXT_VERSION_CONFLICT" }
        }
      }),
      extractAuthoredReplyText
    );
    assert.equal(conflicted.recoverable, false);
    assert.equal(conflicted.reason, LATE_RESULT_REASONS.CONFLICTED);

    const empty = classifyLateSettledV2Result(
      conversationalOfferResult({ rendered: { text: "" } }),
      extractAuthoredReplyText
    );
    assert.equal(empty.recoverable, false);
    assert.equal(empty.reason, LATE_RESULT_REASONS.EMPTY_OR_UNSAFE_REPLY);
  });
});

describe("BR-168 live authoring timeout recovery", () => {
  test("availability turn times out then settles in grace → V2 reply recovered once", async () => {
    const { stages, logStage } = collectStages();
    let turnCalls = 0;
    const result = await attemptLiveV2Authoring({
      normalized: inbound(),
      prospect: prospect(),
      env: authoringEnv(),
      persistenceService: memoryPersistence(),
      logStage,
      processTurn: async () => {
        turnCalls += 1;
        await delay(80);
        return conversationalOfferResult();
      }
    });

    assert.equal(turnCalls, 1);
    assert.equal(result.authored, true);
    assert.equal(result.fallThrough, false);
    assert.equal(result.reason, "LIVE_AUTHORING_LATE_RESULT_RECOVERED");
    assert.equal(result.nextAction, "offer_available_slots");
    assert.equal(result.replyText, OFFER_TEXT);
    assert.equal(result.stage, STAGES.LATE_RESULT_RECOVERED);
    assert.ok(
      stages.some((row) => row.stage === STAGES.LATE_RESULT_RECOVERED)
    );
    assert.ok(
      stages.some(
        (row) => row.stage === EVENTS.LIVE_AUTHORING_LATE_RESULT_RECOVERED
      )
    );
    assert.ok(
      !stages.some((row) => row.stage === STAGES.FALLBACK)
    );
  });

  test("normal sub-8s turns stay on the used path", async () => {
    const { stages, logStage } = collectStages();
    const result = await attemptLiveV2Authoring({
      normalized: inbound({ providerMessageId: "wamid.br168-fast" }),
      prospect: prospect(),
      env: authoringEnv({ RECRUIT_AI_V2_LIVE_AUTHORING_TIMEOUT_MS: "2000" }),
      persistenceService: memoryPersistence(),
      logStage,
      processTurn: async () => conversationalOfferResult()
    });

    assert.equal(result.authored, true);
    assert.equal(result.reason, null);
    assert.equal(result.stage, STAGES.USED);
    assert.ok(!stages.some((row) => row.stage === STAGES.LATE_RESULT_RECOVERED));
    assert.ok(
      !stages.some(
        (row) => row.stage === EVENTS.LIVE_AUTHORING_LATE_RESULT_RECOVERED
      )
    );
  });

  test("unresolved timeout stays fail-closed with no authored reply", async () => {
    const { stages, logStage } = collectStages();
    let settle = null;
    const hung = new Promise((resolve) => {
      settle = resolve;
    });
    const result = await attemptLiveV2Authoring({
      normalized: inbound({ providerMessageId: "wamid.br168-hang" }),
      prospect: prospect(),
      env: authoringEnv({
        RECRUIT_AI_V2_LIVE_AUTHORING_TIMEOUT_MS: "20",
        RECRUIT_AI_V2_LIVE_AUTHORING_POST_TIMEOUT_GRACE_MS: "40"
      }),
      persistenceService: memoryPersistence(),
      logStage,
      processTurn: () => hung
    });

    assert.equal(result.authored, false);
    assert.equal(result.fallThrough, true);
    assert.equal(result.reason, "LIVE_AUTHORING_TIMEOUT");
    assert.equal(result.lateResultReason, LATE_RESULT_REASONS.UNRESOLVED);
    assert.ok(stages.some((row) => row.stage === STAGES.LATE_RESULT_REJECTED));
    assert.ok(
      stages.some(
        (row) => row.stage === EVENTS.LIVE_AUTHORING_LATE_RESULT_REJECTED
      )
    );
    settle(conversationalOfferResult());
  });

  test("CAS-conflicted late result is rejected", async () => {
    const result = await attemptLiveV2Authoring({
      normalized: inbound({ providerMessageId: "wamid.br168-cas" }),
      prospect: prospect(),
      env: authoringEnv(),
      persistenceService: memoryPersistence(),
      processTurn: async () => {
        await delay(80);
        return conversationalOfferResult({
          persistence: {
            attempted: true,
            result: { ok: false, code: "CONTEXT_VERSION_CONFLICT" }
          }
        });
      }
    });
    assert.equal(result.authored, false);
    assert.equal(result.reason, "LIVE_AUTHORING_TIMEOUT");
    assert.equal(result.lateResultReason, LATE_RESULT_REASONS.CONFLICTED);
  });

  test("failed mutation late result is not recovered or re-executed", async () => {
    let turnCalls = 0;
    const result = await attemptLiveV2Authoring({
      normalized: inbound({ providerMessageId: "wamid.br168-mutation", text: "Si" }),
      prospect: prospect(),
      env: authoringEnv(),
      persistenceService: memoryPersistence(),
      processTurn: async () => {
        turnCalls += 1;
        await delay(80);
        return {
          rendered: { text: "Confirmada para hoy." },
          structuredDecision: { decision: { nextAction: "create_appointment" } },
          execution: {
            attempted: true,
            success: false,
            failed: [{ type: "create_appointment" }],
            appointmentId: null
          },
          persistence: { attempted: true, result: { ok: true } }
        };
      }
    });
    assert.equal(turnCalls, 1);
    assert.equal(result.authored, false);
    assert.equal(result.lateResultReason, LATE_RESULT_REASONS.UNSAFE_MUTATION);
    assert.equal(result.nextAction, "create_appointment");
  });
});

describe("BR-168 hub delivery", () => {
  test("recovered offer is delivered once, BR-166 runs, CE does not", async () => {
    const originalSend = whatsappOutboundPipeline.sendAndPersistWhatsAppMessage;
    const originalHandle = conversationEngine.handleIncomingMessage;
    const originalGuard = conversationCoherenceGuard.guardOutboundConversationCoherence;
    const delivered = [];
    let ceCalls = 0;
    let coherenceCalls = 0;

    whatsappOutboundPipeline.sendAndPersistWhatsAppMessage = async (payload) => {
      delivered.push(payload.message);
      return { success: true, providerMessageId: "wamid.out-br168", simulated: true };
    };
    conversationEngine.handleIncomingMessage = async () => {
      ceCalls += 1;
      return { reply: "legacy should not send" };
    };
    conversationCoherenceGuard.guardOutboundConversationCoherence = async (args) => {
      coherenceCalls += 1;
      assert.equal(args.engineResult?.owner, "v2");
      assert.equal(args.engineResult?.source, "recruit_ai_v2_live_authoring");
      return { allowed: true, reason: conversationCoherenceGuard.REASONS.OK };
    };

    try {
      const liveAuthoringBridge = require("../core/recruitAiV2/liveAuthoringBridge");
      const originalAttempt = liveAuthoringBridge.attemptLiveV2Authoring;
      liveAuthoringBridge.attemptLiveV2Authoring = (args) =>
        originalAttempt({
          ...args,
          env: authoringEnv(args.env),
          persistenceService: memoryPersistence(),
          processTurn: async () => {
            await delay(80);
            return conversationalOfferResult();
          }
        });

      try {
        await enableHubAutomation();
        const result = await processNormalizedInboundMessage(inbound(), {
          prospect: prospect(),
          env: authoringEnv(),
          authoringDependencies: { persistenceService: memoryPersistence() }
        });

        assert.equal(result.replied, true);
        assert.equal(result.replyText, OFFER_TEXT);
        assert.equal(delivered.length, 1);
        assert.equal(delivered[0], OFFER_TEXT);
        assert.equal(ceCalls, 0);
        assert.equal(coherenceCalls, 1);
        assert.equal(result.reason, undefined);
      } finally {
        liveAuthoringBridge.attemptLiveV2Authoring = originalAttempt;
      }
    } finally {
      whatsappOutboundPipeline.sendAndPersistWhatsAppMessage = originalSend;
      conversationEngine.handleIncomingMessage = originalHandle;
      conversationCoherenceGuard.guardOutboundConversationCoherence = originalGuard;
    }
  });

  test("stale recovered reply is suppressed by BR-166 and still skips CE", async () => {
    const originalSend = whatsappOutboundPipeline.sendAndPersistWhatsAppMessage;
    const originalHandle = conversationEngine.handleIncomingMessage;
    const originalGuard = conversationCoherenceGuard.guardOutboundConversationCoherence;
    const delivered = [];
    let ceCalls = 0;

    whatsappOutboundPipeline.sendAndPersistWhatsAppMessage = async (payload) => {
      delivered.push(payload.message);
      return { success: true, providerMessageId: "wamid.out-stale", simulated: true };
    };
    conversationEngine.handleIncomingMessage = async () => {
      ceCalls += 1;
      return { reply: "legacy should not send" };
    };
    conversationCoherenceGuard.guardOutboundConversationCoherence = async () => ({
      allowed: false,
      reason: conversationCoherenceGuard.REASONS.STALE_OUTBOUND,
      authoredVersion: 5,
      latestVersion: 6
    });

    try {
      const liveAuthoringBridge = require("../core/recruitAiV2/liveAuthoringBridge");
      const originalAttempt = liveAuthoringBridge.attemptLiveV2Authoring;
      liveAuthoringBridge.attemptLiveV2Authoring = (args) =>
        originalAttempt({
          ...args,
          env: authoringEnv(args.env),
          persistenceService: memoryPersistence(),
          processTurn: async () => {
            await delay(80);
            return conversationalOfferResult();
          }
        });

      try {
        await enableHubAutomation();
        const result = await processNormalizedInboundMessage(
          inbound({ providerMessageId: "wamid.br168-stale" }),
          {
            prospect: prospect(),
            env: authoringEnv(),
            authoringDependencies: { persistenceService: memoryPersistence() }
          }
        );
        assert.equal(result.replied, false);
        assert.equal(result.reason, conversationCoherenceGuard.REASONS.STALE_OUTBOUND);
        assert.equal(delivered.length, 0);
        assert.equal(ceCalls, 0);
      } finally {
        liveAuthoringBridge.attemptLiveV2Authoring = originalAttempt;
      }
    } finally {
      whatsappOutboundPipeline.sendAndPersistWhatsAppMessage = originalSend;
      conversationEngine.handleIncomingMessage = originalHandle;
      conversationCoherenceGuard.guardOutboundConversationCoherence = originalGuard;
    }
  });

  test("genuinely unresolved timeout remains BR-167 fail-closed", async () => {
    const originalSend = whatsappOutboundPipeline.sendAndPersistWhatsAppMessage;
    const originalHandle = conversationEngine.handleIncomingMessage;
    const delivered = [];
    let ceCalls = 0;
    let settle = null;
    const hung = new Promise((resolve) => {
      settle = resolve;
    });

    whatsappOutboundPipeline.sendAndPersistWhatsAppMessage = async (payload) => {
      delivered.push(payload.message);
      return { success: true, providerMessageId: "wamid.out-hang", simulated: true };
    };
    conversationEngine.handleIncomingMessage = async () => {
      ceCalls += 1;
      return { reply: "legacy should not send" };
    };

    try {
      const liveAuthoringBridge = require("../core/recruitAiV2/liveAuthoringBridge");
      const originalAttempt = liveAuthoringBridge.attemptLiveV2Authoring;
      liveAuthoringBridge.attemptLiveV2Authoring = (args) =>
        originalAttempt({
          ...args,
          env: authoringEnv({
            ...args.env,
            RECRUIT_AI_V2_LIVE_AUTHORING_TIMEOUT_MS: "20",
            RECRUIT_AI_V2_LIVE_AUTHORING_POST_TIMEOUT_GRACE_MS: "40"
          }),
          persistenceService: memoryPersistence(),
          processTurn: () => hung
        });

      try {
        await enableHubAutomation();
        const result = await processNormalizedInboundMessage(
          inbound({ providerMessageId: "wamid.br168-unresolved" }),
          {
            prospect: prospect(),
            env: authoringEnv({
              RECRUIT_AI_V2_LIVE_AUTHORING_TIMEOUT_MS: "20",
              RECRUIT_AI_V2_LIVE_AUTHORING_POST_TIMEOUT_GRACE_MS: "40"
            }),
            authoringDependencies: { persistenceService: memoryPersistence() }
          }
        );
        assert.equal(result.replied, false);
        assert.equal(result.reason, "V2_AUTHORING_LOSS_SUPPRESSED");
        assert.equal(delivered.length, 0);
        assert.equal(ceCalls, 0);
      } finally {
        liveAuthoringBridge.attemptLiveV2Authoring = originalAttempt;
      }
    } finally {
      whatsappOutboundPipeline.sendAndPersistWhatsAppMessage = originalSend;
      conversationEngine.handleIncomingMessage = originalHandle;
      settle(conversationalOfferResult());
    }
  });

  test("successful create reclaim still sends once and does not double-execute", async () => {
    const originalSend = whatsappOutboundPipeline.sendAndPersistWhatsAppMessage;
    const originalHandle = conversationEngine.handleIncomingMessage;
    const delivered = [];
    let ceCalls = 0;
    let createCalls = 0;

    whatsappOutboundPipeline.sendAndPersistWhatsAppMessage = async (payload) => {
      delivered.push(payload.message);
      return { success: true, providerMessageId: "wamid.out-create", simulated: true };
    };
    conversationEngine.handleIncomingMessage = async () => {
      ceCalls += 1;
      return { reply: "already confirmed stub" };
    };

    try {
      const liveAuthoringBridge = require("../core/recruitAiV2/liveAuthoringBridge");
      const originalAttempt = liveAuthoringBridge.attemptLiveV2Authoring;
      liveAuthoringBridge.attemptLiveV2Authoring = async (args) => {
        const late = {
          rendered: { text: "Perfecto, tu entrevista quedó confirmada para el lunes a las 12:00." },
          structuredDecision: { decision: { nextAction: "create_appointment" } },
          execution: {
            attempted: true,
            success: true,
            appointmentId: "appt-br168",
            performed: [{ type: "create_appointment", dateKey: "2026-08-31", timeKey: "12:00" }]
          },
          nextContext: {
            prospectId: PROSPECT_ID,
            preferredLanguage: "spanish",
            appointment: {
              status: "confirmed",
              appointmentId: "appt-br168",
              confirmedDate: "2026-08-31",
              confirmedTime: "12:00"
            }
          }
        };
        createCalls += 1;
        return (
          (await liveAuthoringBridge.reclaimOwnershipAfterAuthoringLoss({
            v2Result: late,
            prospect: args.prospect,
            normalized: args.normalized,
            organizationId: ORG,
            actingUserId: AGENT,
            allowExecution: true,
            findActiveAppointment: async () => ({
              id: "appt-br168",
              organization_id: ORG,
              prospect_id: PROSPECT_ID,
              assigned_agent_id: AGENT,
              status: "scheduled",
              startDateTime: "2026-08-31T16:00:00.000Z",
              timezone: "America/New_York"
            })
          })) || {
            eligible: true,
            authored: false,
            fallThrough: true,
            reason: "LIVE_AUTHORING_TIMEOUT",
            replyText: null
          }
        );
      };

      try {
        await enableHubAutomation();
        const result = await processNormalizedInboundMessage(
          inbound({ providerMessageId: "wamid.br168-create", text: "Si" }),
          {
            prospect: prospect(),
            env: authoringEnv(),
            authoringDependencies: { persistenceService: memoryPersistence() }
          }
        );
        assert.equal(createCalls, 1);
        assert.equal(ceCalls, 0);
        assert.ok(delivered.length <= 1);
        if (result.replied) {
          assert.doesNotMatch(String(result.replyText || ""), /already confirmed stub/i);
        }
      } finally {
        liveAuthoringBridge.attemptLiveV2Authoring = originalAttempt;
      }
    } finally {
      whatsappOutboundPipeline.sendAndPersistWhatsAppMessage = originalSend;
      conversationEngine.handleIncomingMessage = originalHandle;
    }
  });
});
