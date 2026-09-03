/**
 * BR-220 — IUL day-first multi-day compact scheduling UX.
 * Does not change BR-219 timeout/deferred booking or IUL qualification.
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
  CAMPAIGN_KIND,
  meetingModeFacts
} = require("../core/recruitAiV2/iulAdConversation");
const { IUL_OPTION_IDS } = require("../core/recruitAiV2/iulQualificationOptions");
const { IUL_SLOT_MORE_ID, formatIulSlotClock } = require("../core/recruitAiV2/iulSlotSelection");
const {
  IUL_DAY_QUERY_HORIZON_DAYS,
  IUL_DAY_MORE_ID,
  IUL_DAY_CHANGE_ID,
  IUL_DAYPART_CHANGE_ID,
  iulDaySelectionId,
  formatIulDayTitle,
  collectAvailableDays,
  selectIulCompactTimePage,
  selectIulMoreTimesPage,
  selectIulDayPage,
  slotMatchesIulDayPart,
  sortSlotsChronologically
} = require("../core/recruitAiV2/iulDayFirstScheduling");
const {
  isIulQualificationCompleteForScheduling,
  isIulConfirmableSchedulingState,
  buildIulDeferredAcknowledgement
} = require("../core/recruitAiV2/iulSchedulingOwnership");
const { collectInteractiveOptionParts } = require("../core/whatsappInteractiveMessage");

const NOW = "2026-09-02T16:00:00.000Z";
const TEAM_VISION_ORG = "00000000-0000-4000-8000-000000000001";
const AGENT_ID = "33ad243a-9d00-4a4d-810b-df2762c0f076";
const OFFICE = "2500 NW 79th Ave, Suite 189, Doral, FL 33122";

function slot(date, time) {
  return { dateKey: date, timeKey: time, date, time, timezone: "America/New_York" };
}

const MULTI_DAY_SLOTS = [
  slot("2026-09-03", "09:00"),
  slot("2026-09-03", "09:30"),
  slot("2026-09-03", "10:00"),
  slot("2026-09-03", "10:30"),
  slot("2026-09-03", "11:00"),
  slot("2026-09-03", "11:30"),
  slot("2026-09-04", "09:00"),
  slot("2026-09-04", "12:00"),
  slot("2026-09-04", "12:30"),
  slot("2026-09-04", "14:00"),
  slot("2026-09-05", "10:00"),
  slot("2026-09-06", "11:00"),
  slot("2026-09-07", "09:00")
];

const FOURTEEN_DAY_SLOTS = [
  slot("2026-09-02", "14:00"),
  ...Array.from({ length: 13 }, (_, index) => {
    const day = String(3 + index).padStart(2, "0");
    return slot(`2026-09-${day}`, "10:00");
  })
];

function qualifiedFacts(mode = "zoom") {
  return {
    name: "Ana",
    iulQualificationStatus: IUL_OPTION_IDS.STATUS_ACTIVE,
    iulReviewIntent: IUL_OPTION_IDS.REVIEW_UNDERSTAND,
    iulPolicyActive: true,
    policyType: "IUL",
    ...meetingModeFacts(mode, {
      organizationId: TEAM_VISION_ORG,
      knownFacts: { reviewOfficeAddress: OFFICE },
      _officeLocation: { fullAddress: OFFICE }
    }),
    reviewOfficeAddress: OFFICE
  };
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
    _officeLocation: { fullAddress: OFFICE },
    _availabilityFixture: { slots: MULTI_DAY_SLOTS },
    knownFacts: { name: "Ana" },
    conversation: { lastQuestionAsked: ASK.MEETING_MODE },
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

function zoomTap() {
  return {
    text: "Por Zoom",
    interactiveReply: { type: "button_reply", id: IUL_OPTION_IDS.MEET_ZOOM, title: "Por Zoom" }
  };
}

function officeTap() {
  return {
    text: "En la oficina",
    interactiveReply: {
      type: "button_reply",
      id: IUL_OPTION_IDS.MEET_OFFICE,
      title: "En la oficina"
    }
  };
}

function dayTap(dateKey) {
  return {
    text: formatIulDayTitle(dateKey, "es"),
    interactiveReply: {
      type: "list_reply",
      id: iulDaySelectionId(dateKey),
      title: formatIulDayTitle(dateKey, "es")
    }
  };
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
    text: "Más horarios",
    interactiveReply: { type: "button_reply", id: IUL_SLOT_MORE_ID, title: "Más horarios" }
  };
}

function slotTap(offered, index = 0) {
  const selected = offered[index];
  const title = formatIulSlotClock(selected.time || selected.timeKey);
  return {
    text: title,
    interactiveReply: {
      type: "button_reply",
      id: selected.selectionId,
      title
    }
  };
}

function optionIds(decision) {
  const payload = decision.customerReplyPlan?.entities?.whatsappInteractive;
  if (!payload) return [];
  return collectInteractiveOptionParts(payload).map((row) => row.id);
}

function optionTitles(decision) {
  const payload = decision.customerReplyPlan?.entities?.whatsappInteractive;
  if (!payload) return [];
  return collectInteractiveOptionParts(payload).map((row) => row.title);
}

function offeredTimes(decision) {
  return (decision.contextPatch?.appointment?.previouslyOfferedSlots || []).map(
    (row) => row.time || row.timeKey
  );
}

function moreDaysTap() {
  return {
    text: "Más días",
    interactiveReply: { type: "list_reply", id: IUL_DAY_MORE_ID, title: "Más días" }
  };
}

function afterMode(modeTap, slots = MULTI_DAY_SLOTS) {
  const meetingMode =
    modeTap?.interactiveReply?.id === IUL_OPTION_IDS.MEET_OFFICE ? "in_person" : "zoom";
  const chosen = turn(
    modeTap,
    iulContext({
      knownFacts: qualifiedFacts(meetingMode),
      conversation: { lastQuestionAsked: ASK.MEETING_MODE },
      _availabilityFixture: { slots }
    })
  );
  return {
    chosen,
    context: iulContext({
      conversation: { lastQuestionAsked: ASK.SCHEDULING_DAY },
      knownFacts: chosen.decision.contextPatch.knownFacts,
      appointment: chosen.decision.contextPatch.appointment,
      _availabilityFixture: { slots }
    })
  };
}

function afterDay(dateKey = "2026-09-03", modeTap = zoomTap(), slots = MULTI_DAY_SLOTS) {
  const started = afterMode(modeTap, slots);
  const selected = turn(dayTap(dateKey), started.context);
  return {
    selected,
    context: iulContext({
      conversation: {
        lastQuestionAsked: selected.decision.contextPatch.conversation.lastQuestionAsked
      },
      knownFacts: selected.decision.contextPatch.knownFacts,
      appointment: selected.decision.contextPatch.appointment,
      _availabilityFixture: { slots }
    })
  };
}

function firstCompactOffer(slots = MULTI_DAY_SLOTS) {
  const day = afterDay("2026-09-03", zoomTap(), slots);
  if (day.selected.decision.contextPatch.conversation.lastQuestionAsked === ASK.OFFER_SLOTS) {
    return day.selected;
  }
  return turn(morningTap(), day.context);
}

test("A) meeting mode selection asks DAY before daypart", () => {
  const { chosen } = afterMode(zoomTap());
  assert.equal(chosen.interpretation.intent, INTENTS.IUL_CHOOSE_MEETING_MODE);
  assert.equal(chosen.decision.contextPatch.conversation.lastQuestionAsked, ASK.SCHEDULING_DAY);
  assert.match(chosen.rendered.text, /Perfecto\. ¿Qué día le funciona mejor\?/);
  assert.doesNotMatch(chosen.rendered.text, /¿Qué horario prefiere/);
  assert.ok(optionIds(chosen.decision).every((id) => String(id).startsWith("IUL_DAY_")));
  assert.ok(!optionIds(chosen.decision).includes(IUL_OPTION_IDS.DAY_MORNING));
});

test("B) available days span multiple dates", () => {
  const { chosen } = afterMode(zoomTap());
  const ids = optionIds(chosen.decision);
  assert.ok(ids.includes("IUL_DAY_2026-09-03"));
  assert.ok(ids.includes("IUL_DAY_2026-09-04"));
  assert.ok(ids.includes("IUL_DAY_2026-09-05"));
  assert.ok(ids.includes("IUL_DAY_2026-09-06"));
  assert.ok(ids.includes("IUL_DAY_2026-09-07"));
  assert.deepEqual(optionTitles(chosen.decision).slice(0, 5), [
    "Jue 3",
    "Vie 4",
    "Sáb 5",
    "Dom 6",
    "Lun 7"
  ]);
  assert.equal(IUL_DAY_QUERY_HORIZON_DAYS, 14);
});

test("C) dates with zero availability are omitted", () => {
  const days = collectAvailableDays(MULTI_DAY_SLOTS);
  assert.ok(!days.some((day) => day.dateKey === "2026-09-08"));
  const { chosen } = afterMode(zoomTap());
  assert.ok(!optionIds(chosen.decision).includes("IUL_DAY_2026-09-08"));
});

test("D) selected day stored durably", () => {
  const day = afterDay("2026-09-03");
  assert.equal(day.selected.interpretation.intent, INTENTS.IUL_CHOOSE_REVIEW_DAY);
  assert.equal(day.selected.decision.contextPatch.knownFacts.iulSelectedDate, "2026-09-03");
  assert.equal(day.selected.decision.contextPatch.knownFacts.reviewProposedDate, "2026-09-03");
});

test("E) daypart availability scoped to selected day", () => {
  const day = afterDay("2026-09-03");
  assert.equal(day.selected.decision.contextPatch.conversation.lastQuestionAsked, ASK.OFFER_SLOTS);
  const times = offeredTimes(day.selected.decision);
  assert.ok(times.every((time) => ["09:00", "10:00", "11:00", "09:30", "10:30", "11:30"].includes(time)));
  const friday = afterDay("2026-09-04");
  assert.equal(friday.selected.decision.contextPatch.conversation.lastQuestionAsked, ASK.SCHEDULING_DAY_PART);
  assert.match(friday.selected.rendered.text, /¿Qué horario prefiere para el viernes\?/);
  assert.deepEqual(optionIds(friday.selected.decision), [
    IUL_OPTION_IDS.DAY_MORNING,
    IUL_OPTION_IDS.DAY_AFTERNOON
  ]);
  const morning = turn(morningTap(), friday.context);
  assert.deepEqual(offeredTimes(morning.decision), ["09:00"]);
  assert.ok(!offeredTimes(morning.decision).includes("14:00"));
});

test("F) initial slot display max 3 actual times", () => {
  const first = firstCompactOffer();
  const timeIds = optionIds(first.decision).filter((id) => id !== IUL_SLOT_MORE_ID);
  assert.ok(timeIds.length <= 3);
  assert.equal(offeredTimes(first.decision).length <= 3, true);
});

test("G) :00 times preferred on the first page", () => {
  const first = firstCompactOffer();
  assert.deepEqual(offeredTimes(first.decision), ["09:00", "10:00", "11:00"]);
  assert.ok(optionIds(first.decision).includes(IUL_SLOT_MORE_ID));
});

test("H) :30 fills when insufficient :00 availability", () => {
  const page = selectIulCompactTimePage([
    slot("2026-09-03", "09:00"),
    slot("2026-09-03", "09:30"),
    slot("2026-09-03", "10:30"),
    slot("2026-09-03", "11:30")
  ]);
  assert.deepEqual(
    page.shown.map((row) => row.time),
    ["09:00", "09:30", "10:30"]
  );
  const first = firstCompactOffer([
    slot("2026-09-03", "09:00"),
    slot("2026-09-03", "09:30"),
    slot("2026-09-03", "10:30")
  ]);
  assert.deepEqual(offeredTimes(first.decision), ["09:00", "09:30", "10:30"]);
});

test("I) More times exposes remaining half-hour slots on the same day", () => {
  const first = firstCompactOffer();
  const more = turn(
    moreTap(),
    iulContext({
      conversation: { lastQuestionAsked: ASK.OFFER_SLOTS },
      knownFacts: first.decision.contextPatch.knownFacts,
      appointment: first.decision.contextPatch.appointment,
      _availabilityFixture: { slots: MULTI_DAY_SLOTS }
    })
  );
  assert.equal(more.interpretation.intent, INTENTS.IUL_REQUEST_MORE_SLOTS);
  assert.deepEqual(offeredTimes(more.decision), ["09:30", "10:30", "11:30"]);
  assert.ok(offeredTimes(more.decision).every((time) => time.endsWith(":30")));
  assert.ok(
    (more.decision.contextPatch.appointment.previouslyOfferedSlots || []).every(
      (row) => (row.date || row.dateKey) === "2026-09-03"
    )
  );
});

test("J) slot rows do not repeat the weekday", () => {
  const first = firstCompactOffer();
  const titles = optionTitles(first.decision).filter((title) => title !== "Más horarios");
  assert.deepEqual(titles, ["9:00 AM", "10:00 AM", "11:00 AM"]);
  assert.ok(titles.every((title) => !/Jue|Vie|Lun/.test(title)));
  assert.match(first.rendered.text, /Horarios disponibles para el jueves por la mañana/);
});

test("K) slots sorted chronologically", () => {
  const scrambled = [
    slot("2026-09-03", "12:00"),
    slot("2026-09-03", "09:00"),
    slot("2026-09-03", "09:30"),
    slot("2026-09-03", "10:00"),
    slot("2026-09-03", "10:30"),
    slot("2026-09-03", "11:00"),
    slot("2026-09-03", "11:30")
  ];
  assert.deepEqual(
    sortSlotsChronologically(scrambled).map((row) => row.time),
    ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00"]
  );
  const first = firstCompactOffer(scrambled);
  assert.deepEqual(offeredTimes(first.decision), ["09:00", "10:00", "11:00"]);
});

test("L) office path uses day-first then compact times", () => {
  const { chosen } = afterMode(officeTap());
  assert.equal(chosen.decision.contextPatch.knownFacts.meetingMode, "in_person");
  assert.equal(chosen.decision.contextPatch.conversation.lastQuestionAsked, ASK.SCHEDULING_DAY);
  const first = firstCompactOffer(MULTI_DAY_SLOTS);
  const officeDay = afterDay("2026-09-03", officeTap());
  assert.equal(officeDay.selected.decision.contextPatch.knownFacts.meetingMode, "in_person");
  assert.equal(officeDay.selected.decision.contextPatch.conversation.lastQuestionAsked, ASK.OFFER_SLOTS);
  assert.ok(first.decision.reasonCodes.includes(REASON_CODES.IUL_COMPACT_SLOT_PAGE));
});

test("M) Zoom path uses day-first then compact times", () => {
  const { chosen } = afterMode(zoomTap());
  assert.equal(chosen.decision.contextPatch.knownFacts.meetingMode, "zoom");
  const first = firstCompactOffer();
  assert.equal(first.decision.decision.nextAction, NEXT_ACTIONS.IUL_OFFER_REVIEW_SLOTS);
  const offered = first.decision.contextPatch.appointment.previouslyOfferedSlots;
  const booked = turn(
    slotTap(offered, 0),
    iulContext({
      conversation: { lastQuestionAsked: ASK.OFFER_SLOTS },
      knownFacts: first.decision.contextPatch.knownFacts,
      appointment: first.decision.contextPatch.appointment
    })
  );
  assert.equal(booked.interpretation.intent, INTENTS.IUL_SELECT_OFFERED_SLOT);
  assert.equal(booked.decision.decision.nextAction, NEXT_ACTIONS.IUL_CREATE_REVIEW_APPOINTMENT);
});

test("N) Office→Zoom returns to day selection without requalification", () => {
  const context = iulContext({
    knownFacts: {
      ...qualifiedFacts("in_person"),
      iulSelectedDate: "2026-09-03",
      iulSelectedDayPart: "morning"
    },
    conversation: { lastQuestionAsked: ASK.CONFIRM_SLOT },
    appointment: {
      status: "proposed",
      proposedDate: "2026-09-03",
      proposedTime: "10:00",
      previouslyOfferedSlots: [slot("2026-09-03", "10:00")]
    }
  });
  assert.equal(isIulQualificationCompleteForScheduling(context), true);
  const switched = turn(zoomTap(), context);
  assert.equal(switched.interpretation.intent, INTENTS.IUL_CHOOSE_MEETING_MODE);
  assert.equal(switched.decision.contextPatch.knownFacts.iulQualificationStatus, IUL_OPTION_IDS.STATUS_ACTIVE);
  assert.equal(switched.decision.contextPatch.knownFacts.meetingMode, "zoom");
  assert.equal(switched.decision.contextPatch.conversation.lastQuestionAsked, ASK.SCHEDULING_DAY);
  assert.ok(switched.decision.reasonCodes.includes(REASON_CODES.IUL_MODE_SWITCH_PRESERVED));
  assert.notEqual(switched.decision.decision.nextAction, NEXT_ACTIONS.IUL_ASK_CARRIER);
  assert.match(switched.rendered.text, /¿Qué día le funciona mejor\?/);
});

test("O) Zoom→Office returns to day selection without requalification", () => {
  const context = iulContext({
    knownFacts: {
      ...qualifiedFacts("zoom"),
      iulSelectedDate: "2026-09-03",
      iulSelectedDayPart: "morning"
    },
    conversation: { lastQuestionAsked: ASK.CONFIRM_SLOT },
    appointment: {
      status: "proposed",
      proposedDate: "2026-09-03",
      proposedTime: "10:00",
      previouslyOfferedSlots: [slot("2026-09-03", "10:00")]
    }
  });
  const switched = turn(officeTap(), context);
  assert.equal(switched.decision.contextPatch.knownFacts.meetingMode, "in_person");
  assert.equal(switched.decision.contextPatch.knownFacts.iulReviewIntent, IUL_OPTION_IDS.REVIEW_UNDERSTAND);
  assert.equal(switched.decision.contextPatch.conversation.lastQuestionAsked, ASK.SCHEDULING_DAY);
  assert.ok(switched.decision.reasonCodes.includes(REASON_CODES.IUL_MODE_SWITCH_PRESERVED));
});

test("P) BR-219 deferred confirmation copy is unchanged", () => {
  const deferred = buildIulDeferredAcknowledgement({
    slot: slot("2026-09-03", "10:00"),
    meetingMode: "zoom",
    language: "es"
  });
  assert.match(deferred, /Estoy reservando/);
  assert.doesNotMatch(deferred, /confirmada/);
  assert.doesNotMatch(deferred, /zoom\.us/);
  const pending = iulContext({
    knownFacts: {
      ...qualifiedFacts("zoom"),
      iulBookingPending: true,
      reviewProposedDate: "2026-09-03",
      reviewProposedTime: "10:00"
    },
    conversation: { lastQuestionAsked: ASK.CONFIRM_SLOT, lastOfferMade: "iul_confirm_review_deferred" },
    appointment: {
      status: "proposed",
      proposedDate: "2026-09-03",
      proposedTime: "10:00",
      appointmentId: null
    }
  });
  assert.equal(isIulConfirmableSchedulingState(pending), true);
  const replay = turn("ok", pending);
  assert.equal(replay.decision.decision.nextAction, NEXT_ACTIONS.IUL_CREATE_REVIEW_APPOINTMENT);
  assert.doesNotMatch(String(replay.rendered.text || ""), /compañía|aseguradora/);
});

test("exhausted More offers another day or daypart change", () => {
  const first = firstCompactOffer();
  const more = turn(
    moreTap(),
    iulContext({
      conversation: { lastQuestionAsked: ASK.OFFER_SLOTS },
      knownFacts: first.decision.contextPatch.knownFacts,
      appointment: first.decision.contextPatch.appointment
    })
  );
  const exhausted = turn(
    moreTap(),
    iulContext({
      conversation: { lastQuestionAsked: ASK.OFFER_SLOTS },
      knownFacts: more.decision.contextPatch.knownFacts,
      appointment: more.decision.contextPatch.appointment
    })
  );
  assert.ok(
    optionIds(exhausted.decision).includes(IUL_DAY_CHANGE_ID) ||
      exhausted.decision.customerReplyPlan.templateKey === "iul_more_slots_exhausted"
  );
  if (exhausted.decision.customerReplyPlan.templateKey === "iul_more_slots_exhausted") {
    assert.deepEqual(optionIds(exhausted.decision).sort(), [
      IUL_DAYPART_CHANGE_ID,
      IUL_DAY_CHANGE_ID
    ].sort());
  }
});

test("A-page) 14 available days never generate >10 WhatsApp list rows", () => {
  const { chosen } = afterMode(zoomTap(), FOURTEEN_DAY_SLOTS);
  const ids = optionIds(chosen.decision);
  assert.ok(ids.length <= 10);
  assert.ok(ids.includes(IUL_DAY_MORE_ID));
  assert.equal(ids.filter((id) => id !== IUL_DAY_MORE_ID).length, 7);
  assert.equal((chosen.decision.contextPatch.knownFacts.iulAvailableDays || []).length, 14);
  assert.equal((chosen.decision.contextPatch.knownFacts.iulOfferedDays || []).length, 7);
  const fallback = String(chosen.decision.customerReplyPlan.entities.interactiveFallbackText || "");
  const numbered = fallback.split("\n").filter((line) => /^\d+\./.test(line));
  assert.ok(numbered.length <= 10);
  assert.equal(numbered.length, ids.length);
});

test("B-page) Más días reaches later valid dates in the same horizon", () => {
  const started = afterMode(zoomTap(), FOURTEEN_DAY_SLOTS);
  const more = turn(
    moreDaysTap(),
    iulContext({
      conversation: { lastQuestionAsked: ASK.SCHEDULING_DAY },
      knownFacts: started.chosen.decision.contextPatch.knownFacts,
      appointment: started.chosen.decision.contextPatch.appointment,
      _availabilityFixture: { slots: FOURTEEN_DAY_SLOTS }
    })
  );
  assert.equal(more.interpretation.intent, INTENTS.IUL_REQUEST_MORE_DAYS);
  const ids = optionIds(more.decision);
  assert.ok(ids.length <= 10);
  assert.ok(ids.includes("IUL_DAY_2026-09-10"));
  assert.ok(ids.includes("IUL_DAY_2026-09-11"));
  assert.ok(!ids.includes("IUL_DAY_2026-09-03"));
  assert.ok(!ids.includes(IUL_DAY_MORE_ID));
});

test("C-page) numeric fallback contains only currently displayed day options", () => {
  const started = afterMode(zoomTap(), FOURTEEN_DAY_SLOTS);
  const fallback = String(
    started.chosen.decision.customerReplyPlan.entities.interactiveFallbackText || ""
  );
  assert.match(fallback, /1\. /);
  assert.doesNotMatch(fallback, /2026-09-10|Jue 10/);
  const numbered = fallback.split("\n").filter((line) => /^\d+\./.test(line));
  assert.equal(numbered.length, 8);
  const moreByNumber = turn(
    "8",
    iulContext({
      conversation: { lastQuestionAsked: ASK.SCHEDULING_DAY },
      knownFacts: started.chosen.decision.contextPatch.knownFacts,
      _availabilityFixture: { slots: FOURTEEN_DAY_SLOTS }
    })
  );
  assert.equal(moreByNumber.interpretation.intent, INTENTS.IUL_REQUEST_MORE_DAYS);
  const hidden = turn(
    "11",
    iulContext({
      conversation: { lastQuestionAsked: ASK.SCHEDULING_DAY },
      knownFacts: started.chosen.decision.contextPatch.knownFacts,
      _availabilityFixture: { slots: FOURTEEN_DAY_SLOTS }
    })
  );
  assert.notEqual(hidden.interpretation.entities?.iulSelectedDate, "2026-09-11");
});

test("D-page) selecting a day on page 2 persists the correct ISO date", () => {
  const started = afterMode(zoomTap(), FOURTEEN_DAY_SLOTS);
  const more = turn(
    moreDaysTap(),
    iulContext({
      conversation: { lastQuestionAsked: ASK.SCHEDULING_DAY },
      knownFacts: started.chosen.decision.contextPatch.knownFacts,
      appointment: started.chosen.decision.contextPatch.appointment,
      _availabilityFixture: { slots: FOURTEEN_DAY_SLOTS }
    })
  );
  const selected = turn(
    dayTap("2026-09-10"),
    iulContext({
      conversation: { lastQuestionAsked: ASK.SCHEDULING_DAY },
      knownFacts: more.decision.contextPatch.knownFacts,
      appointment: more.decision.contextPatch.appointment,
      _availabilityFixture: { slots: FOURTEEN_DAY_SLOTS }
    })
  );
  assert.equal(selected.interpretation.intent, INTENTS.IUL_CHOOSE_REVIEW_DAY);
  assert.equal(selected.decision.contextPatch.knownFacts.iulSelectedDate, "2026-09-10");
  assert.equal(selected.decision.contextPatch.knownFacts.reviewProposedDate, "2026-09-10");
});

test("E-page) replay of the day page remains deterministic", () => {
  const started = afterMode(zoomTap(), FOURTEEN_DAY_SLOTS);
  const firstIds = optionIds(started.chosen.decision);
  const replay = turn(
    { text: "¿Cuánto cuesta la revisión?" },
    iulContext({
      conversation: { lastQuestionAsked: ASK.SCHEDULING_DAY },
      knownFacts: started.chosen.decision.contextPatch.knownFacts,
      appointment: started.chosen.decision.contextPatch.appointment,
      _availabilityFixture: { slots: FOURTEEN_DAY_SLOTS }
    })
  );
  assert.equal(replay.decision.contextPatch.conversation.lastQuestionAsked, ASK.SCHEDULING_DAY);
  assert.deepEqual(optionIds(replay.decision), firstIds);
  assert.deepEqual(
    (replay.decision.contextPatch.knownFacts.iulOfferedDays || []).map((day) => day.dateKey),
    (started.chosen.decision.contextPatch.knownFacts.iulOfferedDays || []).map((day) => day.dateKey)
  );
});

test("F-page) <=10 available days needs no More-days control", () => {
  const { chosen } = afterMode(zoomTap(), MULTI_DAY_SLOTS);
  assert.ok(optionIds(chosen.decision).length <= 10);
  assert.ok(!optionIds(chosen.decision).includes(IUL_DAY_MORE_ID));
  const page = selectIulDayPage(collectAvailableDays(MULTI_DAY_SLOTS));
  assert.equal(page.includeMore, false);
});

test("G-noon) 12:00 appears only in afternoon", () => {
  assert.equal(slotMatchesIulDayPart(slot("2026-09-04", "12:00"), "morning"), false);
  assert.equal(slotMatchesIulDayPart(slot("2026-09-04", "12:00"), "afternoon"), true);
  const friday = afterDay("2026-09-04", zoomTap(), MULTI_DAY_SLOTS);
  const morning = turn(morningTap(), friday.context);
  assert.ok(!offeredTimes(morning.decision).includes("12:00"));
  const afternoon = turn(
    {
      text: "En la tarde",
      interactiveReply: {
        type: "button_reply",
        id: IUL_OPTION_IDS.DAY_AFTERNOON,
        title: "En la tarde"
      }
    },
    friday.context
  );
  assert.ok(offeredTimes(afternoon.decision).includes("12:00"));
});

test("H-noon) 11:30 remains morning", () => {
  assert.equal(slotMatchesIulDayPart(slot("2026-09-03", "11:30"), "morning"), true);
  assert.equal(slotMatchesIulDayPart(slot("2026-09-03", "11:30"), "afternoon"), false);
  const first = firstCompactOffer();
  const more = turn(
    moreTap(),
    iulContext({
      conversation: { lastQuestionAsked: ASK.OFFER_SLOTS },
      knownFacts: first.decision.contextPatch.knownFacts,
      appointment: first.decision.contextPatch.appointment
    })
  );
  assert.ok(offeredTimes(more.decision).includes("11:30"));
});

test("I-noon) 12:30 remains afternoon", () => {
  assert.equal(slotMatchesIulDayPart(slot("2026-09-04", "12:30"), "morning"), false);
  assert.equal(slotMatchesIulDayPart(slot("2026-09-04", "12:30"), "afternoon"), true);
  const friday = afterDay("2026-09-04", zoomTap(), MULTI_DAY_SLOTS);
  const afternoon = turn(
    {
      text: "En la tarde",
      interactiveReply: {
        type: "button_reply",
        id: IUL_OPTION_IDS.DAY_AFTERNOON,
        title: "En la tarde"
      }
    },
    friday.context
  );
  assert.ok(offeredTimes(afternoon.decision).includes("12:30"));
  assert.ok(!offeredTimes(afternoon.decision).includes("09:00"));
});

test("J-page) compact slot pages still max 3 actual times", () => {
  const first = firstCompactOffer();
  assert.ok(offeredTimes(first.decision).length <= 3);
});
