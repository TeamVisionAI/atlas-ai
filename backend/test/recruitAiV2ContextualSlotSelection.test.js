/**
 * Contextual offered-slot selection / revision (real inbound transcript).
 * Uses previouslyOfferedSlots + proposed slot — no phrase-table parser.
 * Execution remains OFF. No Calendar / appointment mutation.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");

const { interpretInboundMessage } = require("../core/recruitAiV2/interpreter");
const { decideConversationTurn } = require("../core/recruitAiV2/decisionEngine");
const { renderCustomerReply } = require("../core/recruitAiV2/responseRenderer");
const { createConversationContext } = require("../core/recruitAiV2/conversationContext");
const {
  buildNextContextFromInterpretation
} = require("../core/recruitAiV2/contextTurnUpdate");
const { authorizeSideEffects } = require("../core/recruitAiV2/sideEffectAuthorizer");
const {
  executeAuthorizedSideEffects
} = require("../core/recruitAiV2/sideEffectExecutor");
const { NEXT_ACTIONS, INTENTS, REASON_CODES } = require("../core/recruitAiV2/constants");
const { parseLocationAnswer } = require("../core/recruitAiV2/locationFacts");

const FIXED_NOW = new Date("2026-08-10T15:00:00.000-04:00"); // Monday
const TODAY = "2026-08-10";
const TOMORROW = "2026-08-11";
const TEAM_VISION_ORG = "00000000-0000-4000-8000-000000000001";
const PRIMARY_RVP = "33ad243a-9d00-4a4d-810b-df2762c0f076";

function todayTomorrowOffers() {
  return [
    { date: TODAY, time: "15:00", timezone: "America/New_York" },
    { date: TOMORROW, time: "12:00", timezone: "America/New_York" }
  ];
}

function offeredContext(offered = todayTomorrowOffers(), overrides = {}) {
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
      city: "Jacksonville",
      state: "FL",
      workAuthorization: true,
      preferredDayPart: "afternoon",
      preferredMeetingType: "zoom",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed"
    },
    appointment: {
      status: "proposed",
      proposedDate: null,
      proposedTime: null,
      previouslyOfferedSlots: offered,
      ...(overrides.appointment || {})
    },
    conversation: {
      lastQuestionAsked: "offer_time_choices",
      lastAtlasOutboundText:
        "Tengo disponible hoy a las 3:00 PM y mañana martes a las 12:00 PM. ¿Cuál te funciona mejor?",
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
  nextContext._testNow = FIXED_NOW;
  const rendered = renderCustomerReply(structuredDecision.customerReplyPlan);
  return { interpretation, structuredDecision, nextContext, rendered };
}

test("1. exact real transcript: Mañana 12 → select tomorrow 12; Si esa hora → deferred confirm", () => {
  let ctx = offeredContext();
  const select = turn("Mañana 12", ctx);
  assert.equal(select.interpretation.intent, INTENTS.SCHEDULING_COUNTEROFFER);
  assert.equal(select.nextContext.appointment.proposedDate, TOMORROW);
  assert.equal(select.nextContext.appointment.proposedTime, "12:00");
  assert.equal(
    select.structuredDecision.decision.nextAction,
    NEXT_ACTIONS.ASK_EXPLICIT_CONFIRMATION
  );
  assert.equal(
    select.structuredDecision.customerReplyPlan.templateKey,
    "confirm_selected_slot"
  );
  assert.match(select.rendered.text, /mañana/i);
  assert.match(select.rendered.text, /12:00\s*PM/i);
  assert.match(select.rendered.text, /SI|sí/i);
  assert.equal(select.structuredDecision.decision.mayCreateAppointment, false);
  assert.doesNotMatch(select.rendered.text, /dato que te acabo de pedir/i);
  assert.doesNotMatch(select.rendered.text, /Continuemos/i);

  ctx = select.nextContext;
  const confirm = turn("Si esa hora", ctx);
  assert.equal(confirm.interpretation.intent, INTENTS.SCHEDULE_CONFIRM);
  assert.equal(
    confirm.structuredDecision.customerReplyPlan.templateKey,
    "appointment_confirm_deferred"
  );
  assert.equal(confirm.nextContext.appointment.proposedDate, TOMORROW);
  assert.equal(confirm.nextContext.appointment.proposedTime, "12:00");
  assert.doesNotMatch(confirm.rendered.text, /Continuemos/i);
  assert.doesNotMatch(confirm.rendered.text, /dato que te acabo de pedir/i);
});

test('2. "Mañana 12" selects tomorrow 12:00', () => {
  const { nextContext, rendered } = turn("Mañana 12", offeredContext());
  assert.equal(nextContext.appointment.proposedDate, TOMORROW);
  assert.equal(nextContext.appointment.proposedTime, "12:00");
  assert.match(rendered.text, /12:00\s*PM/i);
});

test('3. "Para mañana" unique tomorrow slot → select', () => {
  const { interpretation, nextContext, rendered } = turn(
    "Para mañana",
    offeredContext()
  );
  assert.equal(interpretation.intent, INTENTS.SCHEDULING_DATE_PROPOSAL);
  assert.equal(nextContext.appointment.proposedDate, TOMORROW);
  assert.equal(nextContext.appointment.proposedTime, "12:00");
  assert.doesNotMatch(rendered.text, /estado/i);
});

test('4. "Mañana" with one tomorrow slot → select', () => {
  const { interpretation, nextContext } = turn("Mañana", offeredContext());
  assert.equal(interpretation.intent, INTENTS.SCHEDULING_DATE_PROPOSAL);
  assert.equal(nextContext.appointment.proposedDate, TOMORROW);
  assert.equal(nextContext.appointment.proposedTime, "12:00");
});

test('5. "Mañana" with multiple tomorrow slots → clarification', () => {
  const offered = [
    { date: TOMORROW, time: "12:00", timezone: "America/New_York" },
    { date: TOMORROW, time: "15:00", timezone: "America/New_York" }
  ];
  const { structuredDecision, rendered, nextContext } = turn(
    "Mañana",
    offeredContext(offered)
  );
  assert.ok(
    structuredDecision.customerReplyPlan.templateKey ===
      "clarify_offered_slot_time" ||
      structuredDecision.reasonCodes.includes(
        REASON_CODES.OFFERED_SLOT_DAY_NARROWED_AMBIGUOUS
      ) ||
      structuredDecision.reasonCodes.includes(
        REASON_CODES.OFFERED_SLOT_DAY_ALREADY_FIXED
      )
  );
  assert.notEqual(nextContext.conversation.lastQuestionAsked, "ask_state");
  assert.doesNotMatch(rendered.text, /dato que te acabo de pedir/i);
  assert.match(rendered.text, /12:00|3:00|15:00|Prefieres/i);
});

test('6. "Sí esa hora" confirms selected slot (deferred, execution OFF)', () => {
  const ctx = offeredContext(todayTomorrowOffers(), {
    currentStage: "proposed",
    appointment: {
      status: "proposed",
      proposedDate: TOMORROW,
      proposedTime: "12:00",
      previouslyOfferedSlots: todayTomorrowOffers()
    },
    conversation: {
      lastQuestionAsked: "confirm_slot",
      lastAtlasOutboundText:
        "Perfecto, mañana a las 12:00 PM. Responde SI para confirmar esa hora."
    }
  });
  const { interpretation, structuredDecision, nextContext, rendered } = turn(
    "Sí esa hora",
    ctx
  );
  assert.equal(interpretation.intent, INTENTS.SCHEDULE_CONFIRM);
  assert.equal(
    structuredDecision.customerReplyPlan.templateKey,
    "appointment_confirm_deferred"
  );
  assert.equal(nextContext.appointment.proposedTime, "12:00");
  assert.doesNotMatch(rendered.text, /Continuemos/i);
});

test('7. "Esa hora" refers to proposed slot', () => {
  const ctx = offeredContext(todayTomorrowOffers(), {
    currentStage: "proposed",
    appointment: {
      status: "proposed",
      proposedDate: TOMORROW,
      proposedTime: "12:00",
      previouslyOfferedSlots: todayTomorrowOffers()
    },
    conversation: {
      lastQuestionAsked: "confirm_slot",
      lastAtlasOutboundText:
        "Perfecto, mañana a las 12:00 PM. Responde SI para confirmar esa hora."
    }
  });
  const { interpretation, nextContext } = turn("Esa hora", ctx);
  assert.equal(interpretation.intent, INTENTS.SCHEDULE_CONFIRM);
  assert.equal(nextContext.appointment.proposedDate, TOMORROW);
  assert.equal(nextContext.appointment.proposedTime, "12:00");
});

test('8. "Mejor a las 3" revises to offered 3:00 PM', () => {
  const { nextContext, rendered } = turn("Mejor a las 3", offeredContext());
  assert.equal(nextContext.appointment.proposedDate, TODAY);
  assert.equal(nextContext.appointment.proposedTime, "15:00");
  assert.match(rendered.text, /3:00\s*PM/i);
});

test('9. "Tarde" prefers afternoon among offered slots', () => {
  const { interpretation, structuredDecision, rendered } = turn(
    "Tarde",
    offeredContext()
  );
  assert.equal(interpretation.intent, INTENTS.PROVIDE_DAY_PART);
  assert.notEqual(
    structuredDecision.customerReplyPlan.templateKey,
    "clarify_once"
  );
  assert.doesNotMatch(rendered.text, /dato que te acabo de pedir/i);
  assert.doesNotMatch(rendered.text, /estado/i);
});

test('10. "Mejor mañana" revises day, not city', () => {
  const { interpretation, nextContext, rendered } = turn(
    "Mejor mañana",
    offeredContext()
  );
  assert.equal(interpretation.intent, INTENTS.SCHEDULING_DATE_PROPOSAL);
  assert.equal(nextContext.appointment.proposedDate, TOMORROW);
  assert.notEqual(nextContext.conversation.lastQuestionAsked, "ask_state");
  assert.doesNotMatch(rendered.text, /estado/i);
  assert.equal(parseLocationAnswer("Mejor mañana"), null);
});

test("11. no city/state misclassification for scheduling phrases", () => {
  for (const phrase of [
    "Para mañana",
    "Esa hora",
    "Si esa hora",
    "Mejor mañana",
    "Mañana 12",
    "Tarde"
  ]) {
    assert.equal(
      parseLocationAnswer(phrase),
      null,
      `location parse must reject: ${phrase}`
    );
  }
});

test("12. no generic clarify_once when context resolves uniquely", () => {
  for (const phrase of ["Mañana 12", "Para mañana", "Mañana", "Mejor a las 3"]) {
    const { structuredDecision, rendered } = turn(phrase, offeredContext());
    assert.notEqual(
      structuredDecision.customerReplyPlan.templateKey,
      "clarify_once",
      phrase
    );
    assert.doesNotMatch(rendered.text, /dato que te acabo de pedir/i);
  }
});

test("13. no CE double reply — single customerReplyPlan text per turn", () => {
  const { rendered, structuredDecision } = turn("Mañana 12", offeredContext());
  assert.equal(typeof rendered.text, "string");
  assert.ok(rendered.text.length > 0);
  assert.equal(
    structuredDecision.customerReplyPlan.templateKey,
    "confirm_selected_slot"
  );
  // One reply body — not stacked Continuemos + confirm.
  assert.doesNotMatch(rendered.text, /Continuemos/i);
  assert.equal((rendered.text.match(/\?/g) || []).length <= 1, true);
});

test("14–15. execution OFF remains respected — no appointment/Calendar mutation", async () => {
  let ctx = offeredContext();
  const select = turn("Mañana 12", ctx);
  const confirm = turn("Si esa hora", select.nextContext);
  assert.equal(
    confirm.structuredDecision.customerReplyPlan.templateKey,
    "appointment_confirm_deferred"
  );
  assert.equal(confirm.structuredDecision.decision.executionAuthorized, false);

  const env = {
    RECRUIT_AI_V2_EXECUTION_ENABLED: "false",
    RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED: "false",
    RECRUIT_AI_V2_EXECUTION_ORGANIZATION_IDS: TEAM_VISION_ORG,
    RECRUIT_AI_V2_EXECUTION_USER_IDS: PRIMARY_RVP
  };
  let mutateCalls = 0;
  const auth = authorizeSideEffects({
    structuredDecision: confirm.structuredDecision,
    responsePlan: confirm.structuredDecision.customerReplyPlan,
    context: confirm.nextContext,
    env,
    profileConfigured: true,
    actingUserId: PRIMARY_RVP,
    organizationId: TEAM_VISION_ORG,
    options: { allowExecution: false }
  });
  assert.equal(auth.authorized, false);
  const exec = await executeAuthorizedSideEffects({
    authorization: auth,
    structuredDecision: confirm.structuredDecision,
    context: confirm.nextContext,
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
