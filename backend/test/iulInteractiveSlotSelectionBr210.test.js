/**
 * BR-210 — IUL interactive WhatsApp slot selection.
 * Does not change BR-209 availability. Preserves BR-190 create-before-confirm.
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
const { NEXT_ACTIONS, REASON_CODES } = require("../core/recruitAiV2/constants");
const {
  ASK,
  CONVERSATION_GOAL,
  CAMPAIGN_KIND
} = require("../core/recruitAiV2/iulAdConversation");
const { IUL_OPTION_IDS } = require("../core/recruitAiV2/iulQualificationOptions");
const {
  IUL_SLOT_MORE_ID,
  IUL_SLOT_ID_PREFIX,
  formatIulSlotButtonTitle
} = require("../core/recruitAiV2/iulSlotSelection");

const NOW = "2026-09-01T16:00:00.000Z";

function slot(date, time) {
  return { dateKey: date, timeKey: time, date, time, timezone: "America/New_York" };
}

function iulContext(overrides = {}) {
  return createConversationContext({
    preferredLanguage: "spanish",
    conversationGoal: CONVERSATION_GOAL,
    campaignKind: CAMPAIGN_KIND,
    campaignIntakePurpose: "IUL",
    organizationId: "00000000-0000-4000-8000-000000000001",
    agentId: "33ad243a-9d00-4a4d-810b-df2762c0f076",
    timezone: "America/New_York",
    _testNow: NOW,
    knownFacts: { name: "Ana", iulSelectedDayPart: "morning" },
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

function optionTitles(decision) {
  const payload = interactive(decision);
  if (!payload) return [];
  if (payload.type === "button") {
    return (payload.action?.buttons || []).map((row) => row.reply?.title);
  }
  return (payload.action?.sections || []).flatMap((section) =>
    (section.rows || []).map((row) => row.title)
  );
}

function offerFrom(slots) {
  return turn(morningTap(), iulContext({ _availabilityFixture: { slots } }));
}

test("A) 1 slot → interactive reply option", () => {
  const { rendered, decision } = offerFrom([slot("2026-09-02", "10:00")]);
  assert.equal(interactive(decision).type, "button");
  assert.equal(optionIds(decision).length, 1);
  assert.match(optionIds(decision)[0], /^IUL_SLOT_/);
  assert.match(rendered.text, /su revisión por Zoom/);
  assert.doesNotMatch(rendered.text, /^- /m);
  assert.doesNotMatch(rendered.text, /miércoles 10:00/);
});

test("B) 2 slots → interactive reply buttons", () => {
  const { decision, rendered } = offerFrom([
    slot("2026-09-02", "09:00"),
    slot("2026-09-02", "12:00")
  ]);
  assert.equal(interactive(decision).type, "button");
  assert.equal(optionIds(decision).filter((id) => id !== IUL_SLOT_MORE_ID).length, 2);
  assert.ok(optionIds(decision).includes(IUL_SLOT_MORE_ID));
  assert.doesNotMatch(rendered.text, /09:00|12:00/);
  assert.ok(optionTitles(decision).some((title) => /9:00 AM/.test(title)));
  assert.ok(optionTitles(decision).some((title) => /12:00 PM/.test(title)));
});

test("C) 3 slots → interactive reply buttons", () => {
  const { decision } = offerFrom([
    slot("2026-09-02", "09:00"),
    slot("2026-09-03", "10:00"),
    slot("2026-09-04", "11:00")
  ]);
  assert.equal(interactive(decision).type, "button");
  assert.equal(optionIds(decision).length, 3);
  assert.ok(optionIds(decision).every((id) => id.startsWith(IUL_SLOT_ID_PREFIX)));
});

test("D) >3 slots → interactive list", () => {
  const { decision } = offerFrom([
    slot("2026-09-02", "09:00"),
    slot("2026-09-03", "09:30"),
    slot("2026-09-04", "10:00"),
    slot("2026-09-08", "10:30")
  ]);
  assert.equal(interactive(decision).type, "list");
  assert.ok(optionIds(decision).length >= 4);
  assert.ok(!optionIds(decision).includes(IUL_SLOT_MORE_ID));
});

test("E) visible labels do not expose internal slot IDs", () => {
  const { decision, rendered } = offerFrom([
    slot("2026-09-02", "09:00"),
    slot("2026-09-02", "12:00")
  ]);
  const titles = optionTitles(decision).join(" ");
  assert.doesNotMatch(titles, /IUL_SLOT/);
  assert.doesNotMatch(rendered.text, /IUL_SLOT/);
  assert.match(titles, /Mié|Mar|Jue|Vie|Lun|Sáb|Dom/);
});

test("F) button reply resolves the correct slot", () => {
  const first = offerFrom([slot("2026-09-02", "09:00"), slot("2026-09-02", "12:00")]);
  const offered = first.decision.contextPatch.appointment.previouslyOfferedSlots;
  const selected = offered[0];
  const next = turn(
    {
      text: formatIulSlotButtonTitle(selected, "es"),
      interactiveReply: {
        type: "button_reply",
        id: selected.selectionId,
        title: formatIulSlotButtonTitle(selected, "es")
      }
    },
    iulContext({
      conversation: { lastQuestionAsked: ASK.OFFER_SLOTS },
      appointment: { previouslyOfferedSlots: offered },
      _availabilityFixture: { slots: [slot("2026-09-02", "09:00"), slot("2026-09-02", "12:00")] }
    })
  );
  assert.equal(next.interpretation.intent, INTENTS.IUL_SELECT_OFFERED_SLOT);
  assert.equal(next.interpretation.entities.reviewProposedTime, "09:00");
  assert.equal(next.decision.decision.nextAction, NEXT_ACTIONS.IUL_CREATE_REVIEW_APPOINTMENT);
  assert.doesNotMatch(next.rendered.text, /quedó confirmad|Perfecto, confirmado/i);
});

test("G) list reply resolves the correct slot", () => {
  const slots = [
    slot("2026-09-02", "09:00"),
    slot("2026-09-03", "09:30"),
    slot("2026-09-04", "10:00"),
    slot("2026-09-08", "10:30")
  ];
  const first = offerFrom(slots);
  const offered = first.decision.contextPatch.appointment.previouslyOfferedSlots;
  const selected = offered[2];
  const next = turn(
    {
      text: selected.selectionId,
      interactiveReply: {
        type: "list_reply",
        id: selected.selectionId,
        title: formatIulSlotButtonTitle(selected, "es")
      }
    },
    iulContext({
      conversation: { lastQuestionAsked: ASK.OFFER_SLOTS },
      appointment: { previouslyOfferedSlots: offered },
      _availabilityFixture: { slots }
    })
  );
  assert.equal(next.interpretation.intent, INTENTS.IUL_SELECT_OFFERED_SLOT);
  assert.equal(next.interpretation.entities.reviewProposedTime, selected.time);
});

test("H) stale selection is rejected", () => {
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
        previouslyOfferedSlots: [
          { ...slot("2026-09-02", "09:00"), selectionId: "IUL_SLOT_0" }
        ]
      },
      _availabilityFixture: { slots: [slot("2026-09-02", "09:00"), slot("2026-09-03", "10:00")] }
    })
  );
  assert.equal(interpretation.intent, INTENTS.IUL_STALE_SLOT_SELECTION);
  assert.ok(decision.reasonCodes.includes(REASON_CODES.IUL_STALE_SLOT_REJECTED));
  assert.equal(decision.decision.mayCreateAppointment, false);
  assert.notEqual(decision.decision.nextAction, NEXT_ACTIONS.IUL_CREATE_REVIEW_APPOINTMENT);
});

test("I) selected slot is revalidated before create", () => {
  const offered = [{ ...slot("2026-09-02", "09:00"), selectionId: "IUL_SLOT_0" }];
  const { decision } = turn(
    {
      text: "Mié 9:00 AM",
      interactiveReply: { type: "button_reply", id: "IUL_SLOT_0", title: "Mié 9:00 AM" }
    },
    iulContext({
      conversation: { lastQuestionAsked: ASK.OFFER_SLOTS },
      appointment: { previouslyOfferedSlots: offered },
      _availabilityFixture: { slots: [slot("2026-09-02", "09:00")] }
    })
  );
  assert.ok(decision.reasonCodes.includes(REASON_CODES.IUL_SLOT_REVALIDATED));
  assert.equal(decision.decision.mayCreateAppointment, true);
  assert.equal(decision.contextPatch.knownFacts.reviewProposedTime, "09:00");
});

test("J) BR-190 create-before-confirm is preserved", () => {
  const offered = [{ ...slot("2026-09-02", "09:00"), selectionId: "IUL_SLOT_0" }];
  const { rendered, decision } = turn(
    {
      text: "Mié 9:00 AM",
      interactiveReply: { type: "button_reply", id: "IUL_SLOT_0", title: "Mié 9:00 AM" }
    },
    iulContext({
      conversation: { lastQuestionAsked: ASK.OFFER_SLOTS },
      appointment: { previouslyOfferedSlots: offered },
      _availabilityFixture: { slots: [slot("2026-09-02", "09:00")] }
    })
  );
  assert.equal(decision.decision.nextAction, NEXT_ACTIONS.IUL_CREATE_REVIEW_APPOINTMENT);
  assert.match(rendered.text, /reservando|confirmo cuando/i);
  assert.doesNotMatch(rendered.text, /quedó confirmad|Perfecto, confirmado/i);
});

test("K) free-text slot selection fallback still works", () => {
  const offered = [
    { ...slot("2026-09-02", "09:00"), selectionId: "IUL_SLOT_0" },
    { ...slot("2026-09-02", "12:00"), selectionId: "IUL_SLOT_1" }
  ];
  const { interpretation, decision } = turn(
    { text: "el de las 9" },
    iulContext({
      conversation: { lastQuestionAsked: ASK.OFFER_SLOTS },
      appointment: { previouslyOfferedSlots: offered }
    })
  );
  assert.equal(interpretation.intent, INTENTS.IUL_SELECT_OFFERED_SLOT);
  assert.equal(interpretation.entities.reviewProposedTime, "09:00");
  assert.equal(decision.decision.nextAction, NEXT_ACTIONS.IUL_CREATE_REVIEW_APPOINTMENT);
});

test("L) Ver más horarios returns different real slots", () => {
  const first = offerFrom([
    slot("2026-09-02", "09:00"),
    slot("2026-09-02", "12:00")
  ]);
  const shown = first.decision.contextPatch.appointment.previouslyOfferedSlots;
  const more = turn(
    {
      text: "Ver más horarios",
      interactiveReply: { type: "button_reply", id: IUL_SLOT_MORE_ID, title: "Ver más horarios" }
    },
    iulContext({
      conversation: { lastQuestionAsked: ASK.OFFER_SLOTS },
      appointment: { previouslyOfferedSlots: shown },
      knownFacts: {
        iulSelectedDayPart: "morning",
        iulShownSlotKeys: shown.map((row) => `${row.date}|${row.time}`)
      },
      _availabilityFixture: {
        slots: [
          slot("2026-09-02", "09:00"),
          slot("2026-09-02", "12:00"),
          slot("2026-09-08", "09:30"),
          slot("2026-09-09", "10:00")
        ]
      }
    })
  );
  assert.equal(more.interpretation.intent, INTENTS.IUL_REQUEST_MORE_SLOTS);
  const nextTimes = (more.decision.contextPatch.appointment.previouslyOfferedSlots || []).map(
    (row) => row.time || row.timeKey
  );
  assert.ok(nextTimes.some((time) => time === "09:30" || time === "10:00"));
  assert.ok(!nextTimes.includes("09:00") || nextTimes.includes("09:30"));
});
