/**
 * BR-115 — natural/spoken time matching a previously offered slot = selection.
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
const {
  createConversationContext,
  resolveUniqueOfferedSlotSelection
} = require("../core/recruitAiV2/conversationContext");
const { buildNextContextFromInterpretation } = require("../core/recruitAiV2/contextTurnUpdate");
const { authorizeSideEffects } = require("../core/recruitAiV2/sideEffectAuthorizer");
const {
  executeAuthorizedSideEffects
} = require("../core/recruitAiV2/sideEffectExecutor");
const { NEXT_ACTIONS, REASON_CODES, INTENTS } = require("../core/recruitAiV2/constants");
const { isEligibleForLiveAuthoring } = require("../core/recruitAiV2/liveAuthoringConfig");

const FIXED_NOW = new Date("2026-08-08T15:00:00.000-04:00"); // Saturday
const SUNDAY = "2026-08-09";
const SATURDAY = "2026-08-08";
const TEAM_VISION_ORG = "00000000-0000-4000-8000-000000000001";
const PRIMARY_RVP = "33ad243a-9d00-4a4d-810b-df2762c0f076";

function sundayOffers() {
  return [
    { date: SUNDAY, time: "19:30", timezone: "America/New_York" },
    { date: SUNDAY, time: "20:00", timezone: "America/New_York" }
  ];
}

function ambiguousOffers() {
  return [
    { date: SATURDAY, time: "19:30", timezone: "America/New_York" },
    { date: SUNDAY, time: "19:30", timezone: "America/New_York" }
  ];
}

function offeredContext(offered, overrides = {}) {
  return createConversationContext({
    preferredLanguage: "spanish",
    languageMeta: { source: "active_conversation" },
    timezone: "America/New_York",
    _testNow: FIXED_NOW,
    organizationId: TEAM_VISION_ORG,
    currentStage: "scheduling",
    knownFacts: {
      name: "Zoraida",
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
      proposedDate: SUNDAY,
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

function turn(text, context) {
  const interpretation = interpretInboundMessage({
    message: { text },
    context,
    options: { flexible: true, now: FIXED_NOW, channel: "whatsapp" }
  });
  const structuredDecision = decideConversationTurn({
    context,
    interpretation,
    availability: null
  });
  const nextContext = buildNextContextFromInterpretation({
    loaded: context,
    interpretation,
    structuredDecision
  });
  const rendered = renderCustomerReply(structuredDecision.customerReplyPlan);
  return { interpretation, structuredDecision, nextContext, rendered };
}

test("1. offered Sunday 7:30 + 8:00; reply 7:30 → selects Sunday 7:30", () => {
  const { interpretation, structuredDecision, nextContext, rendered } = turn(
    "7:30",
    offeredContext(sundayOffers())
  );
  assert.equal(interpretation.intent, INTENTS.SCHEDULING_COUNTEROFFER);
  assert.equal(interpretation.entities.requestedTime, "19:30");
  assert.equal(
    structuredDecision.decision.nextAction,
    NEXT_ACTIONS.ASK_EXPLICIT_CONFIRMATION
  );
  assert.equal(structuredDecision.customerReplyPlan.templateKey, "confirm_selected_slot");
  assert.ok(
    structuredDecision.reasonCodes.includes(
      REASON_CODES.OFFERED_SLOT_NATURAL_TIME_SELECTED
    )
  );
  assert.equal(nextContext.appointment.proposedDate, SUNDAY);
  assert.equal(nextContext.appointment.proposedTime, "19:30");
  assert.equal(nextContext.conversation.lastQuestionAsked, "confirm_slot");
  assert.doesNotMatch(rendered.text, /revisar disponibilidad/i);
});

test("2. reply 8:00 → selects Sunday 8:00", () => {
  const { structuredDecision, nextContext } = turn(
    "8:00",
    offeredContext(sundayOffers())
  );
  assert.equal(
    structuredDecision.decision.nextAction,
    NEXT_ACTIONS.ASK_EXPLICIT_CONFIRMATION
  );
  assert.equal(nextContext.appointment.proposedTime, "20:00");
  assert.equal(nextContext.appointment.proposedDate, SUNDAY);
});

test("3. reply domingo 7:30 → selects Sunday 7:30", () => {
  const { interpretation, structuredDecision, nextContext } = turn(
    "domingo 7:30",
    offeredContext(ambiguousOffers())
  );
  assert.equal(interpretation.entities.requestedTime, "19:30");
  assert.equal(interpretation.entities.resolvedDate?.isoDate, SUNDAY);
  assert.equal(
    structuredDecision.decision.nextAction,
    NEXT_ACTIONS.ASK_EXPLICIT_CONFIRMATION
  );
  assert.equal(nextContext.appointment.proposedDate, SUNDAY);
  assert.equal(nextContext.appointment.proposedTime, "19:30");
});

test("4. same time on two days; reply 7:30 → clarification, no selection", () => {
  const { structuredDecision, nextContext, rendered } = turn(
    "7:30",
    offeredContext(ambiguousOffers(), {
      appointment: { proposedDate: null, previouslyOfferedSlots: ambiguousOffers() }
    })
  );
  assert.equal(structuredDecision.decision.nextAction, NEXT_ACTIONS.CLARIFY_ONCE);
  assert.equal(
    structuredDecision.customerReplyPlan.templateKey,
    "clarify_offered_slot_day"
  );
  assert.ok(
    structuredDecision.reasonCodes.includes(REASON_CODES.OFFERED_SLOT_TIME_AMBIGUOUS)
  );
  assert.notEqual(nextContext.conversation.lastQuestionAsked, "confirm_slot");
  assert.equal(nextContext.conversation.lastQuestionAsked, "offer_time_choices");
  assert.match(rendered.text, /más de un día|more than one day/i);
  // Must not lock a single date/time selection.
  assert.equal(structuredDecision.contextPatch?.appointment?.proposedTime, undefined);
  assert.equal(structuredDecision.contextPatch?.appointment?.proposedDate, undefined);
});

test("5. time not in offered set → remains counteroffer/check-availability", () => {
  // 9:00 PM is after the evening constraint but not in the offered menu.
  const { structuredDecision, nextContext } = turn(
    "9:00",
    offeredContext(sundayOffers())
  );
  assert.equal(
    structuredDecision.decision.nextAction,
    NEXT_ACTIONS.ACKNOWLEDGE_AND_CHECK_AVAILABILITY
  );
  assert.equal(
    structuredDecision.customerReplyPlan.templateKey,
    "acknowledge_counteroffer_check_availability"
  );
  assert.equal(nextContext.conversation.lastQuestionAsked, "awaiting_availability");
});

test("6. numbered selection 1/2 still works", () => {
  const one = turn("1", offeredContext(sundayOffers()));
  assert.equal(one.interpretation.intent, INTENTS.SELECT_OPTION);
  assert.equal(
    one.structuredDecision.decision.nextAction,
    NEXT_ACTIONS.ASK_EXPLICIT_CONFIRMATION
  );
  assert.equal(one.nextContext.appointment.proposedTime, "19:30");

  const two = turn("2", offeredContext(sundayOffers()));
  assert.equal(two.interpretation.intent, INTENTS.SELECT_OPTION);
  assert.equal(two.nextContext.appointment.proposedTime, "20:00");
});

test("7. selected natural-time slot proceeds to confirmation state", () => {
  const { structuredDecision, nextContext } = turn(
    "7:30",
    offeredContext(sundayOffers())
  );
  assert.equal(nextContext.currentStage, "proposed");
  assert.equal(nextContext.conversation.lastQuestionAsked, "confirm_slot");
  assert.equal(structuredDecision.decision.requiresExplicitConfirmation, true);
  assert.equal(structuredDecision.decision.mayCreateAppointment, false);
});

test("8. durable context persists selected slot + offered set", () => {
  const { nextContext } = turn("7:30", offeredContext(sundayOffers(), {
    knownFacts: {
      name: "Zoraida",
      email: null,
      city: "Miami",
      state: "FL",
      workAuthorization: true,
      preferredDayPart: "afternoon"
    }
  }));
  assert.equal(nextContext.appointment.proposedDate, SUNDAY);
  assert.equal(nextContext.appointment.proposedTime, "19:30");
  assert.equal(nextContext.appointment.previouslyOfferedSlots.length, 2);
  assert.equal(nextContext.knownFacts.name, "Zoraida");
  assert.notEqual(nextContext.conversation.lastQuestionAsked, "awaiting_availability");
});

test("9. execution OFF → zero appointment/calendar/BR-080 mutations", async () => {
  const { structuredDecision, nextContext } = turn(
    "7:30",
    offeredContext(sundayOffers())
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
  assert.deepEqual(exec.performed || [], []);
});

test("10. BR-114 live authoring gates unchanged (V2-owned path)", () => {
  const eligible = isEligibleForLiveAuthoring({
    organizationId: TEAM_VISION_ORG,
    actingUserId: PRIMARY_RVP,
    env: {
      RECRUIT_AI_V2_LIVE_AUTHORING_ENABLED: "true",
      RECRUIT_AI_V2_LIVE_AUTHORING_ORGANIZATION_IDS: TEAM_VISION_ORG,
      RECRUIT_AI_V2_LIVE_AUTHORING_USER_IDS: PRIMARY_RVP
    },
    invocationSource: "live_whatsapp"
  });
  assert.equal(eligible.eligible, true);
  const bridge = fs.readFileSync(
    path.join(__dirname, "../core/recruitAiV2/liveAuthoringBridge.js"),
    "utf8"
  );
  assert.match(bridge, /attemptLiveV2Authoring/);
});

test("11. BR-111/112/113 preserved — no execution path edits in this fix", () => {
  const engine = fs.readFileSync(
    path.join(__dirname, "../core/recruitAiV2/decisionEngine.js"),
    "utf8"
  );
  assert.match(engine, /OFFERED_SLOT_NATURAL_TIME_SELECTED|BR-115/);
  assert.doesNotMatch(engine, /RECRUIT_AI_V2_EXECUTION_ENABLED\s*=/);
  const hub = fs.readFileSync(
    path.join(__dirname, "../core/communicationHub.js"),
    "utf8"
  );
  assert.match(hub, /attemptLiveV2Authoring/);
});

test("12. helper: unique vs ambiguous matching", () => {
  const unique = resolveUniqueOfferedSlotSelection(sundayOffers(), "19:30");
  assert.equal(unique.kind, "unique");
  assert.equal(unique.selected.time, "19:30");

  const amb = resolveUniqueOfferedSlotSelection(ambiguousOffers(), "19:30");
  assert.equal(amb.kind, "ambiguous");

  const narrowed = resolveUniqueOfferedSlotSelection(ambiguousOffers(), "19:30", {
    dateIso: SUNDAY
  });
  assert.equal(narrowed.kind, "unique");
  assert.equal(narrowed.selected.date, SUNDAY);

  const none = resolveUniqueOfferedSlotSelection(sundayOffers(), "18:00");
  assert.equal(none.kind, "none");
});

test("bare 8 selects Sunday 8:00 when that is the unique offered match", () => {
  const { interpretation, nextContext } = turn(
    "8",
    offeredContext(sundayOffers())
  );
  assert.equal(interpretation.intent, INTENTS.SCHEDULING_COUNTEROFFER);
  assert.equal(interpretation.entities.requestedTime, "20:00");
  assert.equal(nextContext.appointment.proposedTime, "20:00");
});
