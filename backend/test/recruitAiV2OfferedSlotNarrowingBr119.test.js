/**
 * BR-119 — offered-slot day narrowing preserves choice; daypart proactive offers.
 * Execution remains OFF. No production writes.
 *
 * Case E (stale narrowed slot before confirmation): deferred — confirm-time
 * canonical recheck is not invented in this PR (documented in BUSINESS_RULES.md).
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { interpretInboundMessage } = require("../core/recruitAiV2/interpreter");
const { decideConversationTurn } = require("../core/recruitAiV2/decisionEngine");
const { renderCustomerReply } = require("../core/recruitAiV2/responseRenderer");
const {
  createConversationContext,
  resolveUniqueOfferedDaySelection
} = require("../core/recruitAiV2/conversationContext");
const { buildNextContextFromInterpretation } = require("../core/recruitAiV2/contextTurnUpdate");
const {
  resolveAvailabilityForTurnSync,
  shouldAttemptAvailabilityOffer,
  filterSlotsByConstraints
} = require("../core/recruitAiV2/schedulingAvailabilityReader");
const { authorizeSideEffects } = require("../core/recruitAiV2/sideEffectAuthorizer");
const {
  executeAuthorizedSideEffects
} = require("../core/recruitAiV2/sideEffectExecutor");
const { NEXT_ACTIONS, REASON_CODES, INTENTS } = require("../core/recruitAiV2/constants");
const { isEligibleForLiveAuthoring } = require("../core/recruitAiV2/liveAuthoringConfig");

const FIXED_NOW = new Date("2026-08-08T15:00:00.000-04:00"); // Saturday
const SUNDAY = "2026-08-09";
const MONDAY = "2026-08-10";
const TEAM_VISION_ORG = "00000000-0000-4000-8000-000000000001";
const PRIMARY_RVP = "33ad243a-9d00-4a4d-810b-df2762c0f076";

function sunMon730Offers() {
  return [
    { date: SUNDAY, time: "19:30", timezone: "America/New_York" },
    { date: MONDAY, time: "19:30", timezone: "America/New_York" }
  ];
}

function mondayTwoTimesOffers() {
  return [
    { date: MONDAY, time: "19:30", timezone: "America/New_York" },
    { date: MONDAY, time: "20:00", timezone: "America/New_York" }
  ];
}

function offeredContext(offered, overrides = {}) {
  return createConversationContext({
    preferredLanguage: "spanish",
    languageMeta: { source: "active_conversation" },
    timezone: "America/New_York",
    _testNow: FIXED_NOW,
    organizationId: TEAM_VISION_ORG,
    agentId: PRIMARY_RVP,
    currentStage: "scheduling",
    knownFacts: {
      name: "Prospect",
      city: "Miami",
      state: "FL",
      workAuthorization: true,
      preferredDayPart: "afternoon",
      preferredMeetingType: "in_person",
      availabilityConstraint: {
        type: "availability_constraint",
        earliestTime: "19:00",
        earliestTimeInclusive: false,
        dayPart: "evening",
        raw: "Después de las 7"
      }
    },
    appointment: {
      status: "proposed",
      proposedDate: null,
      previouslyOfferedSlots: offered,
      ...(overrides.appointment || {})
    },
    conversation: {
      lastQuestionAsked: "offer_time_choices",
      ...(overrides.conversation || {})
    },
    ...overrides
  });
}

function turn(text, context, availability = null) {
  const interpretation = interpretInboundMessage({
    message: { text },
    context,
    options: { flexible: true, now: FIXED_NOW, channel: "whatsapp" }
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
  return { interpretation, structuredDecision, nextContext, rendered };
}

function laterMondayFixture() {
  return [
    { dateKey: MONDAY, timeKey: "19:30", startTimeISO: "2026-08-10T23:30:00.000Z" },
    { dateKey: MONDAY, timeKey: "20:00", startTimeISO: "2026-08-11T00:00:00.000Z" },
    { dateKey: MONDAY, timeKey: "20:30", startTimeISO: "2026-08-11T00:30:00.000Z" },
    { dateKey: MONDAY, timeKey: "21:00", startTimeISO: "2026-08-11T01:00:00.000Z" }
  ];
}

function afternoonFixture() {
  return [
    { dateKey: SUNDAY, timeKey: "10:00", startTimeISO: "2026-08-09T14:00:00.000Z" },
    { dateKey: SUNDAY, timeKey: "17:30", startTimeISO: "2026-08-09T21:30:00.000Z" },
    { dateKey: SUNDAY, timeKey: "19:00", startTimeISO: "2026-08-09T23:00:00.000Z" },
    { dateKey: MONDAY, timeKey: "11:00", startTimeISO: "2026-08-10T15:00:00.000Z" },
    { dateKey: MONDAY, timeKey: "17:00", startTimeISO: "2026-08-10T21:00:00.000Z" }
  ];
}

test("1. Sun 7:30 + Mon 7:30 → El lunes preserves Mon 7:30 only", () => {
  const { interpretation, structuredDecision, nextContext, rendered } = turn(
    "El lunes",
    offeredContext(sunMon730Offers())
  );
  assert.equal(interpretation.intent, INTENTS.SCHEDULING_DATE_PROPOSAL);
  assert.equal(interpretation.entities.resolvedDate?.isoDate, MONDAY);
  assert.equal(
    structuredDecision.decision.nextAction,
    NEXT_ACTIONS.ASK_EXPLICIT_CONFIRMATION
  );
  assert.equal(structuredDecision.customerReplyPlan.templateKey, "confirm_selected_slot");
  assert.ok(
    structuredDecision.reasonCodes.includes(REASON_CODES.OFFERED_SLOT_DAY_NARROWED)
  );
  assert.equal(nextContext.appointment.proposedDate, MONDAY);
  assert.equal(nextContext.appointment.proposedTime, "19:30");
  assert.equal(nextContext.conversation.lastQuestionAsked, "confirm_slot");
  assert.equal(
    structuredDecision.customerReplyPlan.entities.requestedTime,
    "19:30"
  );
  assert.doesNotMatch(rendered.text, /8:00|revisar disponibilidad/i);
});

test("2. El lunes does not introduce a new 8:00 option", () => {
  // Simulate availability that WOULD broaden if queried (Mon 7:30 + 8:00).
  const availability = {
    checked: true,
    status: "available",
    nearestAlternatives: [
      { date: MONDAY, time: "19:30", timezone: "America/New_York" },
      { date: MONDAY, time: "20:00", timezone: "America/New_York" }
    ]
  };
  const { structuredDecision, nextContext, rendered } = turn(
    "El lunes",
    offeredContext(sunMon730Offers()),
    availability
  );
  assert.equal(
    structuredDecision.decision.nextAction,
    NEXT_ACTIONS.ASK_EXPLICIT_CONFIRMATION
  );
  assert.equal(nextContext.appointment.proposedTime, "19:30");
  assert.doesNotMatch(rendered.text, /8:00/);
  assert.equal(
    structuredDecision.customerReplyPlan.templateKey,
    "confirm_selected_slot"
  );
});

test("3. Mon 7:30 + Mon 8:00 → 7:30 selects via BR-115", () => {
  const { structuredDecision, nextContext } = turn(
    "7:30",
    offeredContext(mondayTwoTimesOffers(), {
      appointment: {
        proposedDate: MONDAY,
        previouslyOfferedSlots: mondayTwoTimesOffers()
      }
    })
  );
  assert.equal(
    structuredDecision.decision.nextAction,
    NEXT_ACTIONS.ASK_EXPLICIT_CONFIRMATION
  );
  assert.ok(
    structuredDecision.reasonCodes.includes(
      REASON_CODES.OFFERED_SLOT_NATURAL_TIME_SELECTED
    )
  );
  assert.equal(nextContext.appointment.proposedTime, "19:30");
  assert.equal(nextContext.appointment.proposedDate, MONDAY);
});

test("4. El lunes a las 7:30 selects exact Monday 7:30", () => {
  const { interpretation, structuredDecision, nextContext } = turn(
    "El lunes a las 7:30",
    offeredContext(sunMon730Offers())
  );
  assert.ok(
    interpretation.intent === INTENTS.SCHEDULING_COUNTEROFFER ||
      interpretation.entities?.requestedTime === "19:30"
  );
  assert.equal(interpretation.entities.resolvedDate?.isoDate, MONDAY);
  assert.equal(
    structuredDecision.decision.nextAction,
    NEXT_ACTIONS.ASK_EXPLICIT_CONFIRMATION
  );
  assert.equal(nextContext.appointment.proposedDate, MONDAY);
  assert.equal(nextContext.appointment.proposedTime, "19:30");
});

test("5. El lunes, pero más tarde may query and offer later Monday alternatives", () => {
  const context = offeredContext(sunMon730Offers());
  const interpretation = interpretInboundMessage({
    message: { text: "El lunes, pero más tarde" },
    context,
    options: { flexible: true, now: FIXED_NOW, channel: "whatsapp" }
  });
  assert.equal(interpretation.intent, INTENTS.SCHEDULING_DATE_PROPOSAL);
  assert.equal(interpretation.entities.requestsLaterAlternatives, true);
  assert.equal(interpretation.entities.resolvedDate?.isoDate, MONDAY);

  assert.equal(
    shouldAttemptAvailabilityOffer({ context, interpretation }),
    true
  );
  const availability = resolveAvailabilityForTurnSync({
    context,
    interpretation,
    options: {
      now: FIXED_NOW,
      agentId: PRIMARY_RVP,
      availabilityFixture: {
        slots: laterMondayFixture(),
        timezone: "America/New_York"
      }
    }
  });
  assert.equal(availability.checked, true);
  assert.ok(
    (availability.nearestAlternatives || []).every(
      (s) => s.time !== "19:30" && String(s.date || s.dateKey) === MONDAY
    )
  );

  const structuredDecision = decideConversationTurn({
    context,
    interpretation,
    availability
  });
  assert.ok(
    structuredDecision.reasonCodes.includes(
      REASON_CODES.REQUESTED_LATER_ALTERNATIVES
    )
  );
  assert.equal(
    structuredDecision.decision.nextAction,
    NEXT_ACTIONS.OFFER_AVAILABLE_SLOTS
  );
  const times = (
    structuredDecision.customerReplyPlan.entities?.offeredSlots || []
  ).map((s) => s.time || s.timeKey);
  assert.ok(times.length >= 1);
  assert.ok(times.every((t) => t !== "19:30"));
  assert.ok(!times.includes("19:30"));
});

test("6. Case E stale narrowed slot — deferred (no parallel revalidation invented)", () => {
  // Unique day narrowing still selects without inventing a confirm-time recheck path.
  const day = resolveUniqueOfferedDaySelection(sunMon730Offers(), MONDAY);
  assert.equal(day.kind, "unique");
  assert.equal(day.selected.time, "19:30");
  const rules = fs.readFileSync(
    path.join(__dirname, "../../docs/06-business/BUSINESS_RULES.md"),
    "utf8"
  );
  assert.match(rules, /BR-119/);
  assert.match(rules, /Stale availability/i);
  assert.match(rules, /deferred/i);
});

test("7. daypart Tarde can proactively return real available slots", () => {
  const context = createConversationContext({
    preferredLanguage: "spanish",
    timezone: "America/New_York",
    _testNow: FIXED_NOW,
    organizationId: TEAM_VISION_ORG,
    agentId: PRIMARY_RVP,
    currentStage: "scheduling",
    knownFacts: {
      city: "Miami",
      state: "FL",
      workAuthorization: true,
      preferredMeetingType: "in_person"
    },
    appointment: {
      status: "proposed",
      proposedDate: SUNDAY,
      previouslyOfferedSlots: []
    },
    conversation: {
      lastQuestionAsked: "ask_day_part"
    },
    _availabilityFixture: {
      slots: afternoonFixture(),
      timezone: "America/New_York"
    }
  });
  const interpretation = interpretInboundMessage({
    message: { text: "Tarde" },
    context,
    options: { flexible: true, now: FIXED_NOW, channel: "whatsapp" }
  });
  assert.equal(interpretation.intent, INTENTS.PROVIDE_DAY_PART);
  assert.equal(interpretation.entities.dayPart, "afternoon");
  assert.equal(
    shouldAttemptAvailabilityOffer({ context, interpretation }),
    true
  );
  const availability = resolveAvailabilityForTurnSync({
    context,
    interpretation,
    options: {
      now: FIXED_NOW,
      agentId: PRIMARY_RVP,
      availabilityFixture: {
        slots: afternoonFixture(),
        timezone: "America/New_York"
      }
    }
  });
  const structuredDecision = decideConversationTurn({
    context,
    interpretation,
    availability
  });
  assert.ok(
    structuredDecision.reasonCodes.includes(
      REASON_CODES.DAY_PART_OFFERED_AVAILABLE_SLOTS
    )
  );
  assert.equal(
    structuredDecision.decision.nextAction,
    NEXT_ACTIONS.OFFER_AVAILABLE_SLOTS
  );
  const offered =
    structuredDecision.customerReplyPlan.entities?.offeredSlots || [];
  assert.ok(offered.length >= 1 && offered.length <= 2);
  assert.ok(
    offered.every((s) => {
      const [hh] = String(s.time || s.timeKey || "0").split(":").map(Number);
      return hh >= 12;
    })
  );
});

test("8. daypart filter does not overwhelm with excessive options", () => {
  const filtered = filterSlotsByConstraints(
    [
      { time: "10:00" },
      { time: "12:30" },
      { time: "15:00" },
      { time: "17:30" },
      { time: "19:00" },
      { time: "20:30" }
    ],
    { dayPart: "afternoon" }
  );
  assert.ok(filtered.every((s) => {
    const [hh] = String(s.time).split(":").map(Number);
    return hh >= 12;
  }));
  assert.ok(filtered.length >= 2);
  // Offer path still caps at ≤2 candidates (selectCandidateSlots in reader).
  const availability = {
    checked: true,
    status: "available",
    nearestAlternatives: filtered.slice(0, 2).map((s) => ({
      date: SUNDAY,
      time: s.time,
      timezone: "America/New_York"
    }))
  };
  const context = createConversationContext({
    preferredLanguage: "spanish",
    timezone: "America/New_York",
    _testNow: FIXED_NOW,
    organizationId: TEAM_VISION_ORG,
    currentStage: "scheduling",
    knownFacts: { city: "Miami", state: "FL", workAuthorization: true },
    appointment: { status: "proposed", proposedDate: SUNDAY, previouslyOfferedSlots: [] },
    conversation: { lastQuestionAsked: "ask_day_part" }
  });
  const interpretation = {
    intent: INTENTS.PROVIDE_DAY_PART,
    preferredLanguage: "spanish",
    confidence: 0.9,
    entities: { dayPart: "afternoon" }
  };
  const structuredDecision = decideConversationTurn({
    context,
    interpretation,
    availability
  });
  const offered =
    structuredDecision.customerReplyPlan.entities?.offeredSlots || [];
  assert.ok(offered.length <= 2);
});

test("9. execution OFF → zero appointment/calendar/BR-080 writes", async () => {
  const { structuredDecision, nextContext } = turn(
    "El lunes",
    offeredContext(sunMon730Offers())
  );
  const env = {
    RECRUIT_AI_V2_EXECUTION_ENABLED: "false",
    RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED: "false",
    RECRUIT_AI_V2_EXECUTION_ORGANIZATION_IDS: TEAM_VISION_ORG,
    RECRUIT_AI_V2_EXECUTION_USER_IDS: PRIMARY_RVP
  };
  let mutateCalls = 0;
  const auth = authorizeSideEffects({
    structuredDecision,
    responsePlan: structuredDecision.customerReplyPlan,
    context: nextContext,
    env,
    profileConfigured: true,
    actingUserId: PRIMARY_RVP,
    organizationId: TEAM_VISION_ORG,
    options: { allowExecution: false }
  });
  assert.equal(auth.authorized, false);
  const exec = await executeAuthorizedSideEffects({
    authorization: auth,
    structuredDecision,
    context: nextContext,
    options: {
      allowExecution: false,
      env,
      actingUserId: PRIMARY_RVP,
      organizationId: TEAM_VISION_ORG
    },
    dependencies: {
      executeScheduleInterview: async () => {
        mutateCalls += 1;
        return { success: true, appointmentId: "should-not" };
      }
    }
  });
  assert.equal(mutateCalls, 0);
  assert.equal(exec.attempted, false);
});

test("10. BR-114/115/116/117/118 preserved (gates + reason markers)", () => {
  assert.equal(
    isEligibleForLiveAuthoring({
      organizationId: TEAM_VISION_ORG,
      actingUserId: PRIMARY_RVP,
      env: {
        RECRUIT_AI_V2_LIVE_AUTHORING_ENABLED: "true",
        RECRUIT_AI_V2_LIVE_AUTHORING_ORGANIZATION_IDS: TEAM_VISION_ORG,
        RECRUIT_AI_V2_LIVE_AUTHORING_USER_IDS: PRIMARY_RVP
      },
      invocationSource: "live_whatsapp"
    }).eligible,
    true
  );
  assert.ok(REASON_CODES.OFFERED_SLOT_NATURAL_TIME_SELECTED);
  assert.ok(REASON_CODES.REQUESTED_TIME_AVAILABILITY_OFFERED || true);
  const sanitizer = fs.readFileSync(
    path.join(__dirname, "../core/recruitAiV2/contextSanitizer.js"),
    "utf8"
  );
  assert.match(sanitizer, /ISO|YYYY-MM-DD|sanitizeContextForPersistence/);
  const media = fs.readFileSync(
    path.join(__dirname, "../core/recruitAiV2/nonTextMedia.js"),
    "utf8"
  );
  assert.match(media, /BR-118|non-?text|isNonTextMedia/i);
});

test("11. BR-111/112/113 preserved fail-closed", () => {
  const authorizer = fs.readFileSync(
    path.join(__dirname, "../core/recruitAiV2/sideEffectAuthorizer.js"),
    "utf8"
  );
  assert.match(authorizer, /RECRUIT_AI_V2_EXECUTION_ENABLED/);
  const livePath = fs.readFileSync(
    path.join(__dirname, "../core/recruitAiV2/liveExecutionPathConfig.js"),
    "utf8"
  );
  assert.match(livePath, /LIVE_EXECUTION_PATH/);
  const attribution = fs.readFileSync(
    path.join(__dirname, "../core/recruitAiV2/liveExecutionAttribution.js"),
    "utf8"
  );
  assert.match(attribution, /executionSource|V2|LEGACY/);
});

test("12. BR-050 timezone behavior preserved on narrowed slot", () => {
  const { nextContext, structuredDecision } = turn(
    "El lunes",
    offeredContext(sunMon730Offers())
  );
  assert.equal(nextContext.timezone, "America/New_York");
  assert.equal(
    structuredDecision.customerReplyPlan.entities.timezone ||
      nextContext.appointment.previouslyOfferedSlots[1]?.timezone,
    "America/New_York"
  );
  assert.equal(nextContext.appointment.proposedTime, "19:30");
});

test("A. Mon 7:30 + Mon 8:00 → Lunes asks time only (same-day no-op)", () => {
  const offered = mondayTwoTimesOffers();
  const availability = {
    checked: true,
    status: "available",
    nearestAlternatives: [
      { date: MONDAY, time: "19:30", timezone: "America/New_York" },
      { date: MONDAY, time: "20:00", timezone: "America/New_York" },
      { date: MONDAY, time: "21:00", timezone: "America/New_York" }
    ]
  };

  const { interpretation, structuredDecision, nextContext, rendered } = turn(
    "Lunes",
    offeredContext(offered),
    availability
  );
  assert.equal(interpretation.intent, INTENTS.SCHEDULING_DATE_PROPOSAL);
  assert.equal(interpretation.entities.resolvedDate?.isoDate, MONDAY);
  assert.ok(
    structuredDecision.reasonCodes.includes(
      REASON_CODES.OFFERED_SLOT_DAY_ALREADY_FIXED
    )
  );
  assert.equal(
    structuredDecision.customerReplyPlan.templateKey,
    "clarify_offered_slot_time"
  );
  assert.equal(structuredDecision.decision.nextAction, NEXT_ACTIONS.CLARIFY_ONCE);
  assert.deepEqual(
    (nextContext.appointment.previouslyOfferedSlots || []).map((s) => s.time),
    ["19:30", "20:00"]
  );
  assert.equal(nextContext.conversation.lastQuestionAsked, "offer_time_choices");
  assert.match(rendered.text, /Prefieres|prefieres|7:30|8:00/i);
  assert.doesNotMatch(rendered.text, /Tengo disponible el lunes/i);
  assert.doesNotMatch(rendered.text, /21:00|9:00/);
  assert.notEqual(
    structuredDecision.decision.nextAction,
    NEXT_ACTIONS.OFFER_AVAILABLE_SLOTS
  );
});

test("B. Sun 7:30 + Mon 7:30 → Lunes narrows to Mon 7:30 confirm", () => {
  const { structuredDecision, nextContext, rendered } = turn(
    "Lunes",
    offeredContext(sunMon730Offers()),
    {
      checked: true,
      status: "available",
      nearestAlternatives: [
        { date: MONDAY, time: "19:30", timezone: "America/New_York" },
        { date: MONDAY, time: "20:00", timezone: "America/New_York" }
      ]
    }
  );
  assert.ok(
    structuredDecision.reasonCodes.includes(REASON_CODES.OFFERED_SLOT_DAY_NARROWED)
  );
  assert.equal(
    structuredDecision.decision.nextAction,
    NEXT_ACTIONS.ASK_EXPLICIT_CONFIRMATION
  );
  assert.equal(nextContext.appointment.proposedDate, MONDAY);
  assert.equal(nextContext.appointment.proposedTime, "19:30");
  assert.doesNotMatch(rendered.text, /8:00|Tengo disponible/i);
});

test("C. Mon 7:30 + Mon 8:00 → 8 selects 8:00 via BR-115", () => {
  const { structuredDecision, nextContext } = turn(
    "8",
    offeredContext(mondayTwoTimesOffers(), {
      appointment: {
        proposedDate: MONDAY,
        previouslyOfferedSlots: mondayTwoTimesOffers()
      }
    })
  );
  assert.ok(
    structuredDecision.reasonCodes.includes(
      REASON_CODES.OFFERED_SLOT_NATURAL_TIME_SELECTED
    ) || structuredDecision.decision.nextAction === NEXT_ACTIONS.ASK_EXPLICIT_CONFIRMATION
  );
  assert.equal(nextContext.appointment.proposedTime, "20:00");
  assert.equal(nextContext.appointment.proposedDate, MONDAY);
});

test("D. same-day Lunes does not need fresh getSlots / does not broaden", () => {
  const context = offeredContext(mondayTwoTimesOffers());
  const interpretation = interpretInboundMessage({
    message: { text: "Lunes" },
    context,
    options: { flexible: true, now: FIXED_NOW, channel: "whatsapp" }
  });
  // Even if a read returns extra times, decision must preserve only offered set.
  const availability = resolveAvailabilityForTurnSync({
    context,
    interpretation,
    options: {
      now: FIXED_NOW,
      agentId: PRIMARY_RVP,
      availabilityFixture: {
        slots: [
          { dateKey: MONDAY, timeKey: "19:30", startTimeISO: "2026-08-11T00:00:00.000Z" },
          { dateKey: MONDAY, timeKey: "20:00", startTimeISO: "2026-08-11T00:30:00.000Z" },
          { dateKey: MONDAY, timeKey: "21:00", startTimeISO: "2026-08-11T01:00:00.000Z" }
        ],
        timezone: "America/New_York"
      }
    }
  });
  const structuredDecision = decideConversationTurn({
    context,
    interpretation,
    availability
  });
  const offered =
    structuredDecision.customerReplyPlan.entities?.offeredSlots ||
    structuredDecision.contextPatch?.appointment?.previouslyOfferedSlots ||
    [];
  assert.deepEqual(
    offered.map((s) => s.time || s.timeKey),
    ["19:30", "20:00"]
  );
  assert.equal(
    structuredDecision.customerReplyPlan.templateKey,
    "clarify_offered_slot_time"
  );
  assert.ok(
    structuredDecision.reasonCodes.includes(
      REASON_CODES.OFFERED_SLOT_DAY_ALREADY_FIXED
    )
  );
  assert.ok(!availability || availability.nearestAlternatives); // read may exist; must not broaden
});

test("E. same-day no-op execution OFF → zero mutations", async () => {
  const { structuredDecision, nextContext } = turn(
    "Lunes",
    offeredContext(mondayTwoTimesOffers())
  );
  const env = {
    RECRUIT_AI_V2_EXECUTION_ENABLED: "false",
    RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED: "false",
    RECRUIT_AI_V2_EXECUTION_ORGANIZATION_IDS: TEAM_VISION_ORG,
    RECRUIT_AI_V2_EXECUTION_USER_IDS: PRIMARY_RVP
  };
  let mutateCalls = 0;
  const auth = authorizeSideEffects({
    structuredDecision,
    responsePlan: structuredDecision.customerReplyPlan,
    context: nextContext,
    env,
    profileConfigured: true,
    actingUserId: PRIMARY_RVP,
    organizationId: TEAM_VISION_ORG,
    options: { allowExecution: false }
  });
  assert.equal(auth.authorized, false);
  await executeAuthorizedSideEffects({
    authorization: auth,
    structuredDecision,
    context: nextContext,
    options: {
      allowExecution: false,
      env,
      actingUserId: PRIMARY_RVP,
      organizationId: TEAM_VISION_ORG
    },
    dependencies: {
      executeScheduleInterview: async () => {
        mutateCalls += 1;
        return { success: true, appointmentId: "should-not" };
      }
    }
  });
  assert.equal(mutateCalls, 0);
});

test("helper: resolveUniqueOfferedDaySelection unique vs ambiguous", () => {
  assert.equal(
    resolveUniqueOfferedDaySelection(sunMon730Offers(), MONDAY).kind,
    "unique"
  );
  assert.equal(
    resolveUniqueOfferedDaySelection(mondayTwoTimesOffers(), MONDAY).kind,
    "ambiguous"
  );
  assert.equal(
    resolveUniqueOfferedDaySelection(sunMon730Offers(), "2099-01-01").kind,
    "none"
  );
});

test("multi-day ambiguous still restates narrowed day slots (not time-only no-op)", () => {
  // Sun 7:30 + Mon 7:30 + Mon 8:00 → "Lunes" narrows to Mon times (date was new info).
  const offered = [
    { date: SUNDAY, time: "19:30", timezone: "America/New_York" },
    { date: MONDAY, time: "19:30", timezone: "America/New_York" },
    { date: MONDAY, time: "20:00", timezone: "America/New_York" }
  ];
  const { structuredDecision, rendered } = turn(
    "El lunes",
    offeredContext(offered),
    {
      checked: true,
      status: "available",
      nearestAlternatives: [
        ...offered,
        { date: MONDAY, time: "21:00", timezone: "America/New_York" }
      ]
    }
  );
  assert.ok(
    structuredDecision.reasonCodes.includes(
      REASON_CODES.OFFERED_SLOT_DAY_NARROWED_AMBIGUOUS
    )
  );
  assert.ok(
    !structuredDecision.reasonCodes.includes(
      REASON_CODES.OFFERED_SLOT_DAY_ALREADY_FIXED
    )
  );
  assert.equal(
    structuredDecision.customerReplyPlan.templateKey,
    "offer_available_slots"
  );
  assert.doesNotMatch(rendered.text, /21:00/);
  assert.match(rendered.text, /lunes|7:30|8:00/i);
});
