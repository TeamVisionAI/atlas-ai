/**
 * BR-212 — IUL slot pagination + selected-slot booking transition.
 * Does not redesign BR-211 interactive delivery. Preserves BR-190 create-before-confirm.
 */

"use strict";

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createConversationContext,
  interpretInboundMessage,
  decideConversationTurn,
  buildResponsePlan,
  renderCustomerReply,
  INTENTS
} = require("../core/recruitAiV2");
const {
  NEXT_ACTIONS,
  REASON_CODES,
  FEATURE_FLAGS,
  V2_EXECUTABLE_ACTIONS
} = require("../core/recruitAiV2/constants");
const {
  ASK,
  CONVERSATION_GOAL,
  CAMPAIGN_KIND
} = require("../core/recruitAiV2/iulAdConversation");
const { IUL_OPTION_IDS } = require("../core/recruitAiV2/iulQualificationOptions");
const {
  IUL_SLOT_MORE_ID,
  IUL_SLOT_ID_PREFIX,
  formatIulSlotButtonTitle,
  resolveIulSlotBySelectionId
} = require("../core/recruitAiV2/iulSlotSelection");
const { authorizeSideEffects } = require("../core/recruitAiV2/sideEffectAuthorizer");
const { resolveConfirmedSlot } = require("../core/recruitAiV2/sideEffectExecutor");
const { applyExecutionOutcomeToReply } = require("../core/recruitAiV2/orchestrator");

const NOW = "2026-09-01T16:00:00.000Z";
const TEAM_VISION_ORG = "00000000-0000-4000-8000-000000000001";
const AGENT_ID = "33ad243a-9d00-4a4d-810b-df2762c0f076";

function slot(date, time) {
  return { dateKey: date, timeKey: time, date, time, timezone: "America/New_York" };
}

function iulContext(overrides = {}) {
  return createConversationContext({
    preferredLanguage: "spanish",
    conversationGoal: CONVERSATION_GOAL,
    campaignKind: CAMPAIGN_KIND,
    campaignIntakePurpose: "IUL",
    organizationId: TEAM_VISION_ORG,
    agentId: AGENT_ID,
    timezone: "America/New_York",
    _testNow: NOW,
    knownFacts: { name: "Miller", iulSelectedDayPart: "morning" },
    conversation: { lastQuestionAsked: ASK.SCHEDULING_DAY_PART },
    ...overrides
  });
}

function turn(message, context) {
  const interpretation = interpretInboundMessage({
    message: typeof message === "string" ? { text: message } : message,
    context
  });
  const decision = decideConversationTurn({ context, interpretation });
  const plan = buildResponsePlan(decision);
  const rendered = renderCustomerReply(plan);
  return { interpretation, decision, plan, rendered };
}

function morningTap() {
  return {
    text: "En la mañana",
    interactiveReply: {
      type: "button_reply",
      id: IUL_OPTION_IDS.DAY_MORNING,
      title: "En la mañana"
    }
  };
}

function moreTap() {
  return {
    text: "Ver más horarios",
    interactiveReply: {
      type: "button_reply",
      id: IUL_SLOT_MORE_ID,
      title: "Ver más horarios"
    }
  };
}

function slotTap(offered, index = 1) {
  const selected = offered[index];
  return {
    text: formatIulSlotButtonTitle(selected, "es"),
    interactiveReply: {
      type: "button_reply",
      id: selected.selectionId,
      title: formatIulSlotButtonTitle(selected, "es")
    }
  };
}

function interactive(decision) {
  return decision.customerReplyPlan?.entities?.whatsappInteractive || null;
}

function optionIds(decision) {
  const payload = interactive(decision);
  if (!payload) return [];
  if (payload.type === "button") {
    return (payload.action?.buttons || []).map((row) => row.reply?.id);
  }
  return (payload.action?.sections || []).flatMap((section) =>
    (section.rows || []).map((row) => row.id)
  );
}

function offeredTimes(decision) {
  return (decision.contextPatch?.appointment?.previouslyOfferedSlots || []).map(
    (row) => row.time || row.timeKey
  );
}

const FOUR_SLOTS = [
  slot("2026-09-02", "09:00"),
  slot("2026-09-02", "12:00"),
  slot("2026-09-02", "14:00"),
  slot("2026-09-03", "09:30")
];

function firstOffer(slots = FOUR_SLOTS) {
  return turn(morningTap(), iulContext({ _availabilityFixture: { slots } }));
}

function moreContext(first, slots = FOUR_SLOTS) {
  return iulContext({
    conversation: { lastQuestionAsked: ASK.OFFER_SLOTS },
    appointment: {
      previouslyOfferedSlots: first.decision.contextPatch.appointment.previouslyOfferedSlots
    },
    knownFacts: {
      ...first.decision.contextPatch.knownFacts,
      iulSelectedDayPart: "morning"
    },
    _availabilityFixture: { slots }
  });
}

test("A) first offer has two slots + More", () => {
  const { decision } = firstOffer();
  const ids = optionIds(decision);
  assert.equal(ids.filter((id) => id !== IUL_SLOT_MORE_ID).length, 2);
  assert.ok(ids.includes(IUL_SLOT_MORE_ID));
  assert.equal(interactive(decision).type, "button");
});

test("B) More excludes previously offered slots", () => {
  const first = firstOffer();
  const more = turn(moreTap(), moreContext(first));
  assert.equal(more.interpretation.intent, INTENTS.IUL_REQUEST_MORE_SLOTS);
  const next = offeredTimes(more.decision);
  assert.ok(!next.includes("09:00"));
  assert.ok(!next.includes("12:00"));
  assert.ok(next.includes("14:00") || next.includes("09:30"));
});

test("C) second More never repeats same slots", () => {
  const first = firstOffer();
  const second = turn(moreTap(), moreContext(first));
  const third = turn(
    moreTap(),
    moreContext(second, FOUR_SLOTS)
  );
  const firstTimes = offeredTimes(first.decision);
  const secondTimes = offeredTimes(second.decision);
  const thirdTimes = offeredTimes(third.decision);
  assert.notDeepEqual(secondTimes, firstTimes);
  if (third.decision.customerReplyPlan.templateKey === "iul_no_more_review_slots") {
    assert.equal(optionIds(third.decision).includes(IUL_SLOT_MORE_ID), false);
  } else {
    assert.ok(thirdTimes.every((time) => !firstTimes.includes(time)));
    assert.ok(thirdTimes.every((time) => !secondTimes.includes(time) || thirdTimes.length === 0));
  }
});

test("D) no unused slots → More button omitted", () => {
  const first = firstOffer([slot("2026-09-02", "09:00"), slot("2026-09-02", "12:00")]);
  const more = turn(
    moreTap(),
    moreContext(first, [slot("2026-09-02", "09:00"), slot("2026-09-02", "12:00")])
  );
  assert.equal(more.decision.customerReplyPlan.templateKey, "iul_no_more_review_slots");
  assert.match(more.rendered.text, /Esos son los horarios disponibles que tengo por ahora/);
  assert.equal(optionIds(more.decision).includes(IUL_SLOT_MORE_ID), false);
  assert.ok(offeredTimes(more.decision).includes("09:00"));
  assert.ok(offeredTimes(more.decision).includes("12:00"));
});

test("E) valid IUL_SLOT_* selection resolves exact stored slot", () => {
  const first = firstOffer();
  const offered = first.decision.contextPatch.appointment.previouslyOfferedSlots;
  const selected = offered[1];
  const next = turn(slotTap(offered, 1), moreContext(first));
  assert.equal(next.interpretation.intent, INTENTS.IUL_SELECT_OFFERED_SLOT);
  assert.equal(resolveIulSlotBySelectionId(selected.selectionId, offered).time, selected.time);
  assert.equal(next.interpretation.entities.reviewProposedTime, selected.time);
  assert.equal(next.decision.contextPatch.appointment.proposedTime, selected.time);
});

test("F) valid slot selection never generic-handoffs", () => {
  const first = firstOffer();
  const offered = first.decision.contextPatch.appointment.previouslyOfferedSlots;
  const next = turn(slotTap(offered, 1), moreContext(first));
  assert.doesNotMatch(next.rendered.text, /compañero de Team Vision te contactará/i);
  assert.doesNotMatch(next.rendered.text, /manejar esto correctamente/i);
  assert.notEqual(next.decision.customerReplyPlan.templateKey, "appointment_create_failed");
  assert.notEqual(next.decision.customerReplyPlan.templateKey, "safe_failure_escalate");
});

test("G) selection advances state beyond OFFER_SLOTS", () => {
  const first = firstOffer();
  const offered = first.decision.contextPatch.appointment.previouslyOfferedSlots;
  const next = turn(slotTap(offered, 1), moreContext(first));
  assert.equal(next.decision.contextPatch.conversation.lastQuestionAsked, ASK.CONFIRM_SLOT);
  assert.notEqual(next.decision.contextPatch.conversation.lastQuestionAsked, ASK.OFFER_SLOTS);
  assert.equal(next.decision.contextPatch.appointment.proposedTime, "12:00");
});

test("H) create path invoked/authorized correctly", () => {
  const first = firstOffer();
  const offered = first.decision.contextPatch.appointment.previouslyOfferedSlots;
  const next = turn(slotTap(offered, 1), moreContext(first));
  assert.equal(next.decision.decision.nextAction, NEXT_ACTIONS.IUL_CREATE_REVIEW_APPOINTMENT);
  assert.equal(next.decision.decision.mayCreateAppointment, true);
  const slot = resolveConfirmedSlot({
    context: moreContext(first),
    structuredDecision: next.decision
  });
  assert.equal(slot.dateKey, "2026-09-02");
  assert.equal(slot.timeKey, "12:00");
  const auth = authorizeSideEffects({
    structuredDecision: next.decision,
    responsePlan: next.plan,
    context: iulContext({ organizationId: TEAM_VISION_ORG, agentId: AGENT_ID }),
    env: {
      [FEATURE_FLAGS.EXECUTION_ENABLED_ENV]: "true",
      [FEATURE_FLAGS.EXECUTION_ORGANIZATION_IDS_ENV]: TEAM_VISION_ORG,
      [FEATURE_FLAGS.EXECUTION_USER_IDS_ENV]: AGENT_ID
    },
    profileConfigured: true,
    actingUserId: AGENT_ID,
    organizationId: TEAM_VISION_ORG
  });
  assert.equal(auth.authorized, true);
  assert.ok(
    (auth.proposals || []).some(
      (row) => row.type === V2_EXECUTABLE_ACTIONS.CREATE_APPOINTMENT && row.authorized === true
    )
  );
});

test("I) BR-190 create-before-confirm preserved", () => {
  const first = firstOffer();
  const offered = first.decision.contextPatch.appointment.previouslyOfferedSlots;
  const next = turn(slotTap(offered, 1), moreContext(first));
  assert.match(next.rendered.text, /reservando|confirmo cuando/i);
  assert.doesNotMatch(next.rendered.text, /quedó confirmad|Perfecto, confirmado/i);
});

test("J) later Ok does not replay stale slot offer", () => {
  const first = firstOffer();
  const offered = first.decision.contextPatch.appointment.previouslyOfferedSlots;
  const selected = turn(slotTap(offered, 1), moreContext(first));
  const afterSelect = iulContext({
    conversation: {
      lastQuestionAsked: selected.decision.contextPatch.conversation.lastQuestionAsked
    },
    appointment: selected.decision.contextPatch.appointment,
    knownFacts: selected.decision.contextPatch.knownFacts,
    _availabilityFixture: { slots: FOUR_SLOTS }
  });
  const ok = turn({ text: "Ok" }, afterSelect);
  assert.equal(ok.interpretation.intent, INTENTS.IUL_SCHEDULE_CONFIRM);
  assert.equal(ok.decision.decision.nextAction, NEXT_ACTIONS.IUL_CREATE_REVIEW_APPOINTMENT);
  assert.notEqual(ok.decision.contextPatch.conversation.lastQuestionAsked, ASK.OFFER_SLOTS);
  assert.doesNotMatch(ok.rendered.text, /Tengo estos horarios disponibles/);
});

test("K) stale/expired slot still rejected safely", () => {
  const { decision, interpretation } = turn(
    {
      text: "Mié 9:00 AM",
      interactiveReply: {
        type: "button_reply",
        id: "IUL_SLOT_99",
        title: "Mié 9:00 AM"
      }
    },
    iulContext({
      conversation: { lastQuestionAsked: ASK.OFFER_SLOTS },
      appointment: {
        previouslyOfferedSlots: [{ ...slot("2026-09-02", "09:00"), selectionId: "IUL_SLOT_0" }]
      },
      _availabilityFixture: { slots: [slot("2026-09-02", "09:00"), slot("2026-09-03", "10:00")] }
    })
  );
  assert.equal(interpretation.intent, INTENTS.IUL_STALE_SLOT_SELECTION);
  assert.ok(decision.reasonCodes.includes(REASON_CODES.IUL_STALE_SLOT_REJECTED));
  assert.notEqual(decision.decision.nextAction, NEXT_ACTIONS.IUL_CREATE_REVIEW_APPOINTMENT);
});

test("L) BR-211 interactive delivery stays attached on offer", () => {
  const { decision } = firstOffer();
  assert.ok(interactive(decision));
  assert.match(optionIds(decision)[0], new RegExp(`^${IUL_SLOT_ID_PREFIX}`));
});

test("M) IUL create failure does not use recruiting companion copy", () => {
  const first = firstOffer();
  const offered = first.decision.contextPatch.appointment.previouslyOfferedSlots;
  const next = turn(slotTap(offered, 1), moreContext(first));
  const applied = applyExecutionOutcomeToReply({
    structuredDecision: next.decision,
    responsePlan: next.plan,
    rendered: next.rendered,
    execution: {
      attempted: true,
      success: false,
      failed: [{ type: "create_appointment", reason: "EXECUTION_DENIED" }]
    }
  });
  assert.equal(applied.responsePlan.templateKey, "iul_review_create_failed");
  assert.doesNotMatch(applied.rendered.text, /compañero de Team Vision te contactará/i);
  assert.ok(applied.structuredDecision.reasonCodes.includes(REASON_CODES.IUL_CREATE_FAILED_NO_HANDOFF));
});

test("N) daypart morning still offers real morning slots first", () => {
  const { decision, interpretation } = firstOffer();
  assert.equal(interpretation.intent, INTENTS.IUL_CHOOSE_REVIEW_DAY_PART);
  const times = offeredTimes(decision);
  assert.ok(times.includes("09:00"));
  assert.ok(times.includes("12:00"));
});

test("O) IUL create remains CREATE_APPOINTMENT under the authorizer", () => {
  const auth = authorizeSideEffects({
    structuredDecision: {
      decision: {
        nextAction: NEXT_ACTIONS.IUL_CREATE_REVIEW_APPOINTMENT,
        mayCreateAppointment: true
      }
    },
    responsePlan: { templateKey: "iul_confirm_review_deferred" },
    context: iulContext({ organizationId: TEAM_VISION_ORG }),
    env: {},
    profileConfigured: false
  });
  assert.equal(auth.authorized, false);
  assert.ok(
    (auth.proposals || []).some((row) => row.type === V2_EXECUTABLE_ACTIONS.CREATE_APPOINTMENT)
  );
});
