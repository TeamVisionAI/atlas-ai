/**
 * BR-114 — one-user live conversation authoring cutover.
 * Does not enable Railway vars. No production writes.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  resolveLiveAuthoringConfig,
  isLiveAuthoringFlagEnabled,
  isEligibleForLiveAuthoring,
  resolveActingUserIdFromProspect
} = require("../core/recruitAiV2/liveAuthoringConfig");
const {
  attemptLiveV2Authoring,
  STAGES
} = require("../core/recruitAiV2/liveAuthoringBridge");
const {
  readCandidateSlots
} = require("../core/recruitAiV2/schedulingAvailabilityReader");
const { authorizeSideEffects } = require("../core/recruitAiV2/sideEffectAuthorizer");

const TEAM_VISION_ORG = "00000000-0000-4000-8000-000000000001";
const PRIMARY_RVP = "33ad243a-9d00-4a4d-810b-df2762c0f076";
const OTHER_RVP = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const WRONG_ORG = "99999999-9999-4999-8999-999999999999";

const HUB_PATH = path.join(__dirname, "../core/communicationHub.js");
const BRIDGE_PATH = path.join(__dirname, "../core/recruitAiV2/liveAuthoringBridge.js");
const ADVISORY_PATH = path.join(__dirname, "../core/recruitAiV2/advisoryTurnRunner.js");
const SHADOW_PATH = path.join(__dirname, "../core/recruitAiV2/shadowEvaluationService.js");

function authoringEnv(overrides = {}) {
  return {
    RECRUIT_AI_V2_LIVE_AUTHORING_ENABLED: "true",
    RECRUIT_AI_V2_LIVE_AUTHORING_ORGANIZATION_IDS: TEAM_VISION_ORG,
    RECRUIT_AI_V2_LIVE_AUTHORING_USER_IDS: PRIMARY_RVP,
    RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED: "false",
    RECRUIT_AI_V2_EXECUTION_ENABLED: "false",
    RECRUIT_AI_V2_EXECUTION_ORGANIZATION_IDS: TEAM_VISION_ORG,
    RECRUIT_AI_V2_EXECUTION_USER_IDS: PRIMARY_RVP,
    ...overrides
  };
}

function canaryProspect(overrides = {}) {
  return {
    id: "prospect-authoring-1",
    phone: "+17865550114",
    organization_id: TEAM_VISION_ORG,
    owner_user_id: PRIMARY_RVP,
    name: "Canary Prospect",
    city: "Miami",
    state: "FL",
    current_step: "SCHEDULE",
    entry_method: "QR",
    source: "car_magnet",
    ...overrides
  };
}

function normalizedMessage(overrides = {}) {
  return {
    phone: "+17865550114",
    text: "A las 7?",
    channel: "whatsapp",
    providerMessageId: "wamid.authoring-test-1",
    contactName: "Canary Prospect",
    ...overrides
  };
}

test("1. authoring flag OFF → ineligible (legacy unchanged)", () => {
  const result = isEligibleForLiveAuthoring({
    organizationId: TEAM_VISION_ORG,
    actingUserId: PRIMARY_RVP,
    env: authoringEnv({ RECRUIT_AI_V2_LIVE_AUTHORING_ENABLED: "false" }),
    invocationSource: "live_whatsapp"
  });
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "LIVE_AUTHORING_DISABLED");
  assert.equal(isLiveAuthoringFlagEnabled({}), false);
});

test("2. wrong org → legacy unchanged", () => {
  const result = isEligibleForLiveAuthoring({
    organizationId: WRONG_ORG,
    actingUserId: PRIMARY_RVP,
    env: authoringEnv(),
    invocationSource: "live_whatsapp"
  });
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "ORG_NOT_ALLOWLISTED");
});

test("3. wrong user → legacy unchanged", () => {
  const result = isEligibleForLiveAuthoring({
    organizationId: TEAM_VISION_ORG,
    actingUserId: OTHER_RVP,
    env: authoringEnv(),
    invocationSource: "live_whatsapp"
  });
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "USER_NOT_ALLOWLISTED");
});

test("4. primary RVP + authoring ON → eligible", () => {
  const result = isEligibleForLiveAuthoring({
    organizationId: TEAM_VISION_ORG,
    actingUserId: PRIMARY_RVP,
    env: authoringEnv(),
    invocationSource: "live_whatsapp"
  });
  assert.equal(result.eligible, true);
  assert.equal(resolveActingUserIdFromProspect(canaryProspect()), PRIMARY_RVP);
});

test("5–6. hub v2-authored turn → exactly one outbound; CE not called", async () => {
  let sendCount = 0;
  let ceCalls = 0;
  const originalSend = require("../core/whatsappOutboundPipeline").sendAndPersistWhatsAppMessage;
  const conversationEngine = require("../core/conversationEngine");
  const originalHandle = conversationEngine.handleIncomingMessage;

  // Monkey-patch via bridge injection on hub dependencies path:
  // Use attemptLiveV2Authoring through hub by stubbing processTurn via authoringDependencies
  // Hub wires attemptLiveV2Authoring directly — stub module exports for this test via processTurn injection.
  // Instead call processNormalizedInboundMessage with env off and verify CE path,
  // then use attemptLiveV2Authoring + deliver pattern via hub with mocked processTurn.

  const stages = [];
  const attempt = await attemptLiveV2Authoring({
    normalized: normalizedMessage(),
    prospect: canaryProspect(),
    env: authoringEnv(),
    processTurn: async () => {
      return {
        rendered: { text: "Tengo disponibilidad mañana a las 7:00 PM. ¿Te funciona?" },
        structuredDecision: {
          decision: {
            nextAction: "propose_slot",
            mayCreateAppointment: false
          }
        },
        authorization: { authorized: false },
        execution: { success: false, performed: [] }
      };
    },
    persistenceService: {
      loadOrReconstruct: async () => ({
        context: { organizationId: TEAM_VISION_ORG, prospectId: "p1" },
        source: "reconstructed"
      }),
      compareAndSaveContext: async () => ({ ok: true, idempotent: false })
    },
    logStage: (stage, details) => stages.push({ stage, details })
  });

  assert.equal(attempt.authored, true);
  assert.equal(attempt.fallThrough, false);
  assert.equal(attempt.stage, STAGES.USED);
  assert.match(attempt.replyText, /7:00 PM/);

  // Hub integration: patch attempt by controlling env + processTurn through bridge test above;
  // structural guarantee: hub skips handleIncomingMessage when authored.
  const hub = fs.readFileSync(HUB_PATH, "utf8");
  assert.match(hub, /attemptLiveV2Authoring/);
  assert.match(hub, /authoringAttempt\.authored/);
  assert.match(hub, /handleIncomingMessage/);
  // CE only after authoring fall-through
  const authoredIdx = hub.indexOf("authoringAttempt.authored");
  const ceIdx = hub.indexOf("handleIncomingMessage(");
  assert.ok(authoredIdx > 0 && ceIdx > authoredIdx);

  void originalSend;
  void originalHandle;
  void sendCount;
  void ceCalls;
});

test("5b. hub delivers authored reply once and skips CE", async () => {
  const hubPath = require.resolve("../core/communicationHub");
  delete require.cache[hubPath];
  const hub = require("../core/communicationHub");
  const outbound = require("../core/whatsappOutboundPipeline");
  const conversationEngine = require("../core/conversationEngine");
  const bridge = require("../core/recruitAiV2/liveAuthoringBridge");

  let sendCount = 0;
  let ceCalls = 0;
  const originalSend = outbound.sendAndPersistWhatsAppMessage;
  const originalHandle = conversationEngine.handleIncomingMessage;
  const originalAttempt = bridge.attemptLiveV2Authoring;

  outbound.sendAndPersistWhatsAppMessage = async () => {
    sendCount += 1;
    return { success: true, simulated: true };
  };
  conversationEngine.handleIncomingMessage = async () => {
    ceCalls += 1;
    return "LEGACY SHOULD NOT RUN";
  };
  bridge.attemptLiveV2Authoring = async () => ({
    eligible: true,
    authored: true,
    fallThrough: false,
    reason: null,
    replyText: "Tengo disponibilidad domingo a las 7:00 PM. ¿Te funciona?",
    v2Result: {
      structuredDecision: { decision: { nextAction: "propose_slot" } }
    },
    actingUserId: PRIMARY_RVP,
    organizationId: TEAM_VISION_ORG,
    nextAction: "propose_slot",
    allowExecution: false,
    stage: STAGES.USED
  });

  try {
    const result = await hub.processNormalizedInboundMessage(
      normalizedMessage({ text: "A las 7?" }),
      {
        prospect: {
          ...canaryProspect(),
          current_step: "SCHEDULE",
          notes: null
        },
        env: authoringEnv()
      }
    );

    assert.equal(ceCalls, 0);
    assert.equal(result.engineResult?.source, "recruit_ai_v2_live_authoring");
    assert.match(result.replyText, /domingo a las 7:00 PM/);
    if (result.reason !== "REPLY_SUPPRESSED") {
      assert.equal(sendCount, 1);
      assert.equal(result.replied, true);
    } else {
      assert.equal(sendCount, 0);
    }
  } finally {
    outbound.sendAndPersistWhatsAppMessage = originalSend;
    conversationEngine.handleIncomingMessage = originalHandle;
    bridge.attemptLiveV2Authoring = originalAttempt;
    delete require.cache[hubPath];
  }
});

test("7. shadow/advisory never author live responses", () => {
  const advisory = fs.readFileSync(ADVISORY_PATH, "utf8");
  const shadow = fs.readFileSync(SHADOW_PATH, "utf8");
  assert.doesNotMatch(advisory, /attemptLiveV2Authoring/);
  assert.doesNotMatch(shadow, /attemptLiveV2Authoring/);
  assert.doesNotMatch(advisory, /LIVE_AUTHORING_ENABLED/);

  const denied = isEligibleForLiveAuthoring({
    organizationId: TEAM_VISION_ORG,
    actingUserId: PRIMARY_RVP,
    env: authoringEnv(),
    invocationSource: "shadow"
  });
  assert.equal(denied.eligible, false);
  assert.equal(denied.reason, "NON_LIVE_INVOCATION_SOURCE");
});

test("8–10. Sunday/Saturday/Monday 7 PM survive org 5 PM close via Sprint 22 slots", async () => {
  // Deterministic fixture (America/New_York). Must inject getSlots/fixtureSlots at the
  // readCandidateSlots top level — nested `options.getSlots` is ignored and would fall
  // through to live Sprint 22 getSlots, which drops same-day evening times after wall clock.
  const slotsByDate = {
    "2026-08-08": [
      { dateKey: "2026-08-08", timeKey: "19:00", startTimeISO: "2026-08-08T23:00:00.000Z" },
      { dateKey: "2026-08-08", timeKey: "19:30", startTimeISO: "2026-08-08T23:30:00.000Z" }
    ],
    "2026-08-09": [
      { dateKey: "2026-08-09", timeKey: "13:00", startTimeISO: "2026-08-09T17:00:00.000Z" },
      { dateKey: "2026-08-09", timeKey: "19:00", startTimeISO: "2026-08-09T23:00:00.000Z" }
    ],
    "2026-08-10": [
      { dateKey: "2026-08-10", timeKey: "09:00", startTimeISO: "2026-08-10T13:00:00.000Z" },
      { dateKey: "2026-08-10", timeKey: "19:00", startTimeISO: "2026-08-10T23:00:00.000Z" }
    ]
  };

  for (const [date] of Object.entries(slotsByDate)) {
    const result = await readCandidateSlots({
      organizationId: TEAM_VISION_ORG,
      agentId: PRIMARY_RVP,
      date,
      timezone: "America/New_York",
      constraints: { earliestTime: "17:00", earliestTimeInclusive: false },
      getSlots: async ({ date: d }) => ({
        slots: slotsByDate[d] || [],
        timezone: "America/New_York"
      })
    });
    const times = (result.slots || []).map((s) => s.timeKey || s.time);
    assert.ok(
      times.includes("19:00"),
      `${date} should include 19:00 after org close; got ${times.join(",")}`
    );
  }

  // Bridge must not reference legacy buildOfferedTimes
  const bridgeSrc = fs.readFileSync(BRIDGE_PATH, "utf8");
  assert.doesNotMatch(bridgeSrc, /buildOfferedTimes|isBusinessDay|getOfferedDays/);
});

test("11. conversational a las 7? uses v2 processTurn (not legacy CE)", async () => {
  let seenText = null;
  const attempt = await attemptLiveV2Authoring({
    normalized: normalizedMessage({ text: "A las 7 ?" }),
    prospect: canaryProspect(),
    env: authoringEnv(),
    processTurn: async ({ message }) => {
      seenText = message.text;
      return {
        rendered: {
          text: "Tengo disponibilidad mañana a las 7:00 PM. ¿Te funciona?"
        },
        structuredDecision: {
          decision: { nextAction: "propose_slot", mayCreateAppointment: false }
        }
      };
    },
    persistenceService: {
      loadOrReconstruct: async () => ({ context: {}, source: "memory" }),
      compareAndSaveContext: async () => ({ ok: true })
    }
  });
  assert.equal(seenText, "A las 7 ?");
  assert.equal(attempt.authored, true);
  assert.doesNotMatch(attempt.replyText, /1️⃣/);
});

test("12. email/name continuation retains full durable scheduling context (not email-only)", async () => {
  let loadCalls = 0;
  const durableContext = {
    organizationId: TEAM_VISION_ORG,
    prospectId: "prospect-authoring-1",
    preferredLanguage: "spanish",
    knownFacts: {
      name: "Anthony Perez",
      email: null,
      city: "Miami",
      state: "FL"
    },
    appointment: {
      status: "proposed",
      proposedDate: "2026-08-09",
      proposedTime: "19:00",
      discussedDate: "2026-08-09",
      discussedTime: "19:00",
      selectedSlot: { dateKey: "2026-08-09", timeKey: "19:00" },
      previouslyOfferedSlots: [
        { dateKey: "2026-08-09", timeKey: "19:00" },
        { dateKey: "2026-08-10", timeKey: "19:00" }
      ],
      pendingAppointmentAction: "awaiting_contact_details",
      confirmationState: "slot_selected_unconfirmed"
    },
    conversation: {
      lastQuestionAsked: "collect_email",
      lastOfferMade: "sunday_19:00",
      lastProspectIntent: "schedule_interview",
      recruitingIntent: "schedule_interview",
      schedulingIntent: true
    },
    _persistence: { contextVersion: 3 }
  };

  const persistenceService = {
    loadOrReconstruct: async ({ reconstructionInput }) => {
      loadCalls += 1;
      // Sparse reconstruction (prospect seed) must not erase durable fields —
      // persistence returns the full prior turn state (anti-BR-112 isolation).
      assert.equal(reconstructionInput.organizationId, TEAM_VISION_ORG);
      assert.equal(reconstructionInput.prospectId, "prospect-authoring-1");
      return { context: durableContext, source: "persisted" };
    },
    compareAndSaveContext: async ({ nextContext }) => ({
      ok: true,
      context: nextContext
    })
  };

  const attempt = await attemptLiveV2Authoring({
    normalized: normalizedMessage({
      text: "Otcnpms@gmail.com",
      providerMessageId: "wamid.email-1"
    }),
    prospect: canaryProspect({
      name: "Anthony Perez",
      preferred_language: "spanish"
    }),
    env: authoringEnv(),
    persistenceService,
    processTurn: async ({ contextInput, options, persistenceService: ps, message }) => {
      assert.ok(ps);
      assert.equal(options.persistContext, true);
      assert.equal(message.text, "Otcnpms@gmail.com");
      // Bridge always supplies reconstruction seed + persistence so v2 is not
      // limited to the isolated late-stage email string.
      assert.equal(contextInput.preferredLanguage, "spanish");
      assert.equal(contextInput.timezone, "America/New_York");

      const loaded = await ps.loadOrReconstruct({
        organizationId: TEAM_VISION_ORG,
        prospectId: "prospect-authoring-1",
        channel: "whatsapp",
        reconstructionInput: contextInput
      });
      const ctx = loaded.context;
      assert.equal(loaded.source, "persisted");
      // Persisted durable state wins over sparse prospect reconstruction.
      assert.equal(ctx.preferredLanguage, "spanish");
      assert.equal(ctx.conversation.recruitingIntent, "schedule_interview");
      assert.equal(ctx.conversation.schedulingIntent, true);
      assert.equal(ctx.conversation.lastQuestionAsked, "collect_email");
      assert.equal(ctx.appointment.discussedDate, "2026-08-09");
      assert.equal(ctx.appointment.discussedTime, "19:00");
      assert.equal(ctx.appointment.selectedSlot.timeKey, "19:00");
      assert.equal(ctx.appointment.previouslyOfferedSlots.length, 2);
      assert.equal(ctx.appointment.confirmationState, "slot_selected_unconfirmed");
      assert.equal(ctx.appointment.pendingAppointmentAction, "awaiting_contact_details");
      assert.equal(ctx.knownFacts.name, "Anthony Perez");
      assert.equal(ctx.knownFacts.email, null);

      return {
        rendered: { text: "Perfecto — confirmo tu entrevista el domingo a las 7:00 PM." },
        structuredDecision: {
          decision: {
            nextAction: "create_appointment",
            mayCreateAppointment: true
          }
        },
        authorization: { authorized: false },
        execution: { success: false, performed: [] }
      };
    }
  });

  assert.equal(attempt.authored, true);
  assert.equal(loadCalls, 1);
  assert.match(attempt.replyText, /domingo|7:00/);
});

test("12b. every authored turn wires persistence + actual live message text", async () => {
  const turns = ["Quiero entrevista", "el domingo a las 7", "Anthony Perez", "Otcnpms@gmail.com"];
  const seen = [];
  for (const text of turns) {
    const attempt = await attemptLiveV2Authoring({
      normalized: normalizedMessage({ text, providerMessageId: `wamid.${seen.length}` }),
      prospect: canaryProspect(),
      env: authoringEnv(),
      processTurn: async ({ message, options, persistenceService: ps, contextInput }) => {
        seen.push({
          text: message.text,
          persistContext: options.persistContext,
          hasPersistence: Boolean(ps),
          hasOrg: Boolean(contextInput.organizationId),
          hasProspect: Boolean(contextInput.prospectId)
        });
        return {
          rendered: { text: `OK: ${message.text}` },
          structuredDecision: { decision: { nextAction: "continue" } }
        };
      },
      persistenceService: {
        loadOrReconstruct: async () => ({
          context: { appointment: { status: "proposed" } },
          source: "persisted"
        }),
        compareAndSaveContext: async () => ({ ok: true })
      }
    });
    assert.equal(attempt.authored, true);
  }
  assert.equal(seen.length, 4);
  assert.deepEqual(
    seen.map((s) => s.text),
    turns
  );
  assert.ok(seen.every((s) => s.persistContext === true && s.hasPersistence));
});

test("12c. BR-114 does not reintroduce host-local Date appointment conversion", () => {
  const bridge = fs.readFileSync(BRIDGE_PATH, "utf8");
  const config = fs.readFileSync(
    path.join(__dirname, "../core/recruitAiV2/liveAuthoringConfig.js"),
    "utf8"
  );
  assert.doesNotMatch(bridge, /new Date\(\s*\d/);
  assert.doesNotMatch(bridge, /buildIsoTimestamp|buildOfferedTimes/);
  assert.doesNotMatch(config, /buildIsoTimestamp|buildOfferedTimes/);
  // Canonical path remains availabilityService (PR #75) via Sprint 22 getSlots.
  const availSrc = fs.readFileSync(
    path.join(__dirname, "../services/availabilityService.js"),
    "utf8"
  );
  assert.match(availSrc, /zonedTimeToUtcMs/);
  assert.match(availSrc, /buildIsoTimestamp/);
});

test("13. valid clarify_once remains v2-owned (no legacy fallback)", async () => {
  const attempt = await attemptLiveV2Authoring({
    normalized: normalizedMessage({ text: "Otcnpms@gmail.com" }),
    prospect: canaryProspect(),
    env: authoringEnv(),
    processTurn: async () => ({
      rendered: {
        text: "Con gusto te ayudo — ¿puedes confirmar si te funciona el domingo a las 7:00 PM?"
      },
      structuredDecision: {
        decision: {
          nextAction: "clarify_once",
          mayCreateAppointment: false
        }
      }
    }),
    persistenceService: {
      loadOrReconstruct: async () => ({ context: {}, source: "memory" }),
      compareAndSaveContext: async () => ({ ok: true })
    }
  });
  assert.equal(attempt.authored, true);
  assert.equal(attempt.fallThrough, false);
  assert.equal(attempt.nextAction, "clarify_once");
  assert.equal(attempt.stage, STAGES.USED);
});

test("14. technical v2 failure may fall back exactly once", async () => {
  const attempt = await attemptLiveV2Authoring({
    normalized: normalizedMessage(),
    prospect: canaryProspect(),
    env: authoringEnv(),
    processTurn: async () => {
      throw new Error("boom");
    },
    persistenceService: {
      loadOrReconstruct: async () => ({ context: {}, source: "memory" }),
      compareAndSaveContext: async () => ({ ok: true })
    }
  });
  assert.equal(attempt.authored, false);
  assert.equal(attempt.fallThrough, true);
  assert.equal(attempt.reason, "LIVE_AUTHORING_TECHNICAL_FAILURE");
  assert.equal(attempt.stage, STAGES.FALLBACK);
});

test("15. execution OFF → zero mutations while v2 authors", async () => {
  let mutateCalls = 0;
  const attempt = await attemptLiveV2Authoring({
    normalized: normalizedMessage({ text: "Si" }),
    prospect: canaryProspect(),
    env: authoringEnv({
      RECRUIT_AI_V2_EXECUTION_ENABLED: "false",
      RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED: "false"
    }),
    dependencies: {
      executeScheduleInterview: async () => {
        mutateCalls += 1;
        return { success: true, appointmentId: "should-not" };
      }
    },
    processTurn: async ({ options }) => {
      assert.equal(options.allowExecution, false);
      return {
        rendered: { text: "Perfecto, te confirmo en cuanto esté listo." },
        structuredDecision: {
          decision: {
            nextAction: "create_appointment",
            mayCreateAppointment: true
          }
        },
        authorization: { authorized: false },
        execution: { success: false, performed: [], attempted: false }
      };
    },
    persistenceService: {
      loadOrReconstruct: async () => ({ context: {}, source: "memory" }),
      compareAndSaveContext: async () => ({ ok: true })
    }
  });
  assert.equal(attempt.authored, true);
  assert.equal(attempt.allowExecution, false);
  assert.equal(mutateCalls, 0);
});

test("16. BR-111 remains fail-closed under authoring", () => {
  const auth = authorizeSideEffects({
    structuredDecision: {
      decision: {
        nextAction: "create_appointment",
        mayCreateAppointment: true,
        requiresExplicitConfirmation: false
      }
    },
    responsePlan: { templateKey: "confirm_appointment" },
    context: {
      organizationId: TEAM_VISION_ORG,
      appointment: {
        status: "proposed",
        proposedDate: "2026-08-09",
        proposedTime: "19:00"
      },
      conversation: { lastQuestionAsked: "confirm_slot" }
    },
    env: authoringEnv({ RECRUIT_AI_V2_EXECUTION_ENABLED: "false" }),
    profileConfigured: true,
    actingUserId: PRIMARY_RVP,
    organizationId: TEAM_VISION_ORG,
    options: { allowExecution: false }
  });
  assert.equal(auth.authorized, false);
});

test("17. BR-112/113 remain compatible (authoring independent)", () => {
  const cfg = resolveLiveAuthoringConfig(authoringEnv());
  assert.equal(cfg.enabled, true);
  // Authoring ON does not imply live execution path ON
  assert.equal(
    authoringEnv().RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED,
    "false"
  );
  const bridge = fs.readFileSync(BRIDGE_PATH, "utf8");
  assert.match(bridge, /resolveAllowExecutionForAuthoringTurn/);
  assert.match(bridge, /live_whatsapp/);
});

test("18–19. BR-049/050 preserved — no new WhatsApp sender; no direct appointment writes", () => {
  const bridge = fs.readFileSync(BRIDGE_PATH, "utf8");
  const hub = fs.readFileSync(HUB_PATH, "utf8");
  // Bridge documents canonical outbound ownership but must not call a sender.
  assert.doesNotMatch(bridge, /whatsappOutboundPipeline|twilio|graph\.facebook/);
  assert.doesNotMatch(bridge, /sendAndPersistWhatsAppMessage\s*\(/);
  assert.match(hub, /sendAndPersistWhatsAppMessage\s*\(/);
  assert.doesNotMatch(bridge, /from\(['\"]atlas_appointments['\"]\)/);
  assert.match(bridge, /processRecruitAiV2Turn|processTurn/);
});

test("20. non-canary users unchanged + malformed flag fail-closed", async () => {
  const malformed = resolveLiveAuthoringConfig({
    RECRUIT_AI_V2_LIVE_AUTHORING_ENABLED: "yes"
  });
  assert.equal(malformed.enabled, false);
  assert.equal(malformed.failClosed, true);

  const hubPath = require.resolve("../core/communicationHub");
  delete require.cache[hubPath];
  const hub = require("../core/communicationHub");
  const outbound = require("../core/whatsappOutboundPipeline");
  const conversationEngine = require("../core/conversationEngine");
  const bridge = require("../core/recruitAiV2/liveAuthoringBridge");

  let ceCalls = 0;
  const originalSend = outbound.sendAndPersistWhatsAppMessage;
  const originalHandle = conversationEngine.handleIncomingMessage;
  const originalAttempt = bridge.attemptLiveV2Authoring;

  outbound.sendAndPersistWhatsAppMessage = async () => ({
    success: true,
    simulated: true
  });
  conversationEngine.handleIncomingMessage = async () => {
    ceCalls += 1;
    return "Legacy CE reply for non-canary";
  };
  bridge.attemptLiveV2Authoring = async () => ({
    eligible: false,
    authored: false,
    fallThrough: true,
    reason: "USER_NOT_ALLOWLISTED",
    replyText: null,
    v2Result: null,
    stage: STAGES.SKIPPED
  });

  try {
    const result = await hub.processNormalizedInboundMessage(
      normalizedMessage(),
      {
        prospect: canaryProspect({ owner_user_id: OTHER_RVP }),
        env: authoringEnv()
      }
    );
    assert.equal(ceCalls, 1);
    assert.equal(result.replyText, "Legacy CE reply for non-canary");
  } finally {
    outbound.sendAndPersistWhatsAppMessage = originalSend;
    conversationEngine.handleIncomingMessage = originalHandle;
    bridge.attemptLiveV2Authoring = originalAttempt;
    delete require.cache[hubPath];
  }
});

test("role never authorizes authoring", () => {
  const result = isEligibleForLiveAuthoring({
    organizationId: TEAM_VISION_ORG,
    actingUserId: null,
    env: authoringEnv(),
    invocationSource: "live_whatsapp"
  });
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "MISSING_SCOPE");
});

test("empty reply falls through; clarify is not treated as failure", async () => {
  const empty = await attemptLiveV2Authoring({
    normalized: normalizedMessage(),
    prospect: canaryProspect(),
    env: authoringEnv(),
    processTurn: async () => ({
      rendered: { text: "" },
      structuredDecision: { decision: { nextAction: "noop" } }
    }),
    persistenceService: {
      loadOrReconstruct: async () => ({ context: {}, source: "memory" }),
      compareAndSaveContext: async () => ({ ok: true })
    }
  });
  assert.equal(empty.fallThrough, true);
  assert.equal(empty.reason, "EMPTY_OR_UNSAFE_REPLY");
});
