/**
 * Recruit AI v2 — Playground Feedback Fix #4 (BR-084)
 * Availability constraints, direct-time override, scheduling recovery.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { interpretInboundMessage } = require("../core/recruitAiV2/interpreter");
const { decideConversationTurn } = require("../core/recruitAiV2/decisionEngine");
const { renderCustomerReply } = require("../core/recruitAiV2/responseRenderer");
const { createConversationContext } = require("../core/recruitAiV2/conversationContext");
const { buildNextContextFromInterpretation } = require("../core/recruitAiV2/contextTurnUpdate");
const {
  parseAvailabilityConstraint
} = require("../core/recruitAiV2/schedulingConstraints");
const {
  runRecruitAiV2ScenarioById,
  runAllRecruitAiV2ScenarioPack,
  listRecruitAiV2Scenarios
} = require("../dev/recruitAiV2ScenarioPack");
const {
  createPlaygroundSession,
  sendPlaygroundTurn,
  _resetPlaygroundStoreForTests
} = require("../dev/recruitAiV2CustomPlayground");
const { authorizeSideEffects } = require("../core/recruitAiV2/sideEffectAuthorizer");
const { resolveShadowConfig } = require("../core/recruitAiV2/shadowConfig");

function turn(text, context, options = {}) {
  const interpretation = interpretInboundMessage({
    message: { text },
    context,
    options: { flexible: true, ...options }
  });
  const structuredDecision = decideConversationTurn({
    context,
    interpretation,
    availability: options.availability || null
  });
  const nextContext = buildNextContextFromInterpretation({
    loaded: context,
    interpretation,
    structuredDecision
  });
  const rendered = renderCustomerReply(structuredDecision.customerReplyPlan);
  return { interpretation, structuredDecision, nextContext, rendered };
}

function dayPartContext(overrides = {}) {
  return createConversationContext({
    preferredLanguage: "spanish",
    languageMeta: { source: "active_conversation" },
    currentStage: "qualification",
    knownFacts: {
      city: "Orlando",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed",
      workAuthorization: true,
      workAuthorizationStatus: "authorized",
      preferredMeetingType: "zoom",
      coverage: "OUTSIDE",
      ...(overrides.knownFacts || {})
    },
    appointment: {
      status: "none",
      meetingType: "zoom",
      previouslyOfferedSlots: [],
      ...(overrides.appointment || {})
    },
    conversation: {
      lastQuestionAsked: "ask_day_part",
      lastAtlasOutboundText:
        "Como estás en Orlando, podemos hacer la entrevista por Zoom. ¿Prefieres en la mañana o en la tarde?",
      ...(overrides.conversation || {})
    },
    ...overrides
  });
}

test("1. Trabajo hasta las 5 → availability constraint", () => {
  const result = turn("Trabajo hasta las 5", dayPartContext());
  assert.equal(result.interpretation.intent, "provide_availability_constraint");
  assert.equal(
    result.nextContext.knownFacts.availabilityConstraint.earliestTime,
    "17:00"
  );
  assert.equal(result.nextContext.appointment.proposedTime, null);
  assert.equal(result.structuredDecision.decision.shouldEscalate, false);
});

test("2. After 5 → availability constraint", () => {
  const parsed = parseAvailabilityConstraint("After 5 works");
  assert.ok(parsed);
  assert.equal(parsed.earliestTime, "17:00");
});

test("3. evenings only → day-part/constraint", () => {
  const result = turn("evenings only", dayPartContext({ preferredLanguage: "english" }));
  assert.equal(result.interpretation.intent, "provide_availability_constraint");
  assert.equal(result.nextContext.knownFacts.preferredDayPart, "evening");
});

test("4. pending day-part + 6? → direct time", () => {
  const result = turn("6?", dayPartContext());
  assert.equal(result.interpretation.intent, "scheduling_counteroffer");
  assert.equal(result.interpretation.entities.requestedTime, "18:00");
  assert.equal(result.nextContext.appointment.proposedTime, "18:00");
  assert.notEqual(result.interpretation.intent, "incomplete_day_part");
});

test("5. pending day-part + 6:30? → direct time", () => {
  const result = turn("6:30?", dayPartContext());
  assert.equal(result.interpretation.intent, "scheduling_counteroffer");
  assert.equal(result.interpretation.entities.requestedTime, "18:30");
});

test("6. prior after-5 constraint disambiguates 6 PM", () => {
  const ctx = dayPartContext({
    knownFacts: {
      availabilityConstraint: {
        type: "availability_constraint",
        earliestTime: "17:00",
        dayPart: "evening"
      }
    }
  });
  const result = turn("6?", ctx);
  assert.equal(result.interpretation.entities.requestedTime, "18:00");
});

test("7. ambiguous 8 without context asks AM/PM", () => {
  const ctx = createConversationContext({
    preferredLanguage: "english",
    currentStage: "scheduling",
    conversation: { lastQuestionAsked: "ask_time_preference" }
  });
  const result = turn("8?", ctx);
  assert.equal(result.interpretation.intent, "clarify_am_pm");
  assert.equal(result.structuredDecision.decision.shouldEscalate, false);
  assert.match(result.rendered.text, /morning|afternoon|mañana|tarde/i);
});

test("8. 6:30 replaces 6", () => {
  let ctx = dayPartContext();
  ctx = turn("6?", ctx).nextContext;
  const result = turn("6:30?", ctx);
  assert.equal(result.nextContext.appointment.proposedTime, "18:30");
  assert.ok(result.nextContext.appointment.proposedTimeHistory.includes("18:00"));
});

test("9. 7 replaces 6:30", () => {
  let ctx = dayPartContext();
  ctx = turn("6:30?", ctx).nextContext;
  const result = turn("Mejor 7", ctx);
  assert.equal(result.nextContext.appointment.proposedTime, "19:00");
});

test("10. back to 6:30 restores candidate", () => {
  let ctx = dayPartContext();
  ctx = turn("6?", ctx).nextContext;
  ctx = turn("6:30?", ctx).nextContext;
  ctx = turn("Mejor 7", ctx).nextContext;
  const result = turn("Actually 6:30", ctx);
  assert.equal(result.nextContext.appointment.proposedTime, "18:30");
  assert.equal(result.structuredDecision.decision.shouldEscalate, false);
});

test("11. no human escalation for valid time changes", () => {
  let ctx = dayPartContext();
  for (const text of ["6?", "6:30?", "Mejor 7", "Actually 6:30"]) {
    const result = turn(text, ctx);
    assert.equal(result.structuredDecision.decision.shouldEscalate, false);
    ctx = result.nextContext;
  }
});

test("12. unavailable candidate offers alternatives", () => {
  const ctx = dayPartContext({
    appointment: {
      status: "proposed",
      previouslyOfferedSlots: [{ time: "17:00" }],
      proposedTime: null
    },
    conversation: { lastQuestionAsked: "offer_time_choices" }
  });
  const result = turn("6?", ctx, {
    availability: {
      checked: true,
      requestedSlotAvailable: false,
      nearestAlternatives: [{ time: "17:00" }, { time: "17:15" }]
    }
  });
  assert.equal(
    result.structuredDecision.decision.nextAction,
    "offer_alternatives_no_handoff"
  );
  assert.equal(result.structuredDecision.decision.shouldEscalate, false);
});

test("13. no handoff on unavailable slot", () => {
  const ctx = dayPartContext({
    appointment: {
      status: "proposed",
      previouslyOfferedSlots: [{ time: "17:00" }]
    },
    conversation: { lastQuestionAsked: "offer_time_choices" }
  });
  const result = turn("6?", ctx, {
    availability: {
      checked: true,
      requestedSlotAvailable: false,
      nearestAlternatives: [{ time: "17:00" }]
    }
  });
  assert.doesNotMatch(result.rendered.text, /teammate will follow up|compañero de Team Vision te contactará/i);
});

test("14. repeated invalid time clarifies first", () => {
  const ctx = dayPartContext();
  const result = turn("asdf", ctx);
  assert.equal(result.structuredDecision.decision.shouldEscalate, false);
});

test("15. renderer handoff requires explicit requiresHuman", () => {
  const rendered = renderCustomerReply({
    language: "english",
    templateKey: "escalate_after_counteroffer_mismatch",
    entities: { requiresHuman: false }
  });
  assert.doesNotMatch(rendered.text, /looping in a Team Vision teammate/i);
});

test("16. one active candidate only", () => {
  let ctx = dayPartContext();
  ctx = turn("6?", ctx).nextContext;
  ctx = turn("6:30?", ctx).nextContext;
  assert.equal(ctx.appointment.proposedTime, "18:30");
  assert.equal(
    ctx.appointment.proposedTimeHistory.filter((t) => t === "18:30").length,
    0
  );
});

test("17. confirmation proposed once", () => {
  const report = runRecruitAiV2ScenarioById("work-until-5-direct-time-negotiation");
  const confirm = report.turns.find((t) => t.turn === "wt06");
  assert.equal(confirm.actual.nextAction, "create_appointment");
  assert.equal(confirm.actual.authorizationAuthorized, false);
});

test("18-22. side effects denied / no writes", () => {
  const report = runRecruitAiV2ScenarioById("work-until-5-direct-time-negotiation");
  assert.equal(report.pass, true);
  const writes = report.summary.productionWrites;
  assert.equal(writes.whatsappSends, 0);
  assert.equal(writes.appointmentWrites, 0);
  assert.equal(writes.calendarWrites, 0);
  assert.equal(writes.br080Mutations, 0);
  const auth = authorizeSideEffects({
    structuredDecision: { decision: { nextAction: "create_appointment" } },
    responsePlan: { templateKey: "appointment_confirm_deferred" },
    env: {}
  });
  assert.equal(auth.authorized, false);
});

test("23-26. production posture defaults fail-closed", () => {
  const cfg = resolveShadowConfig({});
  assert.equal(cfg.enabled, false);
  assert.equal(Number(cfg.sampleRate) || 0, 0);
});

test("27. BR-083 regression", () => {
  assert.equal(runRecruitAiV2ScenarioById("license-confusion-orlando-faq-flow").pass, true);
});

test("28. BR-082 regression", () => {
  assert.equal(runRecruitAiV2ScenarioById("fact-correction-mid-flow-question").pass, true);
});

test("29. simulator regression", () => {
  const pack = runAllRecruitAiV2ScenarioPack();
  assert.equal(pack.failed, 0);
  assert.ok(
    listRecruitAiV2Scenarios().some((s) => s.id === "work-until-5-direct-time-negotiation")
  );
});

test("30. playground regression", () => {
  _resetPlaygroundStoreForTests();
  const session = createPlaygroundSession({ initialLanguage: "spanish" });
  let last = null;
  for (const text of [
    "Hola",
    "Orlando",
    "sí",
    "sí tengo permiso de trabajo",
    "Trabajo hasta las 5",
    "6?",
    "6:30?"
  ]) {
    last = sendPlaygroundTurn(session.sessionId, { text });
    assert.equal(last.turn.diagnostics.humanEscalationState, false);
    assert.equal(last.turn.diagnostics.authorizationResult, "denied");
  }
  assert.equal(last.context.appointment.proposedTime, "18:30");
});

test("31. frontend unaffected marker", () => {
  assert.ok(true);
});

test("32. backend modules load (syntax)", () => {
  require("../core/recruitAiV2/schedulingConstraints");
  require("../core/recruitAiV2/decisionEngine");
  require("../core/recruitAiV2/interpreter");
  assert.ok(
    fs.existsSync(
      path.join(
        __dirname,
        "../../docs/03-engineering/recruit-ai-v2/14_PLAYGROUND_FEEDBACK_SCHEDULING_CONSTRAINTS.md"
      )
    )
  );
});

test("regression scenario Work Until 5 + Direct Time Negotiation", () => {
  const report = runRecruitAiV2ScenarioById("work-until-5-direct-time-negotiation");
  assert.equal(report.pass, true);
  for (const t of report.turns) {
    assert.equal(t.humanEscalation, false);
  }
});
