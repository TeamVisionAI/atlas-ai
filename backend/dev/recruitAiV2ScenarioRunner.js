/**
 * Recruit AI v2 Workflow Simulator scenario runner.
 * Ephemeral in-memory context only — never writes production tables,
 * never sends WhatsApp, never books appointments, never mutates BR-080.
 *
 * Uses the SAME interpretation → decision → plan → render → authorizer
 * pipeline as production shadow (`processRecruitAiV2TurnSync`).
 */

const {
  processRecruitAiV2TurnSync,
  createConversationContext,
  authorizeSideEffects,
  isMetaReviewScope
} = require("../core/recruitAiV2");

const SIM_PROSPECT_PREFIX = "sim-v2-";
const FIXTURE_PROSPECT_PREFIX = "fixture-";
const PHONE_LIKE = /\+?\d[\d\s().-]{7,}\d/;

function assertSafeSimulatorIdentity({ prospectId, organizationId } = {}) {
  const pid = String(prospectId || "");
  if (
    !pid.startsWith(SIM_PROSPECT_PREFIX) &&
    !pid.startsWith(FIXTURE_PROSPECT_PREFIX)
  ) {
    const error = new Error(
      "Recruit AI v2 simulator rejects non-simulator prospect IDs"
    );
    error.code = "SIMULATOR_IDENTITY_REJECTED";
    error.statusCode = 400;
    throw error;
  }

  if (isMetaReviewScope({ organizationId, prospectId: pid })) {
    const error = new Error(
      "Recruit AI v2 simulator rejects Meta Review production fixtures"
    );
    error.code = "SIMULATOR_META_REVIEW_REJECTED";
    error.statusCode = 400;
    throw error;
  }
}

function sanitizeInputText(text) {
  const raw = String(text || "");
  if (PHONE_LIKE.test(raw)) {
    const error = new Error(
      "Recruit AI v2 simulator rejects phone-like inbound text"
    );
    error.code = "SIMULATOR_PII_REJECTED";
    error.statusCode = 400;
    throw error;
  }
  return raw.trim();
}

function diffKnownFacts(before = {}, after = {}) {
  const keys = new Set([
    ...Object.keys(before || {}),
    ...Object.keys(after || {})
  ]);
  const changes = {};
  for (const key of keys) {
    if (
      ["cityCertainty", "stateCertainty", "proposedState", "name", "city", "state", "preferredMeetingType", "fullName"].includes(
        key
      ) &&
      before?.[key] !== after?.[key]
    ) {
      changes[key] = { from: before?.[key] ?? null, to: after?.[key] ?? null };
    }
  }
  return changes;
}

function evaluateExpect(actual, expect = {}) {
  const failures = [];

  function check(path, got, wanted) {
    if (wanted === undefined) {
      return;
    }
    if (got !== wanted) {
      failures.push({ path, expected: wanted, actual: got });
    }
  }

  check("intent", actual.intent, expect.intent);
  if (expect.notIntent != null && actual.intent === expect.notIntent) {
    failures.push({
      path: "notIntent",
      expected: `not ${expect.notIntent}`,
      actual: actual.intent
    });
  }

  check("messageLanguage", actual.messageLanguage, expect.messageLanguage);
  check("preferredLanguage", actual.preferredLanguage, expect.preferredLanguage);
  check("shouldEscalate", actual.shouldEscalate, expect.shouldEscalate);
  check("nextAction", actual.nextAction, expect.nextAction);
  check("city", actual.city, expect.city);
  check("state", actual.state, expect.state);
  check("cityCertainty", actual.cityCertainty, expect.cityCertainty);
  check("stateCertainty", actual.stateCertainty, expect.stateCertainty);
  check("proposedState", actual.proposedState, expect.proposedState);
  check("requiresClarification", actual.requiresClarification, expect.requiresClarification);
  check("stage", actual.stage, expect.stage);
  check("meetingType", actual.meetingType, expect.meetingType);
  check("authorizationAuthorized", actual.authorizationAuthorized, expect.authorizationAuthorized);
  check("contextAdvanced", actual.contextAdvanced, expect.contextAdvanced);
  check("idempotent", actual.idempotent, expect.idempotent);

  if (expect.noDayPartScheduling === true) {
    if (actual.stage === "scheduling" || actual.nextAction === "clarify_day_part") {
      failures.push({
        path: "noDayPartScheduling",
        expected: "not scheduling/day-part jump",
        actual: `${actual.stage}/${actual.nextAction}`
      });
    }
  }

  if (expect.sideEffectsDenied === true && actual.authorizationAuthorized !== false) {
    failures.push({
      path: "sideEffectsDenied",
      expected: false,
      actual: actual.authorizationAuthorized
    });
  }

  return { pass: failures.length === 0, failures };
}

function createEphemeralSession(seed = {}) {
  assertSafeSimulatorIdentity(seed);

  const context = createConversationContext({
    prospectId: seed.prospectId,
    organizationId: seed.organizationId || "sim-org-team-vision",
    preferredLanguage: seed.preferredLanguage || "english",
    languageMeta: seed.languageMeta || { source: seed.languageSource || "inferred" },
    timezone: seed.timezone || "America/New_York",
    knownFacts: seed.knownFacts || {},
    appointment: seed.appointment || {},
    conversation: seed.conversation || {},
    attention: seed.attention || {},
    currentStage: seed.currentStage || "greeting"
  });

  return {
    context,
    contextVersion: 1,
    seenInboundIds: new Map(),
    writes: {
      productionContextRows: 0,
      shadowEvaluationRows: 0,
      whatsappSends: 0,
      appointmentWrites: 0,
      calendarWrites: 0,
      br080Mutations: 0
    }
  };
}

/**
 * Run one inbound turn against the production v2 sync pipeline (ephemeral).
 */
function runV2SimulatorTurn(session, turn = {}, options = {}) {
  if (!session?.context) {
    throw new Error("ephemeral session required");
  }

  const text = sanitizeInputText(turn.text);
  const inboundMessageId =
    turn.inboundMessageId ||
    `sim-wamid.${session.context.prospectId}.${turn.id || Date.now()}`;

  if (turn.setup) {
    const setupConversation = {
      ...session.context.conversation,
      ...(turn.setup.conversation || {})
    };
    if (turn.setup.lastQuestionAsked) {
      setupConversation.lastQuestionAsked = turn.setup.lastQuestionAsked;
    }
    if (turn.setup.lastAtlasOutboundText) {
      setupConversation.lastAtlasOutboundText = turn.setup.lastAtlasOutboundText;
    }
    // Allow explicit clarification reset for independent fragment cases.
    if (
      turn.setup.conversation &&
      Object.prototype.hasOwnProperty.call(turn.setup.conversation, "clarificationCount")
    ) {
      setupConversation.clarificationCount = turn.setup.conversation.clarificationCount;
    }
    if (
      turn.setup.conversation &&
      Object.prototype.hasOwnProperty.call(turn.setup.conversation, "pendingClarification")
    ) {
      setupConversation.pendingClarification = turn.setup.conversation.pendingClarification;
    }
    if (
      turn.setup.conversation &&
      Object.prototype.hasOwnProperty.call(turn.setup.conversation, "counterofferMismatchCount")
    ) {
      setupConversation.counterofferMismatchCount =
        turn.setup.conversation.counterofferMismatchCount;
    }

    session.context = {
      ...session.context,
      ...(turn.setup.currentStage
        ? { currentStage: turn.setup.currentStage }
        : {}),
      knownFacts: {
        ...session.context.knownFacts,
        ...(turn.setup.knownFacts || {})
      },
      appointment: {
        ...session.context.appointment,
        ...(turn.setup.appointment || {})
      },
      conversation: setupConversation,
      languageMeta: {
        ...session.context.languageMeta,
        ...(turn.setup.languageMeta || {})
      },
      ...(turn.setup.preferredLanguage
        ? { preferredLanguage: turn.setup.preferredLanguage }
        : {})
    };
  }

  const prior = session.seenInboundIds.get(inboundMessageId);
  if (prior) {
    return {
      ...prior,
      idempotent: true,
      contextAdvanced: false,
      turnId: turn.id || null,
      prospectInput: text
    };
  }

  const beforeFacts = { ...(session.context.knownFacts || {}) };
  const beforeVersion = session.contextVersion;

  // Force deny-all regardless of production Railway env.
  const forcedEnv = {
    RECRUIT_AI_V2_EXECUTION_ENABLED: "false",
    RECRUIT_AI_V2_SHADOW_ENABLED: "false"
  };

  const startedAt = Date.now();
  const result = processRecruitAiV2TurnSync({
    message: { id: inboundMessageId, text },
    context: session.context,
    options: {
      flexible: true,
      env: forcedEnv,
      ...(options.explicitLanguagePreference
        ? { explicitLanguagePreference: options.explicitLanguagePreference }
        : {}),
      ...(turn.options || {})
    },
    availability: turn.availability || null
  });
  const elapsedMs = Date.now() - startedAt;

  // Hard re-check authorizer for simulator report honesty.
  const authorization = authorizeSideEffects({
    structuredDecision: result.structuredDecision,
    responsePlan: result.responsePlan,
    env: forcedEnv
  });

  if (authorization.authorized === true) {
    const error = new Error("Simulator safety violation: side effects authorized");
    error.code = "SIMULATOR_SIDE_EFFECT_LEAK";
    throw error;
  }

  let nextContext = result.nextContext;
  nextContext = {
    ...nextContext,
    conversation: {
      ...nextContext.conversation,
      lastAtlasOutboundText: result.rendered?.text || null
    }
  };

  session.context = nextContext;
  session.contextVersion = beforeVersion + 1;

  const actual = {
    intent: result.interpretation?.intent || null,
    confidence: result.interpretation?.confidence ?? null,
    messageLanguage: result.interpretation?.messageLanguage || null,
    preferredLanguage:
      result.interpretation?.preferredLanguage || nextContext.preferredLanguage,
    shouldEscalate: Boolean(result.structuredDecision?.decision?.shouldEscalate),
    nextAction: result.structuredDecision?.decision?.nextAction || null,
    city: nextContext.knownFacts?.city ?? null,
    state: nextContext.knownFacts?.state ?? null,
    cityCertainty: nextContext.knownFacts?.cityCertainty || null,
    stateCertainty: nextContext.knownFacts?.stateCertainty || null,
    proposedState: nextContext.knownFacts?.proposedState ?? null,
    requiresClarification: Boolean(result.interpretation?.requiresClarification),
    stage: nextContext.currentStage || null,
    meetingType:
      nextContext.knownFacts?.preferredMeetingType ||
      nextContext.appointment?.meetingType ||
      null,
    authorizationAuthorized: authorization.authorized,
    contextAdvanced: true,
    idempotent: false,
    confirmationVersion: nextContext.conversation?.confirmationVersion ?? 0,
    proposedSideEffects: (authorization.proposals || []).map((p) => p.type),
    renderedText: String(result.rendered?.text || ""),
    renderedPreview: String(result.rendered?.text || "").slice(0, 160),
    templateKey: result.responsePlan?.templateKey || null,
    reasonCodes: result.structuredDecision?.reasonCodes || [],
    factChanges: diffKnownFacts(beforeFacts, nextContext.knownFacts),
    humanAttention: Boolean(nextContext.attention?.needsHumanAttention),
    pendingQuestion: nextContext.conversation?.lastQuestionAsked || null,
    appointmentStatus: nextContext.appointment?.status || null,
    elapsedMs
  };

  const assertion = evaluateExpect(actual, turn.expect || {});

  const turnReport = {
    turn: turn.id || null,
    turnNumber: turn.turnNumber || null,
    prospectInput: text,
    inboundMessageIdTail: inboundMessageId.slice(-16),
    preferredLanguage: actual.preferredLanguage,
    interpretedIntent: actual.intent,
    confidence: actual.confidence,
    currentStage: actual.stage,
    knownFactChanges: actual.factChanges,
    clarificationRequired: actual.requiresClarification,
    decision: actual.nextAction,
    proposedSideEffect: actual.proposedSideEffects[0] || null,
    proposedSideEffects: actual.proposedSideEffects,
    authorizationResult: "denied",
    expected: turn.expect || {},
    actual,
    pass: assertion.pass,
    failures: assertion.failures,
    renderedText: actual.renderedText,
    renderedPreview: actual.renderedPreview,
    pendingQuestion: actual.pendingQuestion,
    appointmentStatus: actual.appointmentStatus,
    reasonCodes: actual.reasonCodes,
    elapsedMs: actual.elapsedMs,
    detectedLanguage: actual.messageLanguage,
    humanEscalation: actual.shouldEscalate || actual.humanAttention,
    contextSnapshot: {
      stage: nextContext.currentStage,
      preferredLanguage: nextContext.preferredLanguage,
      languageMetaSource: nextContext.languageMeta?.source || null,
      knownFacts: {
        city: nextContext.knownFacts?.city || null,
        state: nextContext.knownFacts?.state || null,
        cityCertainty: nextContext.knownFacts?.cityCertainty || null,
        stateCertainty: nextContext.knownFacts?.stateCertainty || null,
        proposedState: nextContext.knownFacts?.proposedState || null,
        preferredMeetingType: nextContext.knownFacts?.preferredMeetingType || null
      },
      appointmentStatus: nextContext.appointment?.status || null,
      lastQuestionAsked: nextContext.conversation?.lastQuestionAsked || null,
      clarificationCount: nextContext.conversation?.clarificationCount || 0,
      needsHumanAttention: Boolean(nextContext.attention?.needsHumanAttention)
    },
    idempotent: false,
    contextAdvanced: true,
    persistence: {
      attempted: false,
      productionContextRows: 0,
      shadowEvaluationRows: 0
    },
    execution: {
      attempted: false,
      whatsapp: false,
      appointment: false,
      calendar: false,
      br080: false
    }
  };

  session.seenInboundIds.set(inboundMessageId, turnReport);
  return turnReport;
}

/**
 * Run a full scenario definition (ephemeral).
 */
function runRecruitAiV2Scenario(definition, options = {}) {
  if (!definition?.id || !Array.isArray(definition.turns)) {
    const error = new Error("Invalid Recruit AI v2 scenario definition");
    error.code = "INVALID_V2_SCENARIO";
    error.statusCode = 400;
    throw error;
  }

  const seed = {
    prospectId: `${SIM_PROSPECT_PREFIX}${definition.id}`,
    organizationId: definition.organizationId || "sim-org-team-vision",
    preferredLanguage: definition.seed?.preferredLanguage || "english",
    languageSource: definition.seed?.languageSource || "inferred",
    languageMeta: definition.seed?.languageMeta || null,
    knownFacts: definition.seed?.knownFacts || {},
    appointment: definition.seed?.appointment || {},
    conversation: definition.seed?.conversation || {},
    attention: definition.seed?.attention || {},
    currentStage: definition.seed?.currentStage || "greeting",
    timezone: definition.seed?.timezone || "America/New_York"
  };

  const session = createEphemeralSession(seed);
  const turns = [];
  let turnNumber = 0;

  for (const turn of definition.turns) {
    turnNumber += 1;
    const report = runV2SimulatorTurn(
      session,
      { ...turn, turnNumber },
      {
        explicitLanguagePreference: definition.seed?.explicitLanguagePreference || null
      }
    );
    turns.push(report);
  }

  const passed = turns.filter((t) => t.pass).length;
  const failed = turns.length - passed;

  return {
    scenarioId: definition.id,
    scenarioName: definition.name,
    simulator: true,
    recruitAiV2: true,
    ephemeral: true,
    pass: failed === 0,
    summary: {
      totalAssertions: turns.length,
      passed,
      failed,
      finalContextStage: session.context.currentStage || null,
      humanEscalation: Boolean(session.context.attention?.needsHumanAttention),
      sideEffectsDenied: true,
      contextVersion: session.contextVersion,
      productionWrites: session.writes
    },
    turns,
    finalContext: {
      stage: session.context.currentStage,
      preferredLanguage: session.context.preferredLanguage,
      knownFacts: {
        city: session.context.knownFacts?.city || null,
        state: session.context.knownFacts?.state || null,
        cityCertainty: session.context.knownFacts?.cityCertainty || null,
        stateCertainty: session.context.knownFacts?.stateCertainty || null,
        proposedState: session.context.knownFacts?.proposedState || null,
        preferredMeetingType:
          session.context.knownFacts?.preferredMeetingType || null
      },
      appointmentStatus: session.context.appointment?.status || null,
      needsHumanAttention: Boolean(session.context.attention?.needsHumanAttention)
    }
  };
}

function runAllRecruitAiV2Scenarios(definitions = []) {
  const reports = definitions.map((definition) => runRecruitAiV2Scenario(definition));
  const passed = reports.filter((r) => r.pass).length;
  return {
    success: true,
    simulator: true,
    recruitAiV2: true,
    ephemeral: true,
    ranAt: new Date().toISOString(),
    total: reports.length,
    passed,
    failed: reports.length - passed,
    reports
  };
}

module.exports = {
  SIM_PROSPECT_PREFIX,
  FIXTURE_PROSPECT_PREFIX,
  assertSafeSimulatorIdentity,
  createEphemeralSession,
  runV2SimulatorTurn,
  runRecruitAiV2Scenario,
  runAllRecruitAiV2Scenarios,
  evaluateExpect,
  sanitizeInputText
};
