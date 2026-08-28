/**
 * Recruit AI v2 — BR-108 rolling multi-date availability offering.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  selectCrossDateCandidateSlots,
  readRollingCandidateSlotsSync,
  INITIAL_HORIZON_HOURS,
  MAX_EXPANSION_DAYS,
  READ_STATUS
} = require("../core/recruitAiV2/schedulingAvailabilityReader");
const { parseAvailabilityConstraint } = require("../core/recruitAiV2/schedulingConstraints");
const { interpretInboundMessage } = require("../core/recruitAiV2/interpreter");
const { decideConversationTurn } = require("../core/recruitAiV2/decisionEngine");
const { renderCustomerReply } = require("../core/recruitAiV2/responseRenderer");
const { createConversationContext } = require("../core/recruitAiV2/conversationContext");
const { buildNextContextFromInterpretation } = require("../core/recruitAiV2/contextTurnUpdate");
const {
  authorizeSideEffects,
  isExecutionEnabled
} = require("../core/recruitAiV2/sideEffectAuthorizer");
const {
  runRecruitAiV2ScenarioById,
  runAllRecruitAiV2ScenarioPack
} = require("../dev/recruitAiV2ScenarioPack");

const LATE_FRIDAY = new Date("2026-08-07T21:00:00.000-04:00");

function slots(list) {
  return list.map(([dateKey, timeKey]) => ({ dateKey, timeKey, date: dateKey, time: timeKey }));
}

function baseContext(overrides = {}) {
  return createConversationContext({
    preferredLanguage: "spanish",
    languageMeta: { source: "active_conversation" },
    currentStage: "scheduling",
    organizationId: "sim-org-team-vision",
    agentId: "agent-fixture-br108",
    timezone: "America/New_York",
    _testNow: LATE_FRIDAY,
    knownFacts: {
      city: "Miami",
      state: "FL",
      workAuthorization: true,
      preferredDayPart: "afternoon",
      ...(overrides.knownFacts || {})
    },
    appointment: {
      status: "proposed",
      proposedDate: null,
      previouslyOfferedSlots: [],
      ...(overrides.appointment || {})
    },
    conversation: {
      lastQuestionAsked: "ask_time_preference",
      ...(overrides.conversation || {})
    },
    ...overrides
  });
}

function turn(text, context, options = {}) {
  const interpretation = interpretInboundMessage({
    message: { text },
    context,
    options: { flexible: true, now: LATE_FRIDAY }
  });
  const availability =
    options.availability !== undefined
      ? options.availability
      : require("../core/recruitAiV2/schedulingAvailabilityReader").resolveAvailabilityForTurnSync(
          {
            context,
            interpretation,
            options: {
              now: LATE_FRIDAY,
              availabilityFixture: options.availabilityFixture || context._availabilityFixture,
              agentId: context.agentId,
              getSlotsSync: options.getSlotsSync
            }
          }
        );
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
  return { interpretation, structuredDecision, nextContext, rendered, availability };
}

test("horizons: initial 48h, max expansion 14 days", () => {
  assert.equal(INITIAL_HORIZON_HOURS, 48);
  assert.equal(MAX_EXPANSION_DAYS, 14);
});

test("1. late Friday + after 5: Saturday + Sunday → offer both", () => {
  const fixture = {
    timezone: "America/New_York",
    slots: slots([
      ["2026-08-08", "18:00"],
      ["2026-08-09", "19:00"]
    ])
  };
  const r = turn("después de las 5", baseContext({ _availabilityFixture: fixture }), {
    availabilityFixture: fixture
  });
  assert.equal(r.structuredDecision.decision.nextAction, "offer_available_slots");
  assert.match(r.rendered.text, /Tengo disponible/i);
  assert.match(r.rendered.text, /sábado|mañana/i);
  assert.match(r.rendered.text, /domingo/i);
  assert.doesNotMatch(r.rendered.text, /anoto que puedes|Qué día/i);
  assert.equal(r.nextContext.knownFacts.availabilityConstraint.earliestTimeInclusive, false);
});

test("2. Saturday + Sunday zero + Monday → Saturday + Monday", () => {
  const fixture = {
    timezone: "America/New_York",
    slots: slots([
      ["2026-08-08", "18:00"],
      ["2026-08-10", "17:30"]
    ])
  };
  const r = turn("despues de las 5", baseContext({ _availabilityFixture: fixture }), {
    availabilityFixture: fixture
  });
  assert.equal(r.structuredDecision.decision.nextAction, "offer_available_slots");
  const offered = r.availability.nearestAlternatives;
  assert.deepEqual(
    offered.map((s) => `${s.date}|${s.time}`),
    ["2026-08-08|18:00", "2026-08-10|17:30"]
  );
  assert.match(r.rendered.text, /lunes/i);
  assert.doesNotMatch(r.rendered.text, /domingo no|Sunday isn't/i);
});

test("3. Saturday multi + Sunday → cross-date choice", () => {
  const offered = selectCrossDateCandidateSlots(
    slots([
      ["2026-08-08", "17:30"],
      ["2026-08-08", "18:00"],
      ["2026-08-08", "19:00"],
      ["2026-08-09", "18:30"]
    ])
  );
  assert.deepEqual(
    offered.map((s) => `${s.dateKey}|${s.timeKey}`),
    ["2026-08-08|17:30", "2026-08-08|19:00"]
  );
});

test("4. only one slot in 48h → expand for second", () => {
  const calls = [];
  const result = readRollingCandidateSlotsSync({
    organizationId: "org",
    agentId: "agent",
    timezone: "America/New_York",
    constraints: {
      earliestTime: "17:00",
      earliestTimeInclusive: false,
      raw: "after 5"
    },
    now: LATE_FRIDAY,
    getSlotsSync: ({ date, dateEnd }) => {
      calls.push({ date, dateEnd });
      if (dateEnd) {
        return {
          timezone: "America/New_York",
          slots: slots([["2026-08-08", "18:00"]])
        };
      }
      if (date === "2026-08-10") {
        return {
          timezone: "America/New_York",
          slots: slots([["2026-08-10", "17:30"]])
        };
      }
      return { timezone: "America/New_York", slots: [] };
    }
  });
  assert.equal(result.status, READ_STATUS.AVAILABLE);
  assert.deepEqual(
    result.offeredSlots.map((s) => `${s.dateKey}|${s.timeKey}`),
    ["2026-08-08|18:00", "2026-08-10|17:30"]
  );
  assert.ok(calls.some((c) => c.dateEnd));
  assert.ok(calls.some((c) => c.date === "2026-08-10" && !c.dateEnd));
});

test("5. only one slot in entire horizon → offer one", () => {
  const fixture = {
    slots: slots([["2026-08-08", "18:00"]])
  };
  const r = turn("after 5", baseContext({ _availabilityFixture: fixture }), {
    availabilityFixture: fixture
  });
  assert.equal(r.structuredDecision.decision.nextAction, "offer_available_slots");
  assert.equal(r.availability.nearestAlternatives.length, 1);
  assert.match(r.rendered.text, /Tengo disponible|I have availability/i);
  assert.match(r.rendered.text, /¿Te funciona|Does that work/i);
});

test("6. zero qualifying across horizon → truthful no-availability", () => {
  const fixture = {
    slots: slots([
      ["2026-08-08", "16:00"],
      ["2026-08-09", "17:00"]
    ])
  };
  const r = turn("después de las 5", baseContext({ _availabilityFixture: fixture }), {
    availabilityFixture: fixture
  });
  assert.equal(
    r.structuredDecision.decision.nextAction,
    "acknowledge_no_qualifying_availability"
  );
  assert.match(r.rendered.text, /próximos días|coming days/i);
  assert.doesNotMatch(r.rendered.text, /Tengo disponible/i);
});

test("7. provider failure → fallback, not zero availability", () => {
  const r = turn("después de las 5", baseContext(), {
    getSlotsSync: () => {
      throw new Error("calendar down");
    }
  });
  assert.notEqual(
    r.structuredDecision.decision.nextAction,
    "acknowledge_no_qualifying_availability"
  );
  assert.ok(
    r.structuredDecision.reasonCodes.includes("AVAILABILITY_READ_UNAVAILABLE") ||
      r.structuredDecision.decision.nextAction === "acknowledge_availability_constraint"
  );
  assert.doesNotMatch(r.rendered.text, /próximos días/i);
});

test("8. después de las 5 excludes 17:00 on every date", () => {
  const exclusive = parseAvailabilityConstraint("después de las 5");
  assert.equal(exclusive.earliestTimeInclusive, false);
  const result = readRollingCandidateSlotsSync({
    organizationId: "org",
    agentId: "agent",
    timezone: "America/New_York",
    constraints: {
      earliestTime: exclusive.earliestTime,
      earliestTimeInclusive: exclusive.earliestTimeInclusive,
      raw: exclusive.raw
    },
    now: LATE_FRIDAY,
    fixtureSlots: slots([
      ["2026-08-08", "17:00"],
      ["2026-08-08", "17:30"],
      ["2026-08-09", "17:00"],
      ["2026-08-09", "18:00"]
    ])
  });
  assert.deepEqual(
    result.slots.map((s) => `${s.dateKey}|${s.timeKey}`),
    ["2026-08-08|17:30", "2026-08-09|18:00"]
  );
});

test("9. a partir de las 5 includes 17:00", () => {
  const inclusive = parseAvailabilityConstraint("a partir de las 5");
  assert.equal(inclusive.earliestTimeInclusive, true);
  const result = readRollingCandidateSlotsSync({
    organizationId: "org",
    agentId: "agent",
    timezone: "America/New_York",
    constraints: {
      earliestTime: inclusive.earliestTime,
      earliestTimeInclusive: inclusive.earliestTimeInclusive,
      raw: inclusive.raw
    },
    now: LATE_FRIDAY,
    fixtureSlots: slots([
      ["2026-08-08", "17:00"],
      ["2026-08-08", "18:00"]
    ])
  });
  assert.ok(result.slots.some((s) => s.timeKey === "17:00"));
});

test("10. past slots today never offered", () => {
  const afternoon = new Date("2026-08-08T18:00:00.000-04:00"); // Sat 6pm
  const result = readRollingCandidateSlotsSync({
    organizationId: "org",
    agentId: "agent",
    timezone: "America/New_York",
    constraints: { earliestTime: "17:00", earliestTimeInclusive: false },
    now: afternoon,
    fixtureSlots: slots([
      ["2026-08-08", "17:30"],
      ["2026-08-08", "19:00"],
      ["2026-08-09", "18:00"]
    ])
  });
  assert.ok(!result.slots.some((s) => s.dateKey === "2026-08-08" && s.timeKey === "17:30"));
  assert.ok(result.slots.some((s) => s.dateKey === "2026-08-08" && s.timeKey === "19:00"));
});

test("11. org-local timezone determines today/tomorrow wording", () => {
  const fixture = {
    timezone: "America/New_York",
    slots: slots([["2026-08-08", "18:00"]])
  };
  const r = turn("despues de las 5", baseContext({ _availabilityFixture: fixture }), {
    availabilityFixture: fixture
  });
  assert.match(r.rendered.text, /mañana/i);
});

test("12-15. sprint22 source, no fabrication, no writes, execution OFF", () => {
  const fixture = {
    slots: slots([
      ["2026-08-08", "18:00"],
      ["2026-08-09", "19:00"]
    ])
  };
  const r = turn("despues de las 5", baseContext({ _availabilityFixture: fixture }), {
    availabilityFixture: fixture
  });
  assert.equal(r.availability.readResult.source, "sprint22");
  assert.doesNotMatch(r.rendered.text, /5:45 PM|invent/i);
  const auth = authorizeSideEffects({
    structuredDecision: r.structuredDecision,
    responsePlan: { templateKey: "offer_available_slots" },
    env: {}
  });
  assert.equal(auth.authorized, false);
  assert.equal(isExecutionEnabled({}), false);

  const readerSrc = fs.readFileSync(
    path.join(__dirname, "../core/recruitAiV2/schedulingAvailabilityReader.js"),
    "utf8"
  );
  assert.doesNotMatch(readerSrc, /bookSlot|createAppointment|createCalendarEvent/);
});

test("scenario rolling-availability-after-constraint", async () => {
  const report = await runRecruitAiV2ScenarioById("rolling-availability-after-constraint");
  assert.equal(report.pass, true, JSON.stringify(report.failures || report, null, 2));
});

test("simulator pack stays green", async () => {
  const pack = await runAllRecruitAiV2ScenarioPack();
  assert.equal(
    pack.failed,
    0,
    JSON.stringify(
      (pack.reports || []).filter((x) => !x.pass).map((x) => x.id),
      null,
      2
    )
  );
});

test("docs + BR-108 exist", () => {
  const doc = path.join(
    __dirname,
    "../../docs/03-engineering/recruit-ai-v2/36_ROLLING_AVAILABILITY_OFFER.md"
  );
  assert.equal(fs.existsSync(doc), true);
  const br = fs.readFileSync(
    path.join(__dirname, "../../docs/06-business/BUSINESS_RULES.md"),
    "utf8"
  );
  assert.match(br, /BR-108/);
});
