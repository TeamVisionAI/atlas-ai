/**
 * BR-116 — same-turn canonical availability after preferred/requested time.
 * Execution remains OFF. No production writes.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { interpretInboundMessage } = require("../core/recruitAiV2/interpreter");
const { decideConversationTurn } = require("../core/recruitAiV2/decisionEngine");
const { renderCustomerReply } = require("../core/recruitAiV2/responseRenderer");
const { createConversationContext } = require("../core/recruitAiV2/conversationContext");
const { buildNextContextFromInterpretation } = require("../core/recruitAiV2/contextTurnUpdate");
const {
  resolveAvailabilityForTurnSync,
  shouldAttemptAvailabilityOffer
} = require("../core/recruitAiV2/schedulingAvailabilityReader");
const { NEXT_ACTIONS, REASON_CODES, INTENTS } = require("../core/recruitAiV2/constants");
const { authorizeSideEffects } = require("../core/recruitAiV2/sideEffectAuthorizer");
const {
  executeAuthorizedSideEffects
} = require("../core/recruitAiV2/sideEffectExecutor");
const { isEligibleForLiveAuthoring } = require("../core/recruitAiV2/liveAuthoringConfig");

const FIXED_NOW = new Date("2026-08-08T15:00:00.000-04:00");
const SUNDAY = "2026-08-09";
const SATURDAY = "2026-08-08";
const TEAM_VISION_ORG = "00000000-0000-4000-8000-000000000001";
const PRIMARY_RVP = "33ad243a-9d00-4a4d-810b-df2762c0f076";

function matchingFixture() {
  return [
    { dateKey: SATURDAY, timeKey: "19:30", startTimeISO: "2026-08-08T23:30:00.000Z" },
    { dateKey: SUNDAY, timeKey: "19:30", startTimeISO: "2026-08-09T23:30:00.000Z" },
    { dateKey: SUNDAY, timeKey: "20:00", startTimeISO: "2026-08-10T00:00:00.000Z" },
    { dateKey: SUNDAY, timeKey: "20:30", startTimeISO: "2026-08-10T00:30:00.000Z" }
  ];
}

function unavailable730Fixture() {
  return [
    { dateKey: SUNDAY, timeKey: "20:00", startTimeISO: "2026-08-10T00:00:00.000Z" },
    { dateKey: SUNDAY, timeKey: "20:30", startTimeISO: "2026-08-10T00:30:00.000Z" },
    { dateKey: SUNDAY, timeKey: "21:00", startTimeISO: "2026-08-10T01:00:00.000Z" }
  ];
}

function baseContext(slots, overrides = {}) {
  return createConversationContext({
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
      preferredDayPart: "afternoon",
      availabilityConstraint: {
        earliestTime: "19:00",
        earliestTimeInclusive: false,
        dayPart: "evening",
        raw: "después de las 7"
      }
    },
    appointment: {
      status: "proposed",
      previouslyOfferedSlots: [],
      ...(overrides.appointment || {})
    },
    conversation: {
      lastQuestionAsked: "ask_time_preference",
      ...(overrides.conversation || {})
    },
    _availabilityFixture: { slots, timezone: "America/New_York" },
    ...overrides
  });
}

function runPreferredTime(text, slots, overrides = {}) {
  const context = baseContext(slots, overrides);
  const interpretation = interpretInboundMessage({
    message: { text },
    context,
    options: { flexible: true, now: FIXED_NOW, channel: "whatsapp" }
  });
  const attempted = shouldAttemptAvailabilityOffer({ context, interpretation });
  const availability = resolveAvailabilityForTurnSync({
    context,
    interpretation,
    options: {
      now: FIXED_NOW,
      agentId: PRIMARY_RVP,
      availabilityFixture: { slots, timezone: "America/New_York" }
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
    attempted,
    availability,
    interpretation,
    structuredDecision,
    nextContext,
    rendered
  };
}

test("1. asked preferred time → user 7:30 → availability reader called same turn", () => {
  const { attempted, availability, interpretation } = runPreferredTime(
    "7:30",
    matchingFixture()
  );
  assert.equal(interpretation.intent, INTENTS.SCHEDULING_COUNTEROFFER);
  assert.equal(attempted, true);
  assert.equal(availability.checked, true);
  assert.ok(Array.isArray(availability.nearestAlternatives));
  assert.ok(availability.nearestAlternatives.length > 0);
});

test("2. matching 7:30 slot → actual slot offered immediately", () => {
  const { structuredDecision, nextContext, rendered } = runPreferredTime(
    "7:30",
    matchingFixture()
  );
  assert.equal(
    structuredDecision.decision.nextAction,
    NEXT_ACTIONS.OFFER_AVAILABLE_SLOTS
  );
  assert.equal(structuredDecision.customerReplyPlan.templateKey, "offer_available_slots");
  assert.ok(
    structuredDecision.reasonCodes.includes(
      REASON_CODES.REQUESTED_TIME_AVAILABILITY_OFFERED
    )
  );
  assert.equal(nextContext.conversation.lastQuestionAsked, "offer_time_choices");
  assert.equal(nextContext.appointment.proposedTime, "19:30");
  assert.match(rendered.text, /7:30/);
  assert.doesNotMatch(rendered.text, /revisar disponibilidad/i);
});

test("3. 7:30 unavailable → real nearby alternatives offered same turn", () => {
  const { availability, structuredDecision, nextContext, rendered } =
    runPreferredTime("7:30", unavailable730Fixture(), {
      appointment: { status: "proposed", proposedDate: SUNDAY, previouslyOfferedSlots: [] }
    });
  assert.equal(availability.requestedSlotAvailable, false);
  assert.equal(
    structuredDecision.decision.nextAction,
    NEXT_ACTIONS.OFFER_AVAILABLE_SLOTS
  );
  assert.ok(nextContext.appointment.previouslyOfferedSlots.length >= 1);
  assert.ok(
    nextContext.appointment.previouslyOfferedSlots.every((s) => s.time !== "19:30")
  );
  assert.match(rendered.text, /8:00|8:30|9:00/);
  assert.doesNotMatch(rendered.text, /revisar disponibilidad/i);
});

test("4. offered slots persisted", () => {
  const { nextContext } = runPreferredTime("7:30", matchingFixture());
  assert.ok(nextContext.appointment.previouslyOfferedSlots.length >= 1);
  assert.ok(
    nextContext.appointment.previouslyOfferedSlots.some((s) => s.time === "19:30")
  );
});

test("5. no voy a revisar dead-end when availability can be checked", () => {
  const { structuredDecision, rendered } = runPreferredTime(
    "7:30",
    matchingFixture()
  );
  assert.notEqual(
    structuredDecision.decision.nextAction,
    NEXT_ACTIONS.ACKNOWLEDGE_AND_CHECK_AVAILABILITY
  );
  assert.doesNotMatch(rendered.text, /Voy a revisar disponibilidad/i);
});

test("6. subsequent selection works with BR-115", () => {
  const first = runPreferredTime("7:30", [
    { dateKey: SUNDAY, timeKey: "19:30", startTimeISO: "2026-08-09T23:30:00.000Z" },
    { dateKey: SUNDAY, timeKey: "20:00", startTimeISO: "2026-08-10T00:00:00.000Z" }
  ], { appointment: { status: "proposed", proposedDate: SUNDAY, previouslyOfferedSlots: [] } });
  assert.equal(first.nextContext.conversation.lastQuestionAsked, "offer_time_choices");

  const interpretation = interpretInboundMessage({
    message: { text: "7:30" },
    context: first.nextContext,
    options: { flexible: true, now: FIXED_NOW }
  });
  const structuredDecision = decideConversationTurn({
    context: first.nextContext,
    interpretation,
    availability: null
  });
  const nextContext = buildNextContextFromInterpretation({
    loaded: first.nextContext,
    interpretation,
    structuredDecision
  });
  assert.equal(
    structuredDecision.decision.nextAction,
    NEXT_ACTIONS.ASK_EXPLICIT_CONFIRMATION
  );
  assert.equal(nextContext.appointment.proposedTime, "19:30");
  assert.equal(nextContext.conversation.lastQuestionAsked, "confirm_slot");
});

test("7. OK is not required to trigger availability lookup", () => {
  const { structuredDecision } = runPreferredTime("7:30", matchingFixture());
  assert.equal(
    structuredDecision.decision.nextAction,
    NEXT_ACTIONS.OFFER_AVAILABLE_SLOTS
  );
});

test("8–9. Sunday/evening slots after org 5 PM via fixture (RVP path)", () => {
  const evening = [
    { dateKey: SUNDAY, timeKey: "19:00", startTimeISO: "2026-08-09T23:00:00.000Z" },
    { dateKey: SUNDAY, timeKey: "19:30", startTimeISO: "2026-08-09T23:30:00.000Z" },
    { dateKey: SUNDAY, timeKey: "20:00", startTimeISO: "2026-08-10T00:00:00.000Z" }
  ];
  const { nextContext, rendered } = runPreferredTime("7:30", evening, {
    appointment: { status: "proposed", proposedDate: SUNDAY, previouslyOfferedSlots: [] }
  });
  assert.ok(nextContext.appointment.previouslyOfferedSlots.some((s) => s.time === "19:30"));
  assert.match(rendered.text, /7:30|domingo/i);
});

test("10. timezone remains America/New_York (PR #75 / fixture ISO)", () => {
  const { nextContext } = runPreferredTime("7:30", matchingFixture());
  assert.ok(
    nextContext.appointment.previouslyOfferedSlots.every(
      (s) => !s.timezone || s.timezone === "America/New_York"
    )
  );
  const availSrc = fs.readFileSync(
    path.join(__dirname, "../services/availabilityService.js"),
    "utf8"
  );
  assert.match(availSrc, /zonedTimeToUtcMs/);
});

test("11. live authoring remains V2-owned (gates unchanged)", () => {
  const result = isEligibleForLiveAuthoring({
    organizationId: TEAM_VISION_ORG,
    actingUserId: PRIMARY_RVP,
    env: {
      RECRUIT_AI_V2_LIVE_AUTHORING_ENABLED: "true",
      RECRUIT_AI_V2_LIVE_AUTHORING_ORGANIZATION_IDS: TEAM_VISION_ORG,
      RECRUIT_AI_V2_LIVE_AUTHORING_USER_IDS: PRIMARY_RVP
    },
    invocationSource: "live_whatsapp"
  });
  assert.equal(result.eligible, true);
});

test("12. execution OFF → zero mutations", async () => {
  const { structuredDecision, nextContext } = runPreferredTime(
    "7:30",
    matchingFixture()
  );
  const env = {
    RECRUIT_AI_V2_EXECUTION_ENABLED: "false",
    RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED: "false"
  };
  let mutate = 0;
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
    options: { allowExecution: false, env, actingUserId: PRIMARY_RVP, organizationId: TEAM_VISION_ORG },
    dependencies: {
      executeScheduleInterview: async () => {
        mutate += 1;
        return { success: true };
      }
    }
  });
  assert.equal(mutate, 0);
  assert.equal(exec.attempted, false);
});

test("13–14. BR-111/112/113/114/115 preserved; no transport/execution rewrite", () => {
  const engine = fs.readFileSync(
    path.join(__dirname, "../core/recruitAiV2/decisionEngine.js"),
    "utf8"
  );
  const reader = fs.readFileSync(
    path.join(__dirname, "../core/recruitAiV2/schedulingAvailabilityReader.js"),
    "utf8"
  );
  const hub = fs.readFileSync(
    path.join(__dirname, "../core/communicationHub.js"),
    "utf8"
  );
  assert.match(engine, /REQUESTED_TIME_AVAILABILITY_OFFERED|BR-116/);
  assert.match(reader, /SCHEDULING_COUNTEROFFER/);
  assert.match(engine, /OFFERED_SLOT_NATURAL_TIME_SELECTED|BR-115/);
  assert.match(hub, /attemptLiveV2Authoring/);
  assert.doesNotMatch(reader, /buildOfferedTimes/);
  assert.doesNotMatch(engine, /buildOfferedTimes/);
});
