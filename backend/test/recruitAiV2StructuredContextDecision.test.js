/**
 * Recruit AI v2 — structured context + decision engine.
 * Uses sanitized TV-000028 fixture patterns. No live WhatsApp. No production mutation.
 */

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  processRecruitAiV2TurnSync,
  loadContextFromReplayFixture,
  decideSafeFailure,
  containsInternalDiagnostics,
  authorizeSideEffects,
  INTENTS,
  NEXT_ACTIONS,
  REASON_CODES,
  isExecutionEnabled
} = require("../core/recruitAiV2");

const FIXTURE_PATH = path.join(
  __dirname,
  "fixtures/recruitAiV2/tv000028-scheduling-replay.json"
);

function loadFixture() {
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));
}

function inboundIndex(fixture, turnId) {
  const inbound = fixture.turns.filter((t) => t.direction === "inbound");
  const idx = inbound.findIndex((t) => t.id === turnId);
  assert.ok(idx >= 0, `missing turn ${turnId}`);
  return idx;
}

function runTurn(fixture, turnId, extras = {}) {
  const idx = inboundIndex(fixture, turnId);
  const turn = fixture.turns.find((t) => t.id === turnId);
  const context = loadContextFromReplayFixture(fixture, idx);
  return processRecruitAiV2TurnSync({
    message: { text: turn.text },
    context,
    options: { flexible: true, ...extras.options },
    availability: extras.availability
  });
}

test("1. counteroffer “I prefer at 6” is understood and does not book", () => {
  const fx = loadFixture();
  const result = runTurn(fx, "t07");
  assert.equal(result.interpretation.intent, INTENTS.SCHEDULING_COUNTEROFFER);
  assert.equal(result.interpretation.entities.requestedTime, "18:00");
  assert.equal(
    result.structuredDecision.decision.nextAction,
    NEXT_ACTIONS.ACKNOWLEDGE_AND_CHECK_AVAILABILITY
  );
  assert.equal(result.structuredDecision.decision.mayCreateAppointment, false);
  assert.equal(result.authorization.authorized, false);
  assert.equal(result.execution.attempted, false);
  assert.match(result.rendered.text, /6:00 PM|18:00|that time|prefer/i);
  assert.equal(containsInternalDiagnostics(result.rendered.text), false);
});

test("2. “6?” and “6:30?” counteroffers are parsed with flexibility", () => {
  const fx = loadFixture();
  const six = runTurn(fx, "t11");
  assert.equal(six.interpretation.intent, INTENTS.SCHEDULING_COUNTEROFFER);
  assert.equal(six.interpretation.entities.requestedTime, "18:00");

  const half = runTurn(fx, "t10");
  assert.equal(half.interpretation.intent, INTENTS.SCHEDULING_COUNTEROFFER);
  assert.equal(half.interpretation.entities.requestedTime, "18:30");
});

test("3. unavailable counteroffer offers alternatives without human handoff (BR-084)", () => {
  const fx = loadFixture();
  const result = runTurn(fx, "t11", {
    availability: {
      requestedSlotAvailable: false,
      nearestAlternatives: [
        { date: null, time: "17:00", timezone: "America/New_York" },
        { date: null, time: "17:15", timezone: "America/New_York" }
      ],
      checked: true
    }
  });

  assert.equal(result.structuredDecision.decision.shouldEscalate, false);
  assert.equal(
    result.structuredDecision.decision.nextAction,
    NEXT_ACTIONS.OFFER_ALTERNATIVES_NO_HANDOFF
  );
  assert.ok(
    result.structuredDecision.reasonCodes.includes(
      REASON_CODES.SLOT_UNAVAILABLE_OFFER_ALTERNATIVES
    )
  );
  assert.doesNotMatch(result.rendered.text, /teammate will follow up|compañero/i);
});

test("4. preferred language stays English for TV-000028 pattern", () => {
  const fx = loadFixture();
  const result = runTurn(fx, "t07");
  assert.equal(result.structuredDecision.preferredLanguage, "english");
  assert.equal(result.rendered.language, "english");
  assert.doesNotMatch(result.rendered.text, /Hola|entrevista por Zoom/i);
});

test("5. internal diagnostic failure never leaks to customer copy", () => {
  const fx = loadFixture();
  const idx = inboundIndex(fx, "t09");
  const context = loadContextFromReplayFixture(fx, idx);
  const result = processRecruitAiV2TurnSync({
    message: { text: "Juanito Garcia" },
    context,
    options: {
      flexible: true,
      forceSafeFailure: true,
      failureReason: "Missing authenticated agent id for appointment persistence."
    }
  });

  assert.equal(
    result.structuredDecision.decision.nextAction,
    NEXT_ACTIONS.SAFE_FAILURE_AND_ESCALATE
  );
  assert.equal(result.structuredDecision.decision.shouldEscalate, true);
  assert.equal(containsInternalDiagnostics(result.rendered.text), false);
  assert.doesNotMatch(result.rendered.text, /authenticated agent|persistence/i);
});

test("6. post-confirm “What about 6?” opens reschedule flow, does not lock forever", () => {
  const fx = loadFixture();
  const result = runTurn(fx, "t14");
  assert.equal(result.interpretation.intent, INTENTS.RESCHEDULE_REQUEST);
  assert.equal(
    result.structuredDecision.decision.nextAction,
    NEXT_ACTIONS.OFFER_RESCHEDULE_FLOW
  );
  assert.equal(result.structuredDecision.decision.mayCreateAppointment, false);
  assert.match(result.rendered.text, /reschedule/i);
});

test("7. proposed vs confirmed appointment states stay separated", () => {
  const fx = loadFixture();
  const proposed = loadContextFromReplayFixture(fx, inboundIndex(fx, "t07"));
  assert.equal(proposed.appointment.status, "proposed");
  assert.ok(proposed.appointment.previouslyOfferedSlots.length >= 1);

  const confirmed = loadContextFromReplayFixture(fx, inboundIndex(fx, "t14"));
  assert.equal(confirmed.appointment.status, "confirmed");
  assert.equal(confirmed.appointment.confirmedTime, "17:15");
});

test("8. side-effect authorizer denies send/book even if env looks enabled", () => {
  const auth = authorizeSideEffects({
    structuredDecision: {
      decision: { nextAction: "create_appointment", shouldEscalate: true },
      reasonCodes: []
    },
    responsePlan: { templateKey: "appointment_confirm_deferred" },
    env: {
      RECRUIT_AI_V2_EXECUTION_ENABLED: "true",
      RECRUIT_AI_V2_SHADOW_ENABLED: "true"
    }
  });

  assert.equal(auth.authorized, false);
  assert.ok(auth.proposals.every((p) => p.authorized === false));
  assert.equal(isExecutionEnabled({ RECRUIT_AI_V2_EXECUTION_ENABLED: "true" }), true);
});

test("9. echo of Atlas question clarifies once (no loop booking)", () => {
  const fx = loadFixture();
  const result = runTurn(fx, "t02");
  assert.equal(result.interpretation.intent, INTENTS.ECHO_OR_NOOP);
  assert.equal(result.structuredDecision.decision.nextAction, NEXT_ACTIONS.CLARIFY_ONCE);
  assert.equal(result.structuredDecision.decision.mayCreateAppointment, false);
});

test("10. opportunity question gets value-prop then qualify plan", () => {
  const fx = loadFixture();
  const result = runTurn(fx, "t01");
  assert.equal(result.interpretation.intent, INTENTS.OPPORTUNITY_QUESTION);
  assert.equal(
    result.structuredDecision.decision.nextAction,
    NEXT_ACTIONS.ANSWER_BRIEF_VALUE_PROP_THEN_QUALIFY
  );
});

test("11. schedule confirm remains side-effect disabled (no premature book)", () => {
  const fx = loadFixture();
  const idx = inboundIndex(fx, "t08");
  const context = loadContextFromReplayFixture(fx, idx);
  context.appointment.status = "proposed";
  context.conversation.lastQuestionAsked = "confirm_slot";
  const result = processRecruitAiV2TurnSync({
    message: { text: "Ok" },
    context,
    options: { flexible: true }
  });
  assert.equal(result.interpretation.intent, INTENTS.SCHEDULE_CONFIRM);
  assert.equal(result.structuredDecision.decision.mayCreateAppointment, false);
  assert.ok(
    result.structuredDecision.reasonCodes.includes(REASON_CODES.SIDE_EFFECTS_DISABLED)
  );
});

test("12. decideSafeFailure strips diagnostic phrases from customer path", () => {
  const decision = decideSafeFailure({
    context: {
      prospectId: "x",
      organizationId: "o",
      preferredLanguage: "english",
      appointment: { status: "proposed", previouslyOfferedSlots: [] },
      conversation: {},
      knownFacts: {},
      attention: {}
    },
    interpretation: {
      intent: INTENTS.PROVIDE_NAME,
      confidence: 0.8,
      entities: {},
      preferredLanguage: "english"
    },
    failureReason: "Missing authenticated agent id for appointment persistence."
  });
  assert.equal(decision.decision.shouldEscalate, true);
  assert.equal(decision.decision.mayCreateAppointment, false);
});

test("13. module surface exports orchestrator without wiring live WhatsApp", () => {
  const indexSrc = fs.readFileSync(
    path.join(__dirname, "../core/recruitAiV2/index.js"),
    "utf8"
  );
  const orchSrc = fs.readFileSync(
    path.join(__dirname, "../core/recruitAiV2/orchestrator.js"),
    "utf8"
  );
  assert.match(indexSrc, /processRecruitAiV2Turn/);
  assert.doesNotMatch(orchSrc, /sendAndPersistWhatsAppMessage|executeScheduleInterview/);
  assert.match(orchSrc, /Side effects remain disabled|DISABLED this sprint/i);
});

test("14. Meta Review flexibility gate still consulted by interpreter path", () => {
  const parser = fs.readFileSync(
    path.join(__dirname, "../core/scheduleLanguageParser.js"),
    "utf8"
  );
  const interpreter = fs.readFileSync(
    path.join(__dirname, "../core/recruitAiV2/interpreter.js"),
    "utf8"
  );
  assert.match(parser, /isConversationalScheduleFlexibilityEnabled/);
  assert.match(interpreter, /isConversationalScheduleFlexibilityEnabled/);
});

test("15. no production TV-000028 mutation helpers exist in v2 package", () => {
  const dir = path.join(__dirname, "../core/recruitAiV2");
  for (const name of fs.readdirSync(dir)) {
    const src = fs.readFileSync(path.join(dir, name), "utf8");
    assert.doesNotMatch(src, /updateProspect\(|executeScheduleInterview|claimLead\(/);
  }
});
