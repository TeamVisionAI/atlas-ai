/**
 * BR-239 — natural acceptance / clock match against current durable offered slots.
 * Execution remains OFF except the no-duplicate create assertion.
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
  resolveUniqueOfferedSlotSelection,
  isBareOfferedSlotAcceptance,
  extractOfferedReplyClockToken
} = require("../core/recruitAiV2/conversationContext");
const { buildNextContextFromInterpretation } = require("../core/recruitAiV2/contextTurnUpdate");
const { authorizeSideEffects } = require("../core/recruitAiV2/sideEffectAuthorizer");
const {
  executeAuthorizedSideEffects
} = require("../core/recruitAiV2/sideEffectExecutor");
const { NEXT_ACTIONS, REASON_CODES, INTENTS } = require("../core/recruitAiV2/constants");
const {
  hasConfirmableAppointmentProposal
} = require("../core/recruitAiV2/schedulingConfirmation");

const FIXED_NOW = new Date("2026-09-05T15:00:00.000-04:00");
const TUESDAY = "2026-09-08";
const TEAM_VISION_ORG = "00000000-0000-4000-8000-000000000001";
const PRIMARY_RVP = "33ad243a-9d00-4a4d-810b-df2762c0f076";

function singleMorningOffer() {
  return [{ date: TUESDAY, time: "11:45", timezone: "America/New_York" }];
}

function tuesdayAfternoonOffers() {
  return [
    { date: TUESDAY, time: "12:30", timezone: "America/New_York" },
    { date: TUESDAY, time: "16:00", timezone: "America/New_York" }
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
      name: "Misleisys",
      city: "Miami",
      state: "FL",
      workAuthorization: true,
      preferredDayPart: "morning",
      preferredMeetingType: "in_person",
      ...(overrides.knownFacts || {})
    },
    appointment: {
      status: "proposed",
      proposedDate: TUESDAY,
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

function assertSelected(result, timeHhMm) {
  assert.equal(
    result.structuredDecision.decision.nextAction,
    NEXT_ACTIONS.ASK_EXPLICIT_CONFIRMATION
  );
  assert.equal(
    result.structuredDecision.customerReplyPlan.templateKey,
    "confirm_selected_slot"
  );
  assert.equal(result.nextContext.appointment.proposedTime, timeHhMm);
  assert.equal(result.nextContext.appointment.proposedDate, TUESDAY);
  assert.equal(result.nextContext.conversation.lastQuestionAsked, "confirm_slot");
  assert.equal(result.structuredDecision.decision.mayCreateAppointment, false);
  assert.doesNotMatch(String(result.rendered.text || ""), /revisar disponibilidad/i);
  assert.doesNotMatch(
    String(result.rendered.text || ""),
    /Qu[eé] hora en la ma[nñ]ana/i
  );
}

test("docs: BR-239 documented", () => {
  const rules = fs.readFileSync(
    path.join(__dirname, "../../docs/06-business/BUSINESS_RULES.md"),
    "utf8"
  );
  assert.match(rules, /## BR-239/);
  assert.match(rules, /Natural Acceptance of Current Offered Slots/);
});

test("helper: acceptance phrases and wrapped clocks", () => {
  assert.equal(isBareOfferedSlotAcceptance("Me parece bien"), true);
  assert.equal(isBareOfferedSlotAcceptance("Está bien"), true);
  assert.equal(isBareOfferedSlotAcceptance("ok"), true);
  assert.equal(isBareOfferedSlotAcceptance("11:45 está bien"), false);
  assert.equal(extractOfferedReplyClockToken("11:45 está bien"), "11:45");
  assert.equal(extractOfferedReplyClockToken("Ok 4:00"), "4:00");
  assert.equal(extractOfferedReplyClockToken("a las 4"), "4:00");
  assert.equal(extractOfferedReplyClockToken("esa de las 4"), "4:00");
  assert.equal(extractOfferedReplyClockToken("la de 4"), "4:00");
  assert.equal(extractOfferedReplyClockToken("me sirve 11:45"), "11:45");
  assert.equal(extractOfferedReplyClockToken("Me parece bien"), null);

  const four = resolveUniqueOfferedSlotSelection(tuesdayAfternoonOffers(), "4");
  assert.equal(four.kind, "unique");
  assert.equal(four.selected.time, "16:00");

  const stale = resolveUniqueOfferedSlotSelection(
    tuesdayAfternoonOffers(),
    "11:45"
  );
  assert.equal(stale.kind, "none");
});

test("A. one offered slot 11:45 AM + Me parece bien → selects 11:45", () => {
  const result = turn("Me parece bien", offeredContext(singleMorningOffer()));
  assertSelected(result, "11:45");
  assert.ok(
    result.structuredDecision.reasonCodes.includes(
      REASON_CODES.OFFERED_SLOT_ACCEPTANCE_SELECTED
    )
  );
});

test("A2. Misleisys canary: ask_time_preference + single 11:45 + Me parece bien", () => {
  const result = turn(
    "Me parece bien",
    offeredContext(singleMorningOffer(), {
      conversation: { lastQuestionAsked: "ask_time_preference" }
    })
  );
  assertSelected(result, "11:45");
});

test("B. one offered slot + Está bien → selects it", () => {
  const result = turn("Está bien", offeredContext(singleMorningOffer()));
  assertSelected(result, "11:45");
});

test("C. multiple slots + Me parece bien → clarify which, do not guess", () => {
  const result = turn(
    "Me parece bien",
    offeredContext(tuesdayAfternoonOffers(), {
      knownFacts: { preferredDayPart: "afternoon" }
    })
  );
  assert.equal(result.structuredDecision.decision.nextAction, NEXT_ACTIONS.CLARIFY_ONCE);
  assert.equal(
    result.structuredDecision.customerReplyPlan.templateKey,
    "clarify_offered_slot_time"
  );
  assert.ok(
    result.structuredDecision.reasonCodes.includes(
      REASON_CODES.OFFERED_SLOT_ACCEPTANCE_AMBIGUOUS
    )
  );
  assert.notEqual(result.nextContext.conversation.lastQuestionAsked, "confirm_slot");
  assert.equal(result.structuredDecision.contextPatch?.appointment?.proposedTime, undefined);
  assert.match(String(result.rendered.text || ""), /12:30|4:00|16:00|cuál|prefieres/i);
});

test("D. multiple slots + Ok 4:00 → selects 4:00 PM", () => {
  const result = turn(
    "Ok 4:00",
    offeredContext(tuesdayAfternoonOffers(), {
      knownFacts: { preferredDayPart: "afternoon" }
    })
  );
  assert.equal(result.interpretation.entities.requestedTime, "16:00");
  assertSelected(result, "16:00");
});

test("E. same offers + 4 → selects 4:00 PM via offered context", () => {
  const result = turn(
    "4",
    offeredContext(tuesdayAfternoonOffers(), {
      knownFacts: { preferredDayPart: "afternoon" }
    })
  );
  assert.equal(result.interpretation.entities.requestedTime, "16:00");
  assertSelected(result, "16:00");
});

test("F. same offers + a las 4 → selects 4:00 PM", () => {
  const result = turn(
    "a las 4",
    offeredContext(tuesdayAfternoonOffers(), {
      knownFacts: { preferredDayPart: "afternoon" }
    })
  );
  assertSelected(result, "16:00");
});

test("G. offered 11:45 AM + 11:45 está bien → selects 11:45 AM", () => {
  const result = turn("11:45 está bien", offeredContext(singleMorningOffer()));
  assert.equal(result.interpretation.entities.requestedTime, "11:45");
  assertSelected(result, "11:45");
});

test("H. offered 11:45 AM + me sirve 11:45 → selects it", () => {
  const result = turn("me sirve 11:45", offeredContext(singleMorningOffer()));
  assertSelected(result, "11:45");
});

test("I. offered 12:30 + 4:00 + 3:00 → do not select an unoffered slot", () => {
  const result = turn(
    "3:00",
    offeredContext(tuesdayAfternoonOffers(), {
      knownFacts: { preferredDayPart: "afternoon" }
    })
  );
  assert.notEqual(result.nextContext.appointment.proposedTime, "12:30");
  assert.notEqual(result.nextContext.appointment.proposedTime, "16:00");
  assert.notEqual(result.nextContext.conversation.lastQuestionAsked, "confirm_slot");
  assert.notEqual(
    result.structuredDecision.customerReplyPlan.templateKey,
    "confirm_selected_slot"
  );
});

test("J. stale 11:45 after newer 12:30 + 4:00 offer → do not bind stale", () => {
  const result = turn(
    "11:45",
    offeredContext(tuesdayAfternoonOffers(), {
      knownFacts: { preferredDayPart: "afternoon" }
    })
  );
  assert.notEqual(result.nextContext.appointment.proposedTime, "11:45");
  assert.notEqual(result.nextContext.conversation.lastQuestionAsked, "confirm_slot");
  const match = resolveUniqueOfferedSlotSelection(
    tuesdayAfternoonOffers(),
    "11:45"
  );
  assert.equal(match.kind, "none");
});

test("K. confirmation step still requires existing Si semantics", () => {
  const selected = turn("Me parece bien", offeredContext(singleMorningOffer()));
  assert.equal(selected.nextContext.conversation.lastQuestionAsked, "confirm_slot");
  assert.equal(hasConfirmableAppointmentProposal(selected.nextContext), true);

  const confirmed = turn("Si", selected.nextContext);
  assert.equal(confirmed.interpretation.intent, INTENTS.SCHEDULE_CONFIRM);
  assert.notEqual(
    confirmed.structuredDecision.customerReplyPlan.templateKey,
    "confirm_selected_slot"
  );
  assert.notEqual(
    confirmed.interpretation.entities?.offeredSlotAcceptance,
    "unique"
  );
});

test("L. selection does not create an appointment or calendar event", async () => {
  const { structuredDecision, nextContext } = turn(
    "Ok 4:00",
    offeredContext(tuesdayAfternoonOffers(), {
      knownFacts: { preferredDayPart: "afternoon" }
    })
  );
  assert.equal(structuredDecision.decision.mayCreateAppointment, false);
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
