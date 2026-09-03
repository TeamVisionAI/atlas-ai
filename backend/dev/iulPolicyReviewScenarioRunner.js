/**
 * BR-223 — IUL Policy Review Workflow Simulator runner.
 * Dry-run: real IUL engine, fixture availability, no production writes.
 * Staging E2E: guarded Atlas Staging calendar writes only.
 */

"use strict";

const {
  processRecruitAiV2Turn,
  processRecruitAiV2TurnSync,
  createConversationContext,
  authorizeSideEffects
} = require("../core/recruitAiV2");
const { collectInteractiveOptionParts } = require("../core/whatsappInteractiveMessage");
const { isIulDaySelectionId } = require("../core/recruitAiV2/iulDayFirstScheduling");
const { isIulSlotSelectionId } = require("../core/recruitAiV2/iulSlotSelection");
const { IUL_OPTION_IDS } = require("../core/recruitAiV2/iulQualificationOptions");
const { evaluateExpect } = require("./recruitAiV2ScenarioRunner");
const {
  createSimulatorRunId,
  cleanupStagingSimulatorEvents,
  getStagingEventByRunId,
  createStagingBookingDependencies,
  certifyIulStagingBooking
} = require("./iulStagingE2EService");
const { resolveStagingCalendarConfig } = require("./iulStagingCalendarGuard");
const {
  createIulStagingBookingGrant,
  IUL_STAGING_E2E_INVOCATION_SOURCE
} = require("./iulStagingBookingGrant");
const { FRESH_IUL_INTAKE_MATCH, IUL_CODE } = require("./iulSimulatorShared");
const { REASON_CODES } = require("../core/recruitAiV2/constants");

const SIM_IUL_PREFIX = "sim-iul-";
const PHONE_LIKE = /\+?\d[\d\s().-]{7,}\d/;

function assertSafeIulSimulatorIdentity({ prospectId } = {}) {
  const pid = String(prospectId || "");
  if (!pid.startsWith(SIM_IUL_PREFIX)) {
    const error = new Error("IUL simulator rejects non-simulator prospect IDs");
    error.code = "IUL_SIMULATOR_IDENTITY_REJECTED";
    error.statusCode = 400;
    throw error;
  }
}

function sanitizeInputText(text) {
  const raw = String(text || "");
  if (PHONE_LIKE.test(raw)) {
    const error = new Error("IUL simulator rejects phone-like inbound text");
    error.code = "IUL_SIMULATOR_PII_REJECTED";
    error.statusCode = 400;
    throw error;
  }
  return raw.trim();
}

function createIulEphemeralSession(seed = {}) {
  assertSafeIulSimulatorIdentity(seed);

  const context = createConversationContext({
    prospectId: seed.prospectId,
    organizationId: seed.organizationId,
    preferredLanguage: seed.preferredLanguage || "spanish",
    languageMeta: seed.languageMeta || { source: seed.languageSource || "inferred" },
    timezone: seed.timezone || "America/New_York",
    knownFacts: seed.knownFacts || {},
    appointment: seed.appointment || {},
    conversation: seed.conversation || {},
    attention: seed.attention || {},
    currentStage: seed.currentStage || "greeting",
    conversationGoal: seed.conversationGoal || null,
    campaignKind: seed.campaignKind || null,
    campaignIntakePurpose: seed.campaignIntakePurpose || null,
    ...(seed.testNow ? { _testNow: new Date(seed.testNow) } : {}),
    ...(seed.agentId ? { agentId: seed.agentId } : {}),
    ...(seed.prospectOwnerUserId ? { prospectOwnerUserId: seed.prospectOwnerUserId } : {}),
    ...(seed.orgDefaultRecruiterUserId
      ? { orgDefaultRecruiterUserId: seed.orgDefaultRecruiterUserId }
      : {}),
    ...(seed.availabilityFixture ? { _availabilityFixture: seed.availabilityFixture } : {}),
    ...(seed._officeLocation ? { _officeLocation: seed._officeLocation } : {})
  });

  return {
    context,
    contextVersion: 1,
    availabilityFixture: seed.availabilityFixture || null,
    seenInboundIds: new Map(),
    writes: {
      productionContextRows: 0,
      shadowEvaluationRows: 0,
      whatsappSends: 0,
      appointmentWrites: 0,
      calendarWrites: 0,
      br080Mutations: 0
    },
    simulatorRunId: null,
    stagingEvent: null
  };
}

function extractInteractiveOptions(responsePlan) {
  const interactive =
    responsePlan?.interactive ||
    responsePlan?.entities?.interactive ||
    responsePlan?.entities?.whatsappInteractive ||
    null;
  if (!interactive) {
    return [];
  }
  return collectInteractiveOptionParts(interactive);
}

function extractIulDiagnostics(context = {}, result = {}) {
  const facts = context?.knownFacts || {};
  const decision = result.structuredDecision?.decision || {};
  const interactiveOptions = extractInteractiveOptions(result.responsePlan);

  return {
    intent: result.interpretation?.intent || null,
    reasonCodes: result.structuredDecision?.reasonCodes || [],
    lastQuestionAsked: context.conversation?.lastQuestionAsked || null,
    iulWorkflowStage: facts.iulWorkflowStage || null,
    iulQualificationStatus: facts.iulQualificationStatus || null,
    iulReviewIntent: facts.iulReviewIntent || null,
    meetingMode: facts.meetingMode || facts.reviewMeetingMode || null,
    selectedDate: facts.iulSelectedDate || null,
    selectedDaypart: facts.preferredDayPart || null,
    offeredDays:
      facts.iulOfferedDays ||
      result.responsePlan?.entities?.availableDays ||
      interactiveOptions.filter((o) => isIulDaySelectionId(o.id)).map((o) => o.id),
    offeredSlots:
      facts.iulOfferedSlots ||
      interactiveOptions.filter((o) => isIulSlotSelectionId(o.id)).map((o) => o.id),
    appointmentStatus: context.appointment?.status || null,
    bookingPending: Boolean(context.conversation?.bookingPending || facts.iulBookingPending),
    mayCreateAppointment: Boolean(decision.mayCreateAppointment),
    interactiveOptions,
    templateKey: result.responsePlan?.templateKey || null,
    nextAction: decision.nextAction || null
  };
}

function evaluateIulExpect(actual, expect = {}, diagnostics = {}) {
  const base = evaluateExpect(actual, expect);
  const failures = [...(base.failures || [])];

  function fail(path, expected, got) {
    failures.push({ path, expected, actual: got });
  }

  if (expect.hasDayPicker === true) {
    const dayIds = (diagnostics.interactiveOptions || []).filter((o) => isIulDaySelectionId(o.id));
    if (!dayIds.length) {
      fail("hasDayPicker", true, diagnostics.interactiveOptions?.map((o) => o.id) || []);
    }
  }

  if (expect.meetingMode != null && diagnostics.meetingMode !== expect.meetingMode) {
    fail("meetingMode", expect.meetingMode, diagnostics.meetingMode);
  }

  if (expect.iulQualificationStatus !== undefined) {
    if (diagnostics.iulQualificationStatus !== expect.iulQualificationStatus) {
      fail("iulQualificationStatus", expect.iulQualificationStatus, diagnostics.iulQualificationStatus);
    }
  }

  if (expect.lastQuestionAsked != null && diagnostics.lastQuestionAsked !== expect.lastQuestionAsked) {
    fail("lastQuestionAsked", expect.lastQuestionAsked, diagnostics.lastQuestionAsked);
  }

  if (expect.selectedDate != null && diagnostics.selectedDate !== expect.selectedDate) {
    fail("selectedDate", expect.selectedDate, diagnostics.selectedDate);
  }

  if (expect.preferredDayPart != null && diagnostics.selectedDaypart !== expect.preferredDayPart) {
    fail("preferredDayPart", expect.preferredDayPart, diagnostics.selectedDaypart);
  }

  if (expect.bookingPending === true && !diagnostics.bookingPending) {
    fail("bookingPending", true, diagnostics.bookingPending);
  }

  if (expect.appointmentStatus != null && diagnostics.appointmentStatus !== expect.appointmentStatus) {
    fail("appointmentStatus", expect.appointmentStatus, diagnostics.appointmentStatus);
  }

  if (Array.isArray(expect.reasonCodesInclude)) {
    for (const code of expect.reasonCodesInclude) {
      if (!(diagnostics.reasonCodes || []).includes(code)) {
        fail("reasonCodesInclude", code, diagnostics.reasonCodes);
      }
    }
  }

  const slotOptions = (diagnostics.interactiveOptions || []).filter((o) => isIulSlotSelectionId(o.id));
  if (expect.compactSlotCountMin != null && slotOptions.length < expect.compactSlotCountMin) {
    fail("compactSlotCountMin", expect.compactSlotCountMin, slotOptions.length);
  }
  if (expect.compactSlotCountMax != null && slotOptions.length > expect.compactSlotCountMax) {
    fail("compactSlotCountMax", expect.compactSlotCountMax, slotOptions.length);
  }

  if (expect.mayCreateAppointment === true && !diagnostics.mayCreateAppointment) {
    fail("mayCreateAppointment", true, diagnostics.mayCreateAppointment);
  }

  if (Array.isArray(expect.replyIncludes)) {
    for (const fragment of expect.replyIncludes) {
      if (!String(actual.renderedText || "").includes(fragment)) {
        fail("replyIncludes", fragment, String(actual.renderedText || "").slice(0, 200));
      }
    }
  }

  if (Array.isArray(expect.replyExcludes)) {
    for (const fragment of expect.replyExcludes) {
      if (String(actual.renderedText || "").includes(fragment)) {
        fail("replyExcludes", `not ${fragment}`, String(actual.renderedText || "").slice(0, 200));
      }
    }
  }

  return { pass: failures.length === 0, failures };
}

function buildTurnActual(result, nextContext, authorization, elapsedMs) {
  const decision = result.structuredDecision?.decision || {};
  return {
    intent: result.interpretation?.intent || null,
    messageLanguage: result.interpretation?.language || null,
    preferredLanguage: nextContext.preferredLanguage || null,
    shouldEscalate: Boolean(result.structuredDecision?.shouldEscalate),
    nextAction: decision.nextAction || null,
    stage: nextContext.currentStage || null,
    requiresClarification: Boolean(decision.requiresClarification),
    authorizationAuthorized: authorization.authorized,
    proposedSideEffects: (authorization.proposals || []).map((p) => p.type),
    renderedText: String(result.rendered?.text || ""),
    preferredDayPart: nextContext.knownFacts?.preferredDayPart || null,
    pendingQuestion: nextContext.conversation?.lastQuestionAsked || null,
    appointmentStatus: nextContext.appointment?.status || null,
    elapsedMs
  };
}

function applyTurnSetup(session, turn) {
  if (!turn.setup) {
    return;
  }

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

  session.context = {
    ...session.context,
    ...(turn.setup.currentStage ? { currentStage: turn.setup.currentStage } : {}),
    knownFacts: { ...session.context.knownFacts, ...(turn.setup.knownFacts || {}) },
    appointment: { ...session.context.appointment, ...(turn.setup.appointment || {}) },
    conversation: setupConversation,
    languageMeta: { ...session.context.languageMeta, ...(turn.setup.languageMeta || {}) },
    ...(turn.setup.preferredLanguage ? { preferredLanguage: turn.setup.preferredLanguage } : {})
  };

  if (turn.setup.availabilityFixture) {
    session.context = { ...session.context, _availabilityFixture: turn.setup.availabilityFixture };
    session.availabilityFixture = turn.setup.availabilityFixture;
  }
}

function runIulSimulatorTurn(session, turn = {}, options = {}) {
  if (!session?.context) {
    throw new Error("IUL ephemeral session required");
  }

  const text = sanitizeInputText(turn.text || turn.interactiveReply?.title || "");
  const inboundMessageId =
    turn.inboundMessageId || `sim-wamid.${session.context.prospectId}.${turn.id || Date.now()}`;

  applyTurnSetup(session, turn);

  const prior = session.seenInboundIds.get(inboundMessageId);
  if (prior) {
    return { ...prior, idempotent: true, contextAdvanced: false, prospectInput: text };
  }

  const stagingBooking = Boolean(options.stagingBooking && options.stagingGrant);
  const forcedEnv = {
    RECRUIT_AI_V2_EXECUTION_ENABLED: "false",
    RECRUIT_AI_V2_SHADOW_ENABLED: "false"
  };

  if (turn.setup?.availabilityFixture || session.availabilityFixture) {
    session.context = {
      ...session.context,
      _availabilityFixture:
        turn.setup?.availabilityFixture || session.availabilityFixture || session.context._availabilityFixture
    };
  }

  const startedAt = Date.now();
  const message = {
    id: inboundMessageId,
    text,
    ...(turn.interactiveReply ? { interactiveReply: turn.interactiveReply } : {}),
    ...(turn.campaignIntakeMatch ? { campaignIntakeMatch: turn.campaignIntakeMatch } : {})
  };

  const processOptions = {
    flexible: true,
    env: forcedEnv,
    persistContext: false,
    v2Grant: { eligible: false, reason: "IUL_SIMULATOR" },
    ...(session.context?._testNow ? { now: session.context._testNow } : {}),
    ...(turn.campaignIntakeMatch ? { campaignIntakeMatch: turn.campaignIntakeMatch } : {}),
    ...(session.context?._availabilityFixture || session.availabilityFixture
      ? {
          availabilityFixture:
            turn.setup?.availabilityFixture ||
            session.availabilityFixture ||
            session.context._availabilityFixture
        }
      : {}),
    ...(session.context?.agentId ? { agentId: session.context.agentId } : {}),
    ...(session.context?.prospectOwnerUserId
      ? { ownerUserId: session.context.prospectOwnerUserId }
      : {}),
    ...(options.getSlots ? { getSlots: options.getSlots } : {}),
    ...(options.stagingConfig
      ? {
          organizationId: options.stagingConfig.organizationId,
          profileConfigured: true,
          actingUserId: options.stagingConfig.userId
        }
      : {}),
    ...(stagingBooking
      ? {
          invocationSource: IUL_STAGING_E2E_INVOCATION_SOURCE,
          iulStagingE2EGrant: options.stagingGrant,
          allowExecution: true,
          profileConfigured: true,
          prospectPhone: options.prospectPhone || session.context.prospectPhone,
          inboundMessageId,
          dependencies: options.bookingDependencies || {},
          organizationId: options.stagingGrant.organizationId,
          actingUserId: options.stagingGrant.userId
        }
      : {})
  };

  const processor = options.async ? processRecruitAiV2Turn : processRecruitAiV2TurnSync;
  const resultPromise = processor({
    message,
    context: session.context,
    options: processOptions
  });

  return Promise.resolve(resultPromise).then((result) => {
    const authorization = result.authorization ||
      authorizeSideEffects({
        structuredDecision: result.structuredDecision,
        responsePlan: result.responsePlan,
        context: session.context,
        env: forcedEnv,
        profileConfigured: Boolean(options.stagingConfig),
        actingUserId: options.stagingConfig?.userId || session.context.agentId,
        organizationId: session.context.organizationId,
        options: processOptions
      });

    if (authorization.authorized && !stagingBooking) {
      const leak = new Error("IUL simulator side-effect leak");
      leak.code = "SIMULATOR_SIDE_EFFECT_LEAK";
      throw leak;
    }

    session.context = result.nextContext || session.context;
    session.contextVersion += 1;

    const elapsedMs = Date.now() - startedAt;
    const actual = buildTurnActual(result, session.context, authorization, elapsedMs);
    const diagnostics = extractIulDiagnostics(session.context, result);
    const assertion = evaluateIulExpect(actual, turn.expect || {}, diagnostics);

    const turnReport = {
      turn: turn.id || null,
      prospectInput: text,
      interactiveSelection: turn.interactiveReply || null,
      atlasReply: actual.renderedText,
      interactiveOptions: diagnostics.interactiveOptions,
      diagnostics,
      expected: turn.expect || {},
      actual,
      pass: assertion.pass,
      failures: assertion.failures,
      idempotent: false,
      contextAdvanced: true,
      persistence: {
        attempted: false,
        productionContextRows: 0,
        shadowEvaluationRows: 0
      },
      execution: {
        attempted: Boolean(result.execution?.attempted),
        whatsapp: false,
        appointment: Boolean(stagingBooking && result.execution?.success),
        calendar: Boolean(stagingBooking && result.execution?.success),
        br080: false,
        bookingPath: stagingBooking ? "executeScheduleInterview" : null,
        appointmentId: result.execution?.appointmentId || null,
        scheduleResult: result.execution?.scheduleResult || null
      },
      result
    };

    session.seenInboundIds.set(inboundMessageId, turnReport);
    return turnReport;
  });
}

function pickFirstFutureDayOption(options = []) {
  return options.find((o) => isIulDaySelectionId(o.id)) || null;
}

function pickDaypartOption(options = [], prefer = "morning") {
  const morning = options.find((o) => o.id === IUL_OPTION_IDS.DAY_MORNING);
  const afternoon = options.find((o) => o.id === IUL_OPTION_IDS.DAY_AFTERNOON);
  if (prefer === "morning" && morning) return morning;
  if (afternoon) return afternoon;
  return morning || afternoon || null;
}

function pickFirstSlotOption(options = []) {
  return options.find((o) => isIulSlotSelectionId(o.id)) || null;
}

async function runGoldenPathDriver(session, options = {}) {
  const meetingMode = options.meetingMode === "in_person" ? "in_person" : "zoom";
  const modeOption =
    meetingMode === "in_person"
      ? {
          id: IUL_OPTION_IDS.MEET_OFFICE,
          title: "En la oficina"
        }
      : {
          id: IUL_OPTION_IDS.MEET_ZOOM,
          title: "Por Zoom"
        };

  const turns = [];
  const steps = [
    {
      id: "intake",
      text: `Hola, quiero revisar mi póliza IUL. ${IUL_CODE}`,
      campaignIntakeMatch: FRESH_IUL_INTAKE_MATCH
    },
    {
      id: "status",
      interactiveReply: {
        type: "button_reply",
        id: IUL_OPTION_IDS.STATUS_RESEARCH,
        title: "Estoy buscando información"
      }
    },
    {
      id: "intent",
      interactiveReply: {
        type: "button_reply",
        id: IUL_OPTION_IDS.REVIEW_GROWTH,
        title: "Crecimiento"
      }
    },
    {
      id: "mode",
      text: modeOption.title,
      interactiveReply: {
        type: "button_reply",
        id: modeOption.id,
        title: modeOption.title
      },
      expect: { hasDayPicker: true, meetingMode }
    }
  ];

  const conversationOptions = { ...options, stagingBooking: false };
  let lastReport = null;
  for (const step of steps) {
    lastReport = await runIulSimulatorTurn(session, step, conversationOptions);
    turns.push(lastReport);
    if (!lastReport.pass) {
      return { turns, pass: false };
    }
  }

  const dayOption = pickFirstFutureDayOption(lastReport.interactiveOptions || []);
  if (!dayOption) {
    turns.push({
      turn: "day-dynamic",
      pass: false,
      failures: [{ path: "goldenPathDay", expected: "offered day", actual: lastReport.interactiveOptions }]
    });
    return { turns, pass: false };
  }

  lastReport = await runIulSimulatorTurn(
    session,
    {
      id: "day",
      text: dayOption.title,
      interactiveReply: { type: "list_reply", id: dayOption.id, title: dayOption.title }
    },
    conversationOptions
  );
  turns.push(lastReport);
  if (!lastReport.pass) {
    return { turns, pass: false };
  }

  const daypartOption = pickDaypartOption(lastReport.interactiveOptions || [], "morning");
  if (!daypartOption) {
    turns.push({
      turn: "daypart-dynamic",
      pass: false,
      failures: [{ path: "goldenPathDaypart", expected: "daypart options", actual: lastReport.interactiveOptions }]
    });
    return { turns, pass: false };
  }

  lastReport = await runIulSimulatorTurn(
    session,
    {
      id: "daypart",
      text: daypartOption.title,
      interactiveReply: { type: "button_reply", id: daypartOption.id, title: daypartOption.title },
      expect: { compactSlotCountMin: 1, compactSlotCountMax: 3 }
    },
    conversationOptions
  );
  turns.push(lastReport);
  if (!lastReport.pass) {
    return { turns, pass: false };
  }

  const slotOption = pickFirstSlotOption(lastReport.interactiveOptions || []);
  if (!slotOption) {
    turns.push({
      turn: "slot-dynamic",
      pass: false,
      failures: [{ path: "goldenPathSlot", expected: "slot options", actual: lastReport.interactiveOptions }]
    });
    return { turns, pass: false };
  }

  const slotInboundMessageId =
    options.slotInboundMessageId ||
    `sim-wamid.${session.context.prospectId}.slot`;
  const preBookingContext = { ...session.context };
  lastReport = await runIulSimulatorTurn(
    session,
    {
      id: "slot",
      inboundMessageId: slotInboundMessageId,
      text: slotOption.title,
      interactiveReply: { type: "button_reply", id: slotOption.id, title: slotOption.title },
      expect: options.stagingBooking
        ? {}
        : { mayCreateAppointment: true }
    },
    {
      ...options,
      stagingBooking: Boolean(options.stagingBooking)
    }
  );
  turns.push(lastReport);

  return {
    turns,
    pass: lastReport.pass,
    slotOption,
    slotInboundMessageId,
    preBookingContext,
    bookingTurn: lastReport
  };
}

async function runIulDryRunScenario(definition) {
  const seed = {
    prospectId: `${SIM_IUL_PREFIX}${definition.id}`,
    ...definition.seed
  };
  const session = createIulEphemeralSession(seed);
  let turns = [];
  let pass = true;

  if (definition.driver === "golden_path") {
    const driverResult = await runGoldenPathDriver(session);
    turns = driverResult.turns;
    pass = driverResult.pass;
  } else {
    let turnNumber = 0;
    for (const turn of definition.turns || []) {
      turnNumber += 1;
      const report = await runIulSimulatorTurn(session, { ...turn, turnNumber });
      turns.push(report);
      if (!report.pass) {
        pass = false;
      }
    }
  }

  const passed = turns.filter((t) => t.pass).length;
  const failed = turns.length - passed;

  return {
    scenarioId: definition.id,
    scenarioName: definition.name,
    simulator: true,
    iulPolicyReview: true,
    mode: "dry_run",
    ephemeral: true,
    pass: pass && failed === 0,
    summary: {
      totalAssertions: turns.length,
      passed,
      failed,
      sideEffectsDenied: true,
      productionWrites: session.writes
    },
    turns,
    finalDiagnostics: extractIulDiagnostics(session.context, turns[turns.length - 1]?.result || {})
  };
}

async function runIulStagingE2EScenario(definition, req, options = {}) {
  const stagingConfig =
    options.stagingConfig ||
    (await resolveStagingCalendarConfig(req, { explicitStagingMode: true }));
  const simulatorRunId = options.simulatorRunId || createSimulatorRunId();
  const meetingMode = definition.meetingMode === "in_person" ? "in_person" : "zoom";
  const grant = createIulStagingBookingGrant({
    stagingConfig,
    simulatorRunId,
    scenarioId: definition.id
  });

  if (meetingMode === "zoom" && !stagingConfig.personalZoomUrl) {
    return {
      scenarioId: definition.id,
      scenarioName: definition.name,
      mode: "staging_e2e",
      pass: false,
      error: "Configured staging Zoom URL is required for Zoom staging E2E.",
      staging: {
        calendarName: stagingConfig.calendarName,
        meetingMode,
        zoomVerified: false,
        cleanup: { status: "skipped" }
      }
    };
  }

  const { defaultIulSeed } = require("./iulSimulatorShared");
  const prospectId = `${SIM_IUL_PREFIX}${definition.id}-${simulatorRunId.slice(-8)}`;
  const phone = `sim-iul-${simulatorRunId.slice(-8)}`;
  const seed = defaultIulSeed({
    prospectId,
    organizationId: grant.organizationId,
    agentId: grant.userId,
    prospectOwnerUserId: grant.userId,
    testNow: options.testNow || new Date().toISOString(),
    knownFacts: {},
    _officeLocation: stagingConfig.officeAddress
      ? { fullAddress: stagingConfig.officeAddress }
      : undefined
  });

  const session = createIulEphemeralSession(seed);
  session.context.prospectPhone = phone;
  session.simulatorRunId = simulatorRunId;

  const bookingDeps = createStagingBookingDependencies({
    grant,
    prospectId,
    phone,
    getSlotsImpl: options.getSlots || null,
    scheduleAppointmentImpl: options.scheduleAppointment || null,
    resolveCanonicalVirtualMeetingUrl: options.resolveCanonicalVirtualMeetingUrl || null
  });

  const driverOptions = {
    async: true,
    stagingConfig,
    stagingGrant: grant,
    stagingBooking: true,
    meetingMode,
    getSlots: bookingDeps.getSlots,
    bookingDependencies: {
      executeScheduleInterview: bookingDeps.executeScheduleInterview,
      getSlots: bookingDeps.getSlots,
      findActiveAppointmentForProspect: bookingDeps.findActiveAppointmentForProspect,
      findAppointmentById: bookingDeps.findAppointmentById
    },
    prospectPhone: phone
  };

  const driverResult = await runGoldenPathDriver(session, driverOptions);
  const lastTurn = driverResult.bookingTurn || driverResult.turns[driverResult.turns.length - 1];
  const selectedSlot =
    session.context.knownFacts?.iulSelectedSlot ||
    lastTurn?.result?.structuredDecision?.entities?.selectedSlot ||
    null;
  const bookingExecution = lastTurn?.result?.execution || {};
  const firstCreateCount = bookingDeps.store.calendarCreateCount;

  let calendarEvent = null;
  if (typeof options.findCreatedEvent === "function") {
    calendarEvent = await options.findCreatedEvent({
      grant,
      simulatorRunId,
      bookingExecution
    });
  } else if (bookingExecution.scheduleResult?.calendarEventId || bookingExecution.appointmentId) {
    calendarEvent = await getStagingEventByRunId(stagingConfig, simulatorRunId);
    if (!calendarEvent) {
      calendarEvent = {
        id:
          bookingExecution.scheduleResult?.calendarEventId ||
          bookingExecution.scheduleResult?.booking?.googleCalendarEventId ||
          null,
        eventId:
          bookingExecution.scheduleResult?.calendarEventId ||
          bookingExecution.scheduleResult?.booking?.googleCalendarEventId ||
          null,
        location: bookingExecution.scheduleResult?.booking?.location || null
      };
    }
  }

  let replay = { attempted: false, pass: false };
  if (driverResult.slotInboundMessageId && driverResult.preBookingContext) {
    const replayResult = await processRecruitAiV2Turn({
      message: {
        id: driverResult.slotInboundMessageId,
        text: driverResult.slotOption?.title,
        interactiveReply: {
          type: "button_reply",
          id: driverResult.slotOption?.id,
          title: driverResult.slotOption?.title
        }
      },
      context: driverResult.preBookingContext,
      options: {
        invocationSource: IUL_STAGING_E2E_INVOCATION_SOURCE,
        iulStagingE2EGrant: grant,
        allowExecution: true,
        persistContext: false,
        profileConfigured: true,
        prospectPhone: phone,
        inboundMessageId: driverResult.slotInboundMessageId,
        getSlots: bookingDeps.getSlots,
        actingUserId: grant.userId,
        organizationId: grant.organizationId,
        env: {
          RECRUIT_AI_V2_EXECUTION_ENABLED: "false",
          RECRUIT_AI_V2_SHADOW_ENABLED: "false"
        },
        v2Grant: { eligible: false, reason: "IUL_SIMULATOR" },
        dependencies: driverOptions.bookingDependencies
      }
    });
    replay = {
      attempted: true,
      pass:
        Boolean(replayResult.execution?.success) &&
        Boolean(replayResult.execution?.idempotent || replayResult.execution?.appointmentId) &&
        bookingDeps.store.calendarCreateCount === firstCreateCount,
      appointmentId: replayResult.execution?.appointmentId || null,
      calendarCreateCount: bookingDeps.store.calendarCreateCount,
      idempotent: Boolean(replayResult.execution?.idempotent)
    };
  }

  const renderedText = lastTurn?.atlasReply || lastTurn?.result?.rendered?.text || "";
  const reasonCodes = lastTurn?.diagnostics?.reasonCodes || [];
  const certification = certifyIulStagingBooking({
    meetingMode,
    bookingResult: {
      success: Boolean(bookingExecution.success),
      appointmentId: bookingExecution.appointmentId,
      meetingUrl:
        bookingExecution.scheduleResult?.meetingUrl ||
        bookingExecution.scheduleResult?.zoomLink ||
        null,
      zoomLink: bookingExecution.scheduleResult?.zoomLink || null,
      scheduleResult: bookingExecution.scheduleResult
    },
    renderedText,
    reasonCodes,
    configuredZoomUrl: stagingConfig.personalZoomUrl,
    officeAddress: stagingConfig.officeAddress,
    calendarEvent,
    calendarCreateCount: firstCreateCount,
    replayCalendarCreateCount: replay.attempted ? replay.calendarCreateCount : firstCreateCount
  });

  if (meetingMode === "zoom" && !renderedText.includes(stagingConfig.personalZoomUrl || "___missing___")) {
    certification.failures.push({
      path: "finalAtlasConfirmation",
      expected: stagingConfig.personalZoomUrl,
      actual: renderedText.slice(0, 240)
    });
    certification.pass = false;
  }

  let cleanup = { status: "pending" };
  if (options.autoCleanup && (calendarEvent?.id || calendarEvent?.eventId)) {
    cleanup = await cleanupStagingSimulatorEvents({
      req,
      simulatorRunId,
      stagingConfig
    });
  }

  const availabilityEvidence = {
    provider: bookingDeps.evidence.provider,
    calendarId: grant.calendarId,
    calendarName: grant.calendarName,
    offeredDays: lastTurn?.diagnostics?.offeredDays || driverResult.turns.find((t) => t.turn === "mode")?.diagnostics?.offeredDays || [],
    selectedDay: session.context.knownFacts?.iulSelectedDate || null,
    offeredSlots: driverResult.turns.find((t) => t.turn === "daypart")?.diagnostics?.offeredSlots || [],
    selectedSlot
  };

  const pass =
    driverResult.pass &&
    certification.pass &&
    Boolean(bookingExecution.attempted && bookingExecution.success) &&
    lastTurn?.execution?.bookingPath === "executeScheduleInterview" &&
    (!replay.attempted || replay.pass);

  return {
    scenarioId: definition.id,
    scenarioName: definition.name,
    mode: "staging_e2e",
    pass,
    simulatorRunId,
    turns: driverResult.turns,
    bookingPath: "executeScheduleInterview",
    persistence: {
      calendar: "real_schedulingService.createCalendarEvent",
      appointment: "ephemeral_simulator_store",
      prospect: "none",
      whatsapp: "none",
      conversationLogs: "none"
    },
    availability: availabilityEvidence,
    replay,
    certification,
    staging: {
      calendarName: stagingConfig.calendarName,
      calendarId: stagingConfig.calendarId,
      meetingMode,
      event: calendarEvent
        ? {
            created: true,
            eventId: calendarEvent.id || calendarEvent.eventId,
            htmlLink: calendarEvent.htmlLink || null
          }
        : { created: false },
      zoom: {
        configured: Boolean(stagingConfig.personalZoomUrl),
        verified:
          meetingMode === "zoom" &&
          renderedText.includes(stagingConfig.personalZoomUrl || "") &&
          !reasonCodes.includes(REASON_CODES.IUL_ZOOM_LINK_MISSING),
        url: meetingMode === "zoom" ? stagingConfig.personalZoomUrl : null
      },
      officeAddress: meetingMode === "in_person" ? stagingConfig.officeAddress : null,
      cleanup
    },
    assertions: {
      realBookingOrchestration: lastTurn?.execution?.bookingPath === "executeScheduleInterview",
      calendarEventCreated: Boolean(calendarEvent?.id || calendarEvent?.eventId),
      zoomUrlInFinalConfirmation:
        meetingMode !== "zoom" || renderedText.includes(stagingConfig.personalZoomUrl || ""),
      noZoomInOfficeConfirmation:
        meetingMode === "in_person" ? !/zoom\.us/i.test(renderedText) : true,
      idempotentReplay: !replay.attempted || replay.pass
    }
  };
}

async function verifyIdempotentStagingReplay({
  preBookingContext,
  slotOption,
  inboundMessageId,
  grant,
  bookingDependencies,
  getSlots,
  prospectPhone
}) {
  const firstCount = bookingDependencies?.store?.calendarCreateCount;
  const replayResult = await processRecruitAiV2Turn({
    message: {
      id: inboundMessageId,
      text: slotOption?.title,
      interactiveReply: {
        type: "button_reply",
        id: slotOption?.id,
        title: slotOption?.title
      }
    },
    context: preBookingContext,
    options: {
      invocationSource: IUL_STAGING_E2E_INVOCATION_SOURCE,
      iulStagingE2EGrant: grant,
      allowExecution: true,
      persistContext: false,
      profileConfigured: true,
      prospectPhone,
      inboundMessageId,
      getSlots,
      actingUserId: grant.userId,
      organizationId: grant.organizationId,
      dependencies: bookingDependencies
    }
  });
  return {
    pass:
      Boolean(replayResult.execution?.success) &&
      bookingDependencies.store.calendarCreateCount === firstCount,
    calendarCreateCount: bookingDependencies.store.calendarCreateCount,
    appointmentId: replayResult.execution?.appointmentId || null,
    idempotent: Boolean(replayResult.execution?.idempotent)
  };
}

module.exports = {
  SIM_IUL_PREFIX,
  assertSafeIulSimulatorIdentity,
  createIulEphemeralSession,
  extractIulDiagnostics,
  evaluateIulExpect,
  runIulSimulatorTurn,
  runGoldenPathDriver,
  runIulDryRunScenario,
  runIulStagingE2EScenario,
  verifyIdempotentStagingReplay,
  cleanupStagingSimulatorEvents,
  certifyIulStagingBooking,
  IUL_STAGING_E2E_INVOCATION_SOURCE
};
