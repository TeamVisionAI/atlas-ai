/**
 * Recruit AI v2 Custom Conversation Playground.
 * Interactive ephemeral sessions for Ops Center developers/admins.
 *
 * Uses the SAME v2 pipeline as shadow/simulator scenarios
 * (`createEphemeralSession` + `runV2SimulatorTurn`).
 *
 * Never writes production context/shadow tables or executes providers.
 *
 * Regression workflow:
 * Real defect → reproduce in playground → Save as Regression Candidate
 * → convert to deterministic scenario → fix → keep scenario green.
 */

const crypto = require("crypto");
const {
  SIM_PROSPECT_PREFIX,
  createEphemeralSession,
  runV2SimulatorTurn,
  sanitizeInputText,
  assertSafeSimulatorIdentity
} = require("./recruitAiV2ScenarioRunner");

const PLAYGROUND_TTL_MS = 60 * 60 * 1000;
const sessions = new Map();

const EXPECTATION_KEYS = [
  "greeting",
  "partial_location",
  "qualification",
  "counteroffer",
  "clarification",
  "reschedule",
  "cancellation",
  "human_escalation",
  "language_switch"
];

const SUGGESTED_PROMPTS = {
  spanish: [
    "Hola",
    "Miami",
    "Florida",
    "¿De qué se trata?",
    "6?",
    "6:30?",
    "Sí",
    "¿Lo podemos cambiar?"
  ],
  english: [
    "Hi",
    "I live in Tampa",
    "Florida",
    "What is this about?",
    "Can we do 6?",
    "6:30 works",
    "Actually can we do Zoom?"
  ],
  fragments: ["La or", "idk", "maybe", "later", "not sure", "por la", "mañ"],
  unexpected: [
    "How much money do I make?",
    "Is this insurance?",
    "Do I need a license?",
    "I changed my mind",
    "Stop texting me"
  ]
};

function pruneExpiredSessions(now = Date.now()) {
  for (const [id, session] of sessions.entries()) {
    if (now - (session.updatedAt || session.createdAt || 0) > PLAYGROUND_TTL_MS) {
      sessions.delete(id);
    }
  }
}

function resolveLanguageSeed(initialLanguage = "auto") {
  const mode = String(initialLanguage || "auto").toLowerCase();
  if (mode === "english" || mode === "en") {
    return {
      preferredLanguage: "english",
      languageSource: "explicit",
      languageMeta: { source: "explicit" },
      explicitLanguagePreference: "english"
    };
  }
  if (mode === "spanish" || mode === "es") {
    return {
      preferredLanguage: "spanish",
      languageSource: "explicit",
      languageMeta: { source: "explicit" },
      explicitLanguagePreference: "spanish"
    };
  }
  // Auto — inferred/default English until prospect signals otherwise.
  return {
    preferredLanguage: "english",
    languageSource: "inferred",
    languageMeta: { source: "inferred" },
    explicitLanguagePreference: null
  };
}

function resolveMeetingSeed(meetingContext = "none") {
  const mode = String(meetingContext || "none").toLowerCase();
  if (mode === "appointment_proposed" || mode === "proposed") {
    return {
      currentStage: "proposed",
      appointment: {
        status: "proposed",
        proposedTime: "17:00",
        previouslyOfferedSlots: [
          { date: null, time: "17:00", timezone: "America/New_York" }
        ]
      },
      conversation: {
        lastQuestionAsked: "confirm_slot",
        lastAtlasOutboundText: "Does 5:00 PM work for a quick interview?"
      }
    };
  }
  if (mode === "appointment_confirmed" || mode === "confirmed") {
    return {
      currentStage: "confirmed",
      appointment: {
        status: "confirmed",
        confirmedTime: "17:00",
        appointmentId: "sim-appt-playground"
      },
      conversation: {
        lastAtlasOutboundText: "Your interview is confirmed for 5:00 PM."
      }
    };
  }
  return {
    currentStage: "greeting",
    appointment: {},
    conversation: {}
  };
}

function sanitizeContextSnapshot(context = {}, contextVersion = 1) {
  return {
    stage: context.currentStage || null,
    preferredLanguage: context.preferredLanguage || null,
    languageMetaSource: context.languageMeta?.source || null,
    knownFacts: {
      city: context.knownFacts?.city || null,
      state: context.knownFacts?.state || null,
      cityCertainty: context.knownFacts?.cityCertainty || null,
      stateCertainty: context.knownFacts?.stateCertainty || null,
      proposedState: context.knownFacts?.proposedState || null,
      preferredMeetingType: context.knownFacts?.preferredMeetingType || null
    },
    lastQuestion: context.conversation?.lastQuestionAsked || null,
    lastProspectIntent: context.conversation?.lastProspectIntent || null,
    lastOffer: context.appointment?.proposedTime ||
      context.appointment?.previouslyOfferedSlots?.[0]?.time ||
      null,
    appointment: {
      status: context.appointment?.status || null,
      proposedTime: context.appointment?.proposedTime || null,
      confirmedTime: context.appointment?.confirmedTime || null,
      meetingType: context.appointment?.meetingType || null
    },
    humanAttention: {
      needsHumanAttention: Boolean(context.attention?.needsHumanAttention),
      reason: context.attention?.reason || null
    },
    contextVersion
  };
}

function evaluateExpectation(expectation, turnReport, priorPreferredLanguage) {
  if (!expectation) {
    return null;
  }

  const key = String(expectation).toLowerCase().replace(/\s+/g, "_");
  if (!EXPECTATION_KEYS.includes(key)) {
    const error = new Error(`Unknown playground expectation: ${expectation}`);
    error.code = "PLAYGROUND_EXPECTATION_INVALID";
    error.statusCode = 400;
    throw error;
  }

  const actual = turnReport.actual || {};
  let pass = false;
  let detail = "";

  switch (key) {
    case "greeting":
      pass =
        actual.intent === "greeting" ||
        actual.nextAction === "continue_after_greeting";
      detail = `intent=${actual.intent} nextAction=${actual.nextAction}`;
      break;
    case "partial_location":
      pass =
        actual.intent === "provide_location" &&
        (actual.requiresClarification === true ||
          actual.cityCertainty === "partial" ||
          actual.stateCertainty !== "confirmed");
      detail = `intent=${actual.intent} cityCertainty=${actual.cityCertainty}`;
      break;
    case "qualification":
      pass =
        actual.stage === "qualification" ||
        actual.nextAction === "continue_qualification";
      detail = `stage=${actual.stage} nextAction=${actual.nextAction}`;
      break;
    case "counteroffer":
      pass =
        actual.intent === "scheduling_counteroffer" ||
        actual.nextAction === "acknowledge_counteroffer";
      detail = `intent=${actual.intent}`;
      break;
    case "clarification":
      pass = actual.requiresClarification === true;
      detail = `requiresClarification=${actual.requiresClarification}`;
      break;
    case "reschedule":
      pass =
        actual.intent === "reschedule_request" ||
        actual.stage === "rescheduling" ||
        actual.nextAction === "enter_reschedule";
      detail = `intent=${actual.intent} stage=${actual.stage}`;
      break;
    case "cancellation":
      pass =
        actual.intent === "cancel_request" ||
        actual.nextAction === "acknowledge_cancel";
      detail = `intent=${actual.intent}`;
      break;
    case "human_escalation":
      pass =
        actual.shouldEscalate === true ||
        actual.humanAttention === true ||
        turnReport.humanEscalation === true;
      detail = `shouldEscalate=${actual.shouldEscalate}`;
      break;
    case "language_switch":
      pass =
        Boolean(priorPreferredLanguage) &&
        actual.preferredLanguage &&
        actual.preferredLanguage !== priorPreferredLanguage;
      detail = `${priorPreferredLanguage}→${actual.preferredLanguage}`;
      break;
    default:
      pass = false;
  }

  return {
    expectation: key,
    pass,
    detail,
    label: pass ? "PASS" : "FAIL"
  };
}

function buildDiagnostics(turnReport, expectationResult) {
  return {
    detectedLanguage: turnReport.detectedLanguage || turnReport.actual?.messageLanguage || null,
    preferredConversationLanguage: turnReport.preferredLanguage || null,
    interpretedIntent: turnReport.interpretedIntent || null,
    confidence: turnReport.confidence,
    currentStage: turnReport.currentStage || null,
    clarificationRequired: Boolean(turnReport.clarificationRequired),
    knownFactsChanged: turnReport.knownFactChanges || {},
    appointmentState: turnReport.appointmentStatus || null,
    pendingQuestion: turnReport.pendingQuestion || null,
    decisionCode: turnReport.decision || null,
    proposedSideEffect: turnReport.proposedSideEffect || null,
    authorizationResult: turnReport.authorizationResult || "denied",
    humanEscalationState: Boolean(turnReport.humanEscalation),
    safeReasonCodes: Array.isArray(turnReport.reasonCodes)
      ? turnReport.reasonCodes
      : [],
    elapsedMs: turnReport.elapsedMs ?? null,
    expectation: expectationResult
  };
}

function toPublicSession(session) {
  return {
    sessionId: session.sessionId,
    playground: true,
    recruitAiV2: true,
    ephemeral: true,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    initialLanguage: session.initialLanguage,
    meetingContext: session.meetingContext,
    turnCount: session.turns.length,
    writes: { ...session.ephemeral.writes },
    context: sanitizeContextSnapshot(
      session.ephemeral.context,
      session.ephemeral.contextVersion
    ),
    turns: session.turns,
    suggestedPrompts: SUGGESTED_PROMPTS,
    expectations: EXPECTATION_KEYS
  };
}

function createPlaygroundSession(options = {}) {
  pruneExpiredSessions();

  if (options.prospectId) {
    assertSafeSimulatorIdentity({
      prospectId: options.prospectId,
      organizationId: options.organizationId || "sim-org-team-vision"
    });
  }

  const sessionId = `sim-v2-playground-${crypto.randomUUID()}`;
  const languageSeed = resolveLanguageSeed(options.initialLanguage);
  const meetingSeed = resolveMeetingSeed(options.meetingContext);
  const now = new Date().toISOString();

  const ephemeral = createEphemeralSession({
    prospectId: `${SIM_PROSPECT_PREFIX}playground-${crypto.randomUUID().slice(0, 8)}`,
    organizationId: "sim-org-team-vision",
    preferredLanguage: languageSeed.preferredLanguage,
    languageSource: languageSeed.languageSource,
    languageMeta: languageSeed.languageMeta,
    knownFacts: {},
    appointment: meetingSeed.appointment,
    conversation: meetingSeed.conversation,
    attention: {},
    currentStage: meetingSeed.currentStage,
    timezone: "America/New_York"
  });

  const session = {
    sessionId,
    createdAt: now,
    updatedAt: now,
    initialLanguage: String(options.initialLanguage || "auto").toLowerCase(),
    meetingContext: String(options.meetingContext || "none").toLowerCase(),
    explicitLanguagePreference: languageSeed.explicitLanguagePreference,
    ephemeral,
    turns: []
  };

  sessions.set(sessionId, session);
  return toPublicSession(session);
}

function getPlaygroundSession(sessionId) {
  pruneExpiredSessions();
  const session = sessions.get(String(sessionId || ""));
  if (!session) {
    const error = new Error("Playground session not found or expired");
    error.code = "PLAYGROUND_SESSION_NOT_FOUND";
    error.statusCode = 404;
    throw error;
  }
  return toPublicSession(session);
}

function resetPlaygroundSession(sessionId, options = {}) {
  const existing = sessions.get(String(sessionId || ""));
  if (!existing) {
    return createPlaygroundSession(options);
  }

  sessions.delete(sessionId);
  return createPlaygroundSession({
    initialLanguage: options.initialLanguage || existing.initialLanguage,
    meetingContext: options.meetingContext || existing.meetingContext
  });
}

function sendPlaygroundTurn(sessionId, payload = {}) {
  pruneExpiredSessions();
  const session = sessions.get(String(sessionId || ""));
  if (!session) {
    const error = new Error("Playground session not found or expired");
    error.code = "PLAYGROUND_SESSION_NOT_FOUND";
    error.statusCode = 404;
    throw error;
  }

  const text = sanitizeInputText(payload.text || payload.message || "");
  if (!text) {
    const error = new Error("Prospect message is required");
    error.code = "PLAYGROUND_EMPTY_MESSAGE";
    error.statusCode = 400;
    throw error;
  }

  // Extra guard: reject credential-like / Meta-payload blobs.
  if (/access_token|EAA[A-Za-z0-9]|wamid\./i.test(text) && /[{[]/.test(text)) {
    const error = new Error(
      "Playground rejects credential-like or raw provider payload text"
    );
    error.code = "PLAYGROUND_PAYLOAD_REJECTED";
    error.statusCode = 400;
    throw error;
  }

  const priorPreferredLanguage = session.ephemeral.context.preferredLanguage;
  const turnNumber = session.turns.length + 1;
  const turnId = `pg-${turnNumber}`;

  const turnReport = runV2SimulatorTurn(
    session.ephemeral,
    {
      id: turnId,
      turnNumber,
      text,
      inboundMessageId: `sim-wamid.playground.${session.sessionId}.${turnNumber}`
    },
    {
      explicitLanguagePreference: session.explicitLanguagePreference
    }
  );

  const expectationResult = evaluateExpectation(
    payload.expectation || null,
    turnReport,
    priorPreferredLanguage
  );

  const diagnostics = buildDiagnostics(turnReport, expectationResult);

  const publicTurn = {
    turnNumber,
    turnId,
    prospectInput: text,
    atlasProposedReply: turnReport.renderedText || turnReport.renderedPreview || "",
    diagnostics,
    pass:
      expectationResult == null ? null : Boolean(expectationResult.pass),
    failures: turnReport.failures || [],
    persistence: turnReport.persistence,
    execution: turnReport.execution,
    idempotent: Boolean(turnReport.idempotent)
  };

  session.turns.push(publicTurn);
  session.updatedAt = new Date().toISOString();

  return {
    success: true,
    playground: true,
    recruitAiV2: true,
    ephemeral: true,
    sessionId: session.sessionId,
    turn: publicTurn,
    context: sanitizeContextSnapshot(
      session.ephemeral.context,
      session.ephemeral.contextVersion
    ),
    writes: { ...session.ephemeral.writes },
    sideEffectsDenied: true
  };
}

function buildRegressionCandidate(sessionId) {
  const session = sessions.get(String(sessionId || ""));
  if (!session) {
    const error = new Error("Playground session not found or expired");
    error.code = "PLAYGROUND_SESSION_NOT_FOUND";
    error.statusCode = 404;
    throw error;
  }

  const candidateId = `candidate-${new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 19)}`;

  const turns = session.turns.map((turn) => {
    const expectation = turn.diagnostics?.expectation?.expectation || null;
    const expect = {};
    if (expectation === "greeting") {
      expect.intent = "greeting";
      expect.shouldEscalate = false;
    } else if (expectation === "partial_location") {
      expect.intent = "provide_location";
      expect.requiresClarification = true;
    } else if (expectation === "counteroffer") {
      expect.intent = "scheduling_counteroffer";
    } else if (expectation === "clarification") {
      expect.requiresClarification = true;
    } else if (expectation === "reschedule") {
      expect.intent = "reschedule_request";
    } else if (expectation === "cancellation") {
      expect.intent = "cancel_request";
    } else if (expectation === "human_escalation") {
      expect.shouldEscalate = true;
    } else if (expectation === "qualification") {
      expect.stage = "qualification";
    } else if (expectation === "language_switch") {
      expect.preferredLanguage = turn.diagnostics?.preferredConversationLanguage;
    }

    return {
      id: turn.turnId,
      text: turn.prospectInput,
      expect: Object.keys(expect).length ? expect : undefined,
      observed: {
        intent: turn.diagnostics?.interpretedIntent || null,
        decision: turn.diagnostics?.decisionCode || null,
        stage: turn.diagnostics?.currentStage || null,
        preferredLanguage: turn.diagnostics?.preferredConversationLanguage || null,
        clarificationRequired: turn.diagnostics?.clarificationRequired || false,
        humanEscalation: turn.diagnostics?.humanEscalationState || false,
        authorizationResult: turn.diagnostics?.authorizationResult || "denied",
        proposedSideEffect: turn.diagnostics?.proposedSideEffect || null,
        expectationResult: turn.diagnostics?.expectation || null
      }
    };
  });

  const payload = {
    kind: "recruit_ai_v2_regression_candidate",
    candidateId,
    generatedAt: new Date().toISOString(),
    note:
      "Sanitized playground export. Convert manually into recruitAiV2ScenarioDefinitions.js — do not auto-write BR files from the browser.",
    seed: {
      preferredLanguage:
        session.initialLanguage === "spanish"
          ? "spanish"
          : session.initialLanguage === "english"
            ? "english"
            : "english",
      languageSource:
        session.initialLanguage === "auto" ? "inferred" : "explicit",
      meetingContext: session.meetingContext,
      currentStage:
        session.meetingContext === "appointment_confirmed"
          ? "confirmed"
          : session.meetingContext === "appointment_proposed"
            ? "proposed"
            : "greeting"
    },
    turns,
    finalContext: sanitizeContextSnapshot(
      session.ephemeral.context,
      session.ephemeral.contextVersion
    ),
    safety: {
      ephemeral: true,
      productionContextRows: 0,
      shadowEvaluationRows: 0,
      whatsappSends: 0,
      appointmentWrites: 0,
      calendarWrites: 0,
      br080Mutations: 0,
      piiExcluded: true
    }
  };

  // Reject clear phone patterns (avoid matching ISO timestamps / times).
  const serialized = JSON.stringify(payload);
  const phoneLeak =
    /\+\d{7,}/.test(serialized) ||
    /\(\d{3}\)\s*\d{3}[-.\s]?\d{4}/.test(serialized) ||
    /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/.test(serialized);
  if (phoneLeak) {
    const error = new Error("Regression candidate failed PII sanitization");
    error.code = "PLAYGROUND_CANDIDATE_PII";
    error.statusCode = 500;
    throw error;
  }

  return {
    success: true,
    playground: true,
    candidate: payload,
    copyText: JSON.stringify(payload, null, 2)
  };
}

function listPlaygroundMeta() {
  return {
    expectations: EXPECTATION_KEYS,
    suggestedPrompts: SUGGESTED_PROMPTS,
    meetingContexts: ["none", "appointment_proposed", "appointment_confirmed"],
    initialLanguages: ["auto", "english", "spanish"]
  };
}

/** Test helper — clear in-memory sessions. */
function _resetPlaygroundStoreForTests() {
  sessions.clear();
}

module.exports = {
  EXPECTATION_KEYS,
  SUGGESTED_PROMPTS,
  createPlaygroundSession,
  getPlaygroundSession,
  resetPlaygroundSession,
  sendPlaygroundTurn,
  buildRegressionCandidate,
  listPlaygroundMeta,
  sanitizeContextSnapshot,
  evaluateExpectation,
  _resetPlaygroundStoreForTests
};
