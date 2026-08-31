/**
 * BR-164 — Recruit AI v2 fact regression + scheduling constraint persistence.
 * Shared orchestration/scheduler only. Execution remains OFF.
 */

"use strict";

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");

const { interpretInboundMessage } = require("../core/recruitAiV2/interpreter");
const { decideConversationTurn } = require("../core/recruitAiV2/decisionEngine");
const { renderCustomerReply } = require("../core/recruitAiV2/responseRenderer");
const { createConversationContext } = require("../core/recruitAiV2/conversationContext");
const { buildNextContextFromInterpretation } = require("../core/recruitAiV2/contextTurnUpdate");
const {
  resolveAvailabilityForTurnSync,
  shouldAttemptAvailabilityOffer,
  selectCrossDateCandidateSlots,
  filterSlotsByConstraints
} = require("../core/recruitAiV2/schedulingAvailabilityReader");
const {
  createContextPersistenceService,
  protectResolvedQualificationFacts
} = require("../core/recruitAiV2/contextPersistenceService");
const { createMemoryContextRepository } = require("../core/recruitAiV2/contextRepository");
const { parseLocationAnswer } = require("../core/recruitAiV2/locationFacts");
const {
  looksLikeJobOverviewQuestion,
  looksLikeJobOpportunityQuestion
} = require("../core/recruitAiV2/conversationContinuity");
const { NEXT_ACTIONS, REASON_CODES, INTENTS, FACT_CERTAINTY } = require("../core/recruitAiV2");
const { isExecutionEnabled } = require("../core/recruitAiV2/sideEffectAuthorizer");
const { isLiveExecutionPathEnabled } = require("../core/recruitAiV2/liveExecutionPathConfig");

const ORG = "00000000-0000-4000-8000-000000000001";
const PROSPECT = "29853100-f151-4ca8-b07d-624fd20c6685";
const AGENT = "33ad243a-9d00-4a4d-810b-df2762c0f076";
const TZ = "America/New_York";
const FRIDAY = new Date("2026-08-28T10:00:00.000-04:00");
const THURSDAY = "2026-09-03";
const FRIDAY_ISO = "2026-08-28";
const SATURDAY = "2026-08-29";

function qualifiedContext(overrides = {}) {
  return createConversationContext({
    preferredLanguage: "english",
    timezone: TZ,
    _testNow: FRIDAY,
    organizationId: ORG,
    prospectId: PROSPECT,
    agentId: AGENT,
    currentStage: "qualification",
    knownFacts: {
      city: "Miami",
      state: "FL",
      cityCertainty: FACT_CERTAINTY.CONFIRMED,
      stateCertainty: FACT_CERTAINTY.CONFIRMED,
      workAuthorization: true,
      workAuthorizationStatus: "authorized",
      preferredDayPart: null,
      ...(overrides.knownFacts || {})
    },
    appointment: {
      status: "none",
      previouslyOfferedSlots: [],
      ...(overrides.appointment || {})
    },
    conversation: {
      lastQuestionAsked: "ask_day_part",
      lastAtlasOutboundText: "Do you prefer morning or afternoon?",
      ...(overrides.conversation || {})
    },
    ...overrides
  });
}

function runTurn(text, context, { slots = null } = {}) {
  const interpretation = interpretInboundMessage({
    message: { text },
    context,
    options: { flexible: true, now: FRIDAY, channel: "whatsapp" }
  });
  const availability =
    slots == null
      ? null
      : resolveAvailabilityForTurnSync({
          context,
          interpretation,
          options: {
            now: FRIDAY,
            agentId: AGENT,
            availabilityFixture: { slots, timezone: TZ }
          }
        });
  const structuredDecision = decideConversationTurn({
    context,
    interpretation,
    availability
  });
  const nextContext = buildNextContextFromInterpretation({
    loaded: context,
    interpretation,
    structuredDecision
  });
  const rendered = renderCustomerReply(structuredDecision.customerReplyPlan);
  return {
    interpretation,
    structuredDecision,
    nextContext,
    rendered,
    availability
  };
}

function offeredTimes(decision) {
  const slots =
    decision.customerReplyPlan?.entities?.offeredSlots ||
    decision.availability?.nearestAlternatives ||
    [];
  return slots.map((s) => `${s.date || s.dateKey || ""}|${s.time || s.timeKey || ""}`);
}

test("execution gates remain OFF", () => {
  assert.equal(isExecutionEnabled({ env: process.env }), false);
  assert.equal(isLiveExecutionPathEnabled({ env: process.env }), false);
});

test("1. resolved location + authorization → FAQ → answer then continue forward", () => {
  assert.equal(looksLikeJobOverviewQuestion("what is the work"), true);
  assert.equal(looksLikeJobOpportunityQuestion("where would I work"), true);
  assert.equal(parseLocationAnswer("where would I work"), null);
  assert.equal(parseLocationAnswer("donde trabajaria"), null);

  for (const phrase of ["what is the work", "where would I work"]) {
    const { interpretation, structuredDecision, nextContext, rendered } = runTurn(
      phrase,
      qualifiedContext()
    );
    assert.notEqual(interpretation.intent, INTENTS.PROVIDE_LOCATION);
    assert.equal(
      structuredDecision.decision.nextAction,
      NEXT_ACTIONS.ANSWER_JOB_OPPORTUNITY_THEN_RESUME
    );
    assert.match(rendered.text, /financial services|work|interview/i);
    assert.doesNotMatch(rendered.text, /city and state/i);
    assert.doesNotMatch(rendered.text, /work authorization|legal documentation/i);
    assert.doesNotMatch(rendered.text, /share the detail I just asked for/i);
    assert.match(rendered.text, /morning|afternoon/i);
    assert.equal(nextContext.knownFacts.city, "Miami");
    assert.equal(nextContext.knownFacts.state, "FL");
    assert.equal(nextContext.knownFacts.workAuthorization, true);
    assert.equal(nextContext.conversation.lastQuestionAsked, "ask_day_part");
    assert.ok(structuredDecision.outboundDecision);
    assert.equal(structuredDecision.outboundDecision.action, "respond");
    assert.ok(structuredDecision.outboundDecision.reason);
  }
});

test("2. afternoon → no noon slot", () => {
  const filtered = filterSlotsByConstraints(
    [
      { dateKey: FRIDAY_ISO, timeKey: "12:00" },
      { dateKey: FRIDAY_ISO, timeKey: "13:00" },
      { dateKey: FRIDAY_ISO, timeKey: "15:00" },
      { dateKey: SATURDAY, timeKey: "12:00" }
    ],
    { dayPart: "afternoon" }
  );
  assert.deepEqual(
    filtered.map((s) => s.timeKey),
    ["13:00", "15:00"]
  );

  const slots = [
    { dateKey: FRIDAY_ISO, timeKey: "12:00", startTimeISO: "2026-08-28T16:00:00.000Z" },
    { dateKey: FRIDAY_ISO, timeKey: "13:00", startTimeISO: "2026-08-28T17:00:00.000Z" },
    { dateKey: FRIDAY_ISO, timeKey: "15:00", startTimeISO: "2026-08-28T19:00:00.000Z" },
    { dateKey: SATURDAY, timeKey: "12:00", startTimeISO: "2026-08-29T16:00:00.000Z" }
  ];
  const context = qualifiedContext({
    currentStage: "scheduling",
    knownFacts: { preferredDayPart: null },
    conversation: { lastQuestionAsked: "ask_day_part" }
  });
  const { structuredDecision, nextContext } = runTurn("afternoon", context, { slots });
  const times = offeredTimes(structuredDecision);
  assert.ok(times.length >= 1);
  assert.ok(times.every((row) => !row.endsWith("|12:00")));
  assert.ok(times.every((row) => row.startsWith(`${FRIDAY_ISO}|`)));
  assert.equal(nextContext.knownFacts.preferredDayPart, "afternoon");
});

test("3. next Thursday → only Thursday searched", () => {
  const slots = [
    { dateKey: THURSDAY, timeKey: "13:00", startTimeISO: "2026-09-03T17:00:00.000Z" },
    { dateKey: THURSDAY, timeKey: "15:00", startTimeISO: "2026-09-03T19:00:00.000Z" },
    { dateKey: "2026-09-04", timeKey: "13:00", startTimeISO: "2026-09-04T17:00:00.000Z" }
  ];
  const context = qualifiedContext({
    currentStage: "scheduling",
    knownFacts: {
      preferredDayPart: "afternoon",
      availabilityConstraint: { dayPart: "afternoon" }
    },
    conversation: { lastQuestionAsked: "ask_time_preference" }
  });
  const { interpretation, availability } = runTurn("next Thursday", context, { slots });
  assert.equal(interpretation.entities.resolvedDate?.isoDate, THURSDAY);
  assert.equal(shouldAttemptAvailabilityOffer({ context, interpretation }), true);
  const dates = (availability?.nearestAlternatives || []).map(
    (s) => s.date || s.dateKey
  );
  assert.ok(dates.length >= 1);
  assert.ok(dates.every((d) => d === THURSDAY));
});

test("4. Thursday + afternoon + “3” → 3 PM", () => {
  const context = qualifiedContext({
    currentStage: "scheduling",
    knownFacts: { preferredDayPart: "afternoon" },
    appointment: { status: "proposed", proposedDate: THURSDAY },
    conversation: { lastQuestionAsked: "ask_time_preference" }
  });
  const { interpretation } = runTurn("3", context);
  assert.equal(interpretation.intent, INTENTS.SCHEDULING_COUNTEROFFER);
  assert.equal(interpretation.entities.requestedTime, "15:00");
});

test("5. exact time available → confirm only that time", () => {
  const slots = [
    { dateKey: THURSDAY, timeKey: "12:00", startTimeISO: "2026-09-03T16:00:00.000Z" },
    { dateKey: THURSDAY, timeKey: "15:00", startTimeISO: "2026-09-03T19:00:00.000Z" },
    { dateKey: THURSDAY, timeKey: "16:00", startTimeISO: "2026-09-03T20:00:00.000Z" }
  ];
  const context = qualifiedContext({
    currentStage: "scheduling",
    knownFacts: {
      preferredDayPart: "afternoon",
      availabilityConstraint: { dayPart: "afternoon" }
    },
    appointment: { status: "proposed", proposedDate: THURSDAY, previouslyOfferedSlots: [] },
    conversation: { lastQuestionAsked: "ask_time_preference" }
  });
  const { structuredDecision, nextContext } = runTurn("3", context, { slots });
  assert.equal(
    structuredDecision.decision.nextAction,
    NEXT_ACTIONS.ASK_EXPLICIT_CONFIRMATION
  );
  assert.ok(
    structuredDecision.reasonCodes.includes(REASON_CODES.EXACT_REQUESTED_TIME_CONFIRMED)
  );
  assert.equal(nextContext.appointment.proposedTime, "15:00");
  assert.equal(nextContext.appointment.proposedDate, THURSDAY);
  const offered = nextContext.appointment.previouslyOfferedSlots || [];
  assert.equal(offered.length, 1);
  assert.equal(offered[0].time || offered[0].timeKey, "15:00");
  assert.equal(nextContext.conversation.lastQuestionAsked, "confirm_slot");
  assert.doesNotMatch(
    renderCustomerReply(structuredDecision.customerReplyPlan).text,
    /12:00/
  );
});

test("6. exact time unavailable → nearby valid alternatives only", () => {
  const slots = [
    { dateKey: THURSDAY, timeKey: "12:00", startTimeISO: "2026-09-03T16:00:00.000Z" },
    { dateKey: THURSDAY, timeKey: "14:00", startTimeISO: "2026-09-03T18:00:00.000Z" },
    { dateKey: THURSDAY, timeKey: "16:00", startTimeISO: "2026-09-03T20:00:00.000Z" },
    { dateKey: "2026-09-04", timeKey: "15:00", startTimeISO: "2026-09-04T19:00:00.000Z" }
  ];
  const context = qualifiedContext({
    currentStage: "scheduling",
    knownFacts: {
      preferredDayPart: "afternoon",
      availabilityConstraint: { dayPart: "afternoon" }
    },
    appointment: { status: "proposed", proposedDate: THURSDAY, previouslyOfferedSlots: [] },
    conversation: { lastQuestionAsked: "ask_time_preference" }
  });
  const { structuredDecision, nextContext, availability } = runTurn("3", context, {
    slots
  });
  assert.equal(availability.requestedSlotAvailable, false);
  assert.equal(
    structuredDecision.decision.nextAction,
    NEXT_ACTIONS.OFFER_AVAILABLE_SLOTS
  );
  const offered = nextContext.appointment.previouslyOfferedSlots || [];
  assert.ok(offered.length >= 1);
  assert.ok(offered.every((s) => (s.time || s.timeKey) !== "12:00"));
  assert.ok(offered.every((s) => (s.date || s.dateKey) === THURSDAY));
  assert.ok(offered.every((s) => (s.time || s.timeKey) !== "15:00"));
});

test("7. stale state/version cannot overwrite newer resolved facts", async () => {
  const previous = {
    knownFacts: {
      city: "Miami",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed",
      workAuthorization: true,
      workAuthorizationStatus: "authorized",
      preferredDayPart: "afternoon"
    },
    conversation: { lastQuestionAsked: "ask_day_part" }
  };
  const staleNext = {
    knownFacts: {
      city: null,
      state: null,
      workAuthorization: null,
      preferredDayPart: null
    },
    conversation: { lastQuestionAsked: "ask_authorization" }
  };
  const protectedNext = protectResolvedQualificationFacts(previous, staleNext);
  assert.equal(protectedNext.knownFacts.city, "Miami");
  assert.equal(protectedNext.knownFacts.state, "FL");
  assert.equal(protectedNext.knownFacts.workAuthorization, true);
  assert.equal(protectedNext.knownFacts.preferredDayPart, "afternoon");
  assert.notEqual(protectedNext.conversation.lastQuestionAsked, "ask_authorization");

  const service = createContextPersistenceService({
    repository: createMemoryContextRepository()
  });
  const created = await service.createContext({
    organizationId: ORG,
    prospectId: PROSPECT,
    channel: "whatsapp",
    context: {
      preferredLanguage: "english",
      knownFacts: previous.knownFacts,
      conversation: { lastQuestionAsked: "ask_day_part" }
    },
    ensureCore: false
  });
  assert.ok(created._persistence.contextVersion >= 1);

  await assert.rejects(
    () =>
      service.compareAndSaveContext({
        organizationId: ORG,
        prospectId: PROSPECT,
        channel: "whatsapp",
        expectedVersion: created._persistence.contextVersion,
        nextContext: {
          preferredLanguage: "english",
          knownFacts: { city: null, workAuthorization: null },
          conversation: { lastQuestionAsked: "ask_location" },
          _persistence: { contextVersion: 0 }
        },
        ensureCore: false
      }),
    (error) => error.code === "CONTEXT_STALE_VERSION_DROPPED"
  );

  const saved = await service.compareAndSaveContext({
    organizationId: ORG,
    prospectId: PROSPECT,
    channel: "whatsapp",
    expectedVersion: created._persistence.contextVersion,
    nextContext: {
      preferredLanguage: "english",
      knownFacts: { city: null, state: null, workAuthorization: null },
      conversation: { lastQuestionAsked: "ask_authorization" }
    },
    inboundMessageId: "msg-stale-facts",
    ensureCore: false
  });
  assert.equal(saved.ok, true);
  assert.equal(saved.context.knownFacts.city, "Miami");
  assert.equal(saved.context.knownFacts.workAuthorization, true);
  assert.equal(saved.context.knownFacts.preferredDayPart, "afternoon");
});

test("8. no silent terminal path", () => {
  const { structuredDecision, rendered } = runTurn("???", qualifiedContext());
  assert.ok(structuredDecision.outboundDecision);
  assert.ok(["respond", "wait", "suppress"].includes(structuredDecision.outboundDecision.action));
  assert.ok(structuredDecision.outboundDecision.reason);
  assert.ok(String(structuredDecision.customerReplyPlan.templateKey || "").length > 0);
  assert.ok(String(rendered.text || "").trim().length > 0);

  const sameDay = selectCrossDateCandidateSlots([
    { dateKey: FRIDAY_ISO, timeKey: "13:00" },
    { dateKey: FRIDAY_ISO, timeKey: "15:00" },
    { dateKey: SATURDAY, timeKey: "13:00" }
  ]);
  assert.deepEqual(
    sameDay.map((s) => `${s.dateKey}|${s.timeKey}`),
    [`${FRIDAY_ISO}|13:00`, `${FRIDAY_ISO}|15:00`]
  );
});
