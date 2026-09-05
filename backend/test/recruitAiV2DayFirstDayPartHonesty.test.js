/**
 * BR-231 — day-first day-part claims must follow returned slot evidence.
 * Live bug: Sunday 11:45–21:00 + "En la mañana" must not say
 * "Tengo disponible mañana domingo en la mañana".
 */

"use strict";

require("dotenv").config();

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { interpretInboundMessage } = require("../core/recruitAiV2/interpreter");
const { decideConversationTurn } = require("../core/recruitAiV2/decisionEngine");
const { renderCustomerReply } = require("../core/recruitAiV2/responseRenderer");
const { createConversationContext } = require("../core/recruitAiV2/conversationContext");
const { READ_STATUS } = require("../core/recruitAiV2/schedulingAvailabilityReader");
const {
  classifySlotDayPart,
  isNearMorningBoundarySlot,
  slotSupportsDayFirstDayPartClaim,
  buildDayFirstDayPartView
} = require("../core/recruitAiV2/dayPartClassification");

const TEAM_VISION = "00000000-0000-4000-8000-000000000001";
const SATURDAY_NOW = new Date("2026-09-05T15:00:00.000-04:00");
const SUNDAY = "2026-09-06";
const MONDAY = "2026-09-07";

function slot(date, time) {
  return {
    date,
    dateKey: date,
    time,
    timeKey: time,
    timezone: "America/New_York"
  };
}

function sundaySchedule() {
  return [
    slot(SUNDAY, "11:45"),
    slot(SUNDAY, "12:15"),
    slot(SUNDAY, "13:00"),
    slot(SUNDAY, "17:00"),
    slot(SUNDAY, "20:30")
  ];
}

function mondayMorning() {
  return [slot(MONDAY, "09:00"), slot(MONDAY, "09:30"), slot(MONDAY, "10:00")];
}

function availabilityFromSlots(slots, overrides = {}) {
  const offered = slots.slice(0, 2);
  return {
    status: READ_STATUS.AVAILABLE,
    checked: true,
    rolling: true,
    nearestAlternatives: offered,
    requestedSlotAvailable: false,
    readResult: {
      status: READ_STATUS.AVAILABLE,
      rolling: true,
      slots,
      offeredSlots: offered,
      unconstrainedFutureSlots: slots,
      timezone: "America/New_York"
    },
    ...overrides
  };
}

function visionContext(overrides = {}) {
  return createConversationContext({
    preferredLanguage: "spanish",
    currentStage: "scheduling",
    organizationId: TEAM_VISION,
    organizationName: "Team Vision",
    timezone: "America/New_York",
    _testNow: SATURDAY_NOW,
    knownFacts: {
      city: "Doral",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed",
      coverage: "LOCAL",
      workAuthorization: true,
      workAuthorizationStatus: "authorized",
      preferredMeetingType: "zoom",
      meetingPreferenceSource: "coverage_default"
    },
    appointment: {
      meetingType: "zoom",
      proposedDate: null,
      proposedTime: null,
      previouslyOfferedSlots: []
    },
    conversation: {
      lastQuestionAsked: "ask_day_part",
      lastAtlasOutboundText:
        "Perfecto. ¿Prefieres en la mañana o en la tarde?"
    },
    ...overrides
  });
}

function turn(text, context, availability) {
  const interpretation = interpretInboundMessage({
    message: { text },
    context,
    options: { flexible: true, now: SATURDAY_NOW }
  });
  const structuredDecision = decideConversationTurn({
    context,
    interpretation,
    availability
  });
  const rendered = renderCustomerReply({
    ...structuredDecision.customerReplyPlan,
    entities: {
      ...structuredDecision.customerReplyPlan.entities,
      now: SATURDAY_NOW,
      timezone: "America/New_York"
    }
  });
  return { interpretation, structuredDecision, rendered };
}

const FALSE_SUNDAY_MORNING = /domingo en la ma[nñ]ana/i;

test("docs: BR-231 day-first day-part honesty", () => {
  const rules = fs.readFileSync(
    path.join(__dirname, "../../docs/06-business/BUSINESS_RULES.md"),
    "utf8"
  );
  assert.match(rules, /## BR-231/);
  assert.match(rules, /true morning for day claims/i);
  assert.match(rules, /11:45/);
});

test("classifier: 11:45 is canonical morning and near-boundary", () => {
  const late = slot(SUNDAY, "11:45");
  assert.equal(classifySlotDayPart(late), "morning");
  assert.equal(isNearMorningBoundarySlot(late), true);
  assert.equal(slotSupportsDayFirstDayPartClaim(late, "morning"), false);
  assert.equal(classifySlotDayPart(slot(SUNDAY, "13:00")), "afternoon");
  assert.equal(slotSupportsDayFirstDayPartClaim(slot(MONDAY, "09:00"), "morning"), true);
});

test("A) Sunday 11:45–21:00 + morning request => no false Sunday morning claim", () => {
  const result = turn(
    "En la mañana cuando usted quiera",
    visionContext(),
    availabilityFromSlots([...sundaySchedule(), ...mondayMorning()])
  );
  assert.equal(result.interpretation.intent, "provide_day_part");
  assert.equal(result.interpretation.entities.dayPart, "morning");
  assert.doesNotMatch(result.rendered.text, FALSE_SUNDAY_MORNING);
  assert.doesNotMatch(result.rendered.text, /Tengo disponible mañana domingo en la ma[nñ]ana/i);
});

test("B) Sunday 11:45 may be offered as earliest available, accurately labeled", () => {
  const result = turn(
    "En la mañana",
    visionContext(),
    availabilityFromSlots([...sundaySchedule(), ...mondayMorning()])
  );
  assert.match(result.rendered.text, /11:45/i);
  assert.match(result.rendered.text, /lo m[aá]s temprano/i);
  assert.doesNotMatch(result.rendered.text, FALSE_SUNDAY_MORNING);
});

test("C) Monday 09:00–21:00 true morning can be offered", () => {
  const result = turn(
    "En la mañana",
    visionContext(),
    availabilityFromSlots([...sundaySchedule(), ...mondayMorning()])
  );
  assert.match(result.rendered.text, /lunes/i);
  assert.match(result.rendered.text, /ma[nñ]ana/i);
  assert.equal(
    result.structuredDecision.contextPatch.knownFacts.preferredDayPart,
    "morning"
  );
});

test("D) response never says domingo en la mañana if Sunday slots are not true morning", () => {
  const rendered = renderCustomerReply({
    language: "spanish",
    templateKey: "offer_available_slots",
    entities: {
      dayFirstOffer: true,
      dayPart: "morning",
      preferredDayPart: "morning",
      offeredSlots: [slot(SUNDAY, "11:45"), slot(SUNDAY, "13:00")],
      dayFirstEvidenceSlots: [...sundaySchedule(), ...mondayMorning()],
      now: SATURDAY_NOW,
      timezone: "America/New_York"
    }
  });
  assert.doesNotMatch(rendered.text, FALSE_SUNDAY_MORNING);
});

test("E) afternoon request on the same Sunday can use valid afternoon slots", () => {
  const result = turn(
    "Por la tarde",
    visionContext(),
    availabilityFromSlots(sundaySchedule())
  );
  assert.equal(result.interpretation.entities.dayPart, "afternoon");
  assert.match(result.rendered.text, /tarde/i);
  assert.match(result.rendered.text, /domingo/i);
  assert.doesNotMatch(result.rendered.text, FALSE_SUNDAY_MORNING);
});

test("F) daypart-only request searches forward using actual availability", () => {
  const result = turn(
    "En la mañana",
    visionContext(),
    availabilityFromSlots([...sundaySchedule(), ...mondayMorning()])
  );
  assert.ok(
    result.structuredDecision.reasonCodes.includes("DAY_FIRST_AVAILABILITY_OFFERED")
  );
  assert.ok(
    result.structuredDecision.reasonCodes.includes("DAY_FIRST_DAYPART_SLOT_HONESTY")
  );
  assert.match(result.rendered.text, /lunes/i);
  assert.doesNotMatch(result.rendered.text, /esa hora|ese d[ií]a/i);
});

test("G) near-boundary fallback does not overwrite requested morning preference", () => {
  const result = turn(
    "En la mañana",
    visionContext(),
    availabilityFromSlots([...sundaySchedule(), ...mondayMorning()])
  );
  assert.equal(
    result.structuredDecision.customerReplyPlan.entities.preferredDayPart,
    "morning"
  );
  assert.equal(
    result.structuredDecision.contextPatch.knownFacts.preferredDayPart,
    "morning"
  );
  assert.notEqual(
    result.structuredDecision.contextPatch.knownFacts.preferredDayPart,
    "afternoon"
  );
});

test("H) actual availability reader evidence drives the day-first response", () => {
  const view = buildDayFirstDayPartView({
    offeredSlots: [slot(SUNDAY, "11:45"), slot(MONDAY, "09:00")],
    extraSlots: [...sundaySchedule(), ...mondayMorning()],
    requestedDayPart: "morning"
  });
  assert.equal(view.unavailableDayPartDate, SUNDAY);
  assert.equal(view.earliestAlternative.time, "11:45");
  assert.ok(view.claimDays.includes(MONDAY));
  assert.equal(view.claimDays.includes(SUNDAY), false);
  assert.equal(view.requestedDayPart, "morning");
});
