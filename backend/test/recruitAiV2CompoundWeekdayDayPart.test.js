/**
 * Recruit AI v2 — compound weekday/date + same-turn day-part (BR-085).
 * Production canary: Team Visionaries +17868390070, "Miércoles en la tarde"
 * classified as date-only and left stale morning on the first availability read.
 * Shared interpreter composition only. No IUL / takeover / booking writes.
 */

"use strict";

require("dotenv").config();

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { interpretInboundMessage } = require("../core/recruitAiV2/interpreter");
const { decideConversationTurn } = require("../core/recruitAiV2/decisionEngine");
const { createConversationContext } = require("../core/recruitAiV2/conversationContext");
const { buildNextContextFromInterpretation } = require("../core/recruitAiV2/contextTurnUpdate");
const {
  resolveConstraints,
  resolveAvailabilityForTurnSync,
  READ_STATUS
} = require("../core/recruitAiV2/schedulingAvailabilityReader");
const {
  buildNegotiationState
} = require("../core/sharedScheduling/schedulingNegotiationState");
const {
  runRecruitAiV2ScenarioById
} = require("../dev/recruitAiV2ScenarioPack");
const {
  collectAvailableDays,
  selectIulDayPage
} = require("../core/recruitAiV2/iulDayFirstScheduling");

const VISIONARIES_ORG = "aa045173-5eee-4c6e-978c-cc2f6125be29";
const OTHER_ORG = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const FIXED_NOW = new Date("2026-09-04T15:00:00.000-04:00");
const WEDNESDAY = "2026-09-09";
const THURSDAY = "2026-09-10";

function schedulingContext(overrides = {}) {
  const { knownFacts, appointment, conversation, ...rest } = overrides;
  return createConversationContext({
    preferredLanguage: "spanish",
    currentStage: "scheduling",
    organizationId: VISIONARIES_ORG,
    timezone: "America/New_York",
    _testNow: FIXED_NOW,
    knownFacts: {
      city: "Miami",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed",
      coverage: "OUTSIDE",
      workAuthorization: true,
      preferredMeetingType: "zoom",
      preferredDayPart: "morning",
      ...(knownFacts || {})
    },
    appointment: {
      meetingType: "zoom",
      proposedDate: null,
      proposedTime: null,
      previouslyOfferedSlots: [],
      ...(appointment || {})
    },
    conversation: {
      lastQuestionAsked: "ask_day_part",
      lastAtlasOutboundText:
        "Perfecto. Como estás en Miami, podemos hacer la entrevista por Zoom. ¿Prefieres en la mañana o en la tarde?",
      ...(conversation || {})
    },
    ...rest
  });
}

function turn(text, context, availability = null) {
  const interpretation = interpretInboundMessage({
    message: { text },
    context,
    options: { flexible: true, now: FIXED_NOW }
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
  return { interpretation, structuredDecision, nextContext };
}

function assertDateAndDayPart(interpretation, { dayName, dayPart, isoDate = null }) {
  assert.equal(interpretation.intent, "scheduling_date_proposal");
  assert.equal(interpretation.entities.requestedTime, null);
  assert.equal(interpretation.entities.requestedDate?.kind, "weekday");
  assert.equal(interpretation.entities.resolvedDate?.dayName, dayName);
  assert.equal(interpretation.entities.dayPart, dayPart);
  if (isoDate) {
    assert.equal(interpretation.entities.resolvedDate.isoDate, isoDate);
  } else {
    assert.ok(interpretation.entities.resolvedDate?.isoDate);
  }
}

test("docs: BR-085 compound weekday + day-part", () => {
  const rules = fs.readFileSync(
    path.join(__dirname, "../../docs/06-business/BUSINESS_RULES.md"),
    "utf8"
  );
  assert.match(rules, /same-turn weekday\/date \+ day-part/);
  assert.match(rules, /overwrite a stale prior day-part/);
});

test("A) Miércoles en la tarde => Wednesday + afternoon", () => {
  const { interpretation } = turn("Miércoles en la tarde", schedulingContext());
  assertDateAndDayPart(interpretation, {
    dayName: "wednesday",
    dayPart: "afternoon",
    isoDate: WEDNESDAY
  });

  const lunes = turn("El lunes en la tarde", schedulingContext());
  assertDateAndDayPart(lunes.interpretation, {
    dayName: "monday",
    dayPart: "afternoon"
  });
});

test("B) Miércoles en/por la mañana => Wednesday + morning", () => {
  const en = turn("Miércoles en la mañana", schedulingContext());
  assertDateAndDayPart(en.interpretation, {
    dayName: "wednesday",
    dayPart: "morning",
    isoDate: WEDNESDAY
  });

  const por = turn("Miércoles por la mañana", schedulingContext());
  assertDateAndDayPart(por.interpretation, {
    dayName: "wednesday",
    dayPart: "morning",
    isoDate: WEDNESDAY
  });
});

test("C) El jueves en la tarde => Thursday + afternoon", () => {
  const { interpretation } = turn("El jueves en la tarde", schedulingContext());
  assertDateAndDayPart(interpretation, {
    dayName: "thursday",
    dayPart: "afternoon",
    isoDate: THURSDAY
  });
});

test("D) Friday afternoon => Friday + afternoon", () => {
  const { interpretation } = turn(
    "Friday afternoon",
    schedulingContext({ preferredLanguage: "english" })
  );
  assertDateAndDayPart(interpretation, {
    dayName: "friday",
    dayPart: "afternoon"
  });
});

test("E) exact time + date still resolves; no invented day-part", () => {
  const { interpretation } = turn("Miércoles a las 3:30", schedulingContext());
  assert.equal(interpretation.intent, "scheduling_counteroffer");
  assert.equal(interpretation.entities.requestedDate?.kind, "weekday");
  assert.equal(interpretation.entities.resolvedDate?.dayName, "wednesday");
  assert.equal(interpretation.entities.resolvedDate?.isoDate, WEDNESDAY);
  assert.match(String(interpretation.entities.requestedTime || ""), /^\d{2}:\d{2}$/);
  assert.equal(interpretation.entities.dayPart, null);
});

test("F) compound message overwrites stale prior morning", () => {
  const { interpretation, nextContext } = turn(
    "Miércoles en la tarde",
    schedulingContext({
      knownFacts: { preferredDayPart: "morning" }
    })
  );
  assert.equal(interpretation.entities.dayPart, "afternoon");
  assert.equal(nextContext.knownFacts.preferredDayPart, "afternoon");
  assert.equal(nextContext.appointment.proposedDate, WEDNESDAY);
});

test("G) date-only remains date-only", () => {
  const { interpretation, nextContext } = turn(
    "Miércoles",
    schedulingContext({
      knownFacts: { preferredDayPart: null }
    })
  );
  assert.equal(interpretation.intent, "scheduling_date_proposal");
  assert.equal(interpretation.entities.resolvedDate.isoDate, WEDNESDAY);
  assert.equal(interpretation.entities.dayPart, null);
  assert.equal(nextContext.knownFacts.preferredDayPart || null, null);
});

test("H) daypart-only remains daypart-only and later daypart keeps date", () => {
  const only = turn(
    "En la tarde",
    schedulingContext({
      knownFacts: { preferredDayPart: null },
      appointment: { proposedDate: null }
    })
  );
  assert.equal(only.interpretation.intent, "provide_day_part");
  assert.equal(only.interpretation.entities.dayPart, "afternoon");
  assert.equal(only.interpretation.entities.resolvedDate || null, null);
  assert.equal(only.nextContext.appointment?.proposedDate || null, null);

  const dated = turn("Miércoles", schedulingContext({ knownFacts: { preferredDayPart: null } }));
  assert.equal(dated.nextContext.appointment.proposedDate, WEDNESDAY);
  const later = turn("En la tarde", dated.nextContext);
  assert.equal(later.interpretation.intent, "provide_day_part");
  assert.equal(later.interpretation.entities.dayPart, "afternoon");
  assert.equal(later.nextContext.appointment.proposedDate, WEDNESDAY);
});

test("I) first availability read uses requestedDayPart=afternoon", () => {
  const context = schedulingContext({
    knownFacts: { preferredDayPart: "morning" }
  });
  const { interpretation } = turn("Miércoles en la tarde", context);

  const constraints = resolveConstraints({ context, interpretation });
  const negotiation = buildNegotiationState({ context, interpretation });
  assert.equal(constraints.dayPart, "afternoon");
  assert.equal(negotiation.requestedDate, WEDNESDAY);
  assert.equal(negotiation.requestedDayPart, "afternoon");
  assert.notEqual(negotiation.requestedDayPart, "morning");

  const availability = resolveAvailabilityForTurnSync({
    context,
    interpretation,
    options: {
      now: FIXED_NOW,
      timezone: "America/New_York",
      agentId: "00000000-0000-4000-8000-000000000099",
      availabilityFixture: {
        timezone: "America/New_York",
        slots: [
          { date: WEDNESDAY, dateKey: WEDNESDAY, time: "10:00", timeKey: "10:00", timezone: "America/New_York" },
          { date: WEDNESDAY, dateKey: WEDNESDAY, time: "15:00", timeKey: "15:00", timezone: "America/New_York" },
          { date: THURSDAY, dateKey: THURSDAY, time: "09:30", timeKey: "09:30", timezone: "America/New_York" }
        ]
      }
    }
  });
  assert.ok(availability);
  assert.notEqual(availability.status, READ_STATUS.UNAVAILABLE);
  const offered = availability.nearestAlternatives || availability.readResult?.offeredSlots || [];
  assert.ok(offered.length >= 1);
  for (const slot of offered) {
    const t = String(slot.time || slot.timeKey || "");
    const [hh] = t.split(":").map(Number);
    assert.ok(hh > 12, `expected afternoon slot, got ${t}`);
    assert.equal(String(slot.date || slot.dateKey), WEDNESDAY);
  }
});

test("J) recruiting scheduling regression packs remain green", () => {
  assert.equal(
    runRecruitAiV2ScenarioById("orlando-scheduling-date-change-cancellation").pass,
    true
  );
  assert.equal(
    runRecruitAiV2ScenarioById("work-until-5-direct-time-negotiation").pass,
    true
  );
  assert.equal(
    runRecruitAiV2ScenarioById("tampa-faq-day-part-continuity").pass,
    true
  );
});

test("K) IUL day-first scheduling helpers remain unchanged", () => {
  const days = collectAvailableDays([
    { date: WEDNESDAY, dateKey: WEDNESDAY, time: "10:00", timeKey: "10:00" },
    { date: THURSDAY, dateKey: THURSDAY, time: "15:00", timeKey: "15:00" },
    { date: WEDNESDAY, dateKey: WEDNESDAY, time: "16:00", timeKey: "16:00" }
  ]);
  assert.equal(days.length, 2);
  assert.equal(days[0].dateKey, WEDNESDAY);
  assert.equal(days[1].dateKey, THURSDAY);
  const page = selectIulDayPage(days);
  assert.equal(page.shown.length, 2);
  assert.equal(page.includeMore, false);
});

test("tenant isolation: same phrase does not leak org facts", () => {
  const a = turn(
    "Miércoles en la tarde",
    schedulingContext({ organizationId: VISIONARIES_ORG })
  );
  const b = turn(
    "Miércoles en la tarde",
    schedulingContext({
      organizationId: OTHER_ORG,
      knownFacts: { preferredDayPart: "morning", city: "Tampa" }
    })
  );
  assert.equal(a.interpretation.entities.dayPart, "afternoon");
  assert.equal(b.interpretation.entities.dayPart, "afternoon");
  assert.equal(a.nextContext.organizationId, VISIONARIES_ORG);
  assert.equal(b.nextContext.organizationId, OTHER_ORG);
  assert.equal(b.nextContext.knownFacts.city, "Tampa");
  assert.notEqual(b.nextContext.organizationId, VISIONARIES_ORG);
});
