/**
 * Recruit AI v2 — BR-103 acknowledgement ≠ confirmation + network objection.
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
  hasConfirmableAppointmentProposal,
  isSoftAcknowledgement
} = require("../core/recruitAiV2/schedulingConfirmation");
const { looksLikeNetworkObjection } = require("../core/recruitAiV2/networkObjection");
const {
  authorizeSideEffects,
  isExecutionEnabled
} = require("../core/recruitAiV2/sideEffectAuthorizer");
const {
  runRecruitAiV2ScenarioById,
  runAllRecruitAiV2ScenarioPack
} = require("../dev/recruitAiV2ScenarioPack");

const FIXED_NOW = new Date("2026-08-07T15:00:00.000-04:00");

function turn(text, context) {
  const interpretation = interpretInboundMessage({
    message: { text },
    context,
    options: { flexible: true, now: FIXED_NOW }
  });
  const structuredDecision = decideConversationTurn({ context, interpretation });
  const nextContext = buildNextContextFromInterpretation({
    loaded: context,
    interpretation,
    structuredDecision
  });
  const rendered = renderCustomerReply(structuredDecision.customerReplyPlan);
  return { interpretation, structuredDecision, nextContext, rendered };
}

function awaitingAvailabilityContext(overrides = {}) {
  return createConversationContext({
    preferredLanguage: "spanish",
    languageMeta: { source: "active_conversation" },
    currentStage: "scheduling",
    _testNow: FIXED_NOW,
    knownFacts: {
      city: "Orlando",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed",
      coverage: "OUTSIDE",
      workAuthorization: true,
      preferredDayPart: "morning",
      preferredMeetingType: "zoom",
      ...(overrides.knownFacts || {})
    },
    appointment: {
      status: "proposed",
      proposedTime: "10:00",
      meetingType: "zoom",
      previouslyOfferedSlots: [],
      ...(overrides.appointment || {})
    },
    conversation: {
      lastQuestionAsked: "awaiting_availability",
      lastAtlasOutboundText:
        "Entendido — prefieres 10:00 AM. Voy a revisar disponibilidad y te comparto opciones que funcionen.",
      ...(overrides.conversation || {})
    },
    ...overrides
  });
}

function confirmableSlotContext() {
  return createConversationContext({
    preferredLanguage: "spanish",
    languageMeta: { source: "active_conversation" },
    currentStage: "scheduling",
    _testNow: FIXED_NOW,
    knownFacts: {
      city: "Orlando",
      state: "FL",
      workAuthorization: true,
      preferredDayPart: "morning",
      preferredMeetingType: "zoom",
      coverage: "OUTSIDE"
    },
    appointment: {
      status: "proposed",
      proposedTime: "10:00",
      proposedDate: "2026-08-11",
      meetingType: "zoom",
      previouslyOfferedSlots: [
        { date: "2026-08-11", time: "10:00", timezone: "America/New_York" }
      ]
    },
    conversation: {
      lastQuestionAsked: "confirm_slot",
      lastAtlasOutboundText:
        "Tenemos disponible el lunes a las 10:00 AM por Zoom. ¿Te funciona?"
    }
  });
}

for (const text of ["ok", "okay", "perfecto", "gracias", "dale", "está bien"]) {
  test(`availability pending + "${text}" → soft acknowledgement only`, () => {
    const r = turn(text, awaitingAvailabilityContext());
    assert.equal(r.interpretation.intent, "soft_acknowledgement");
    assert.equal(
      r.structuredDecision.decision.nextAction,
      "acknowledge_soft_continue"
    );
    assert.notEqual(r.interpretation.intent, "schedule_confirm");
    assert.equal(r.structuredDecision.decision.shouldEscalate, false);
    assert.equal(r.nextContext.appointment.proposedTime, "10:00");
    assert.equal(r.nextContext.conversation.lastQuestionAsked, "awaiting_availability");
    assert.doesNotMatch(r.rendered.text, /anoté tu confirmación|compañero finalizará/i);
    assert.doesNotMatch(r.rendered.text, /dato que te acabo/i);
  });
}

test("confirmation requires concrete object", () => {
  assert.equal(
    hasConfirmableAppointmentProposal(awaitingAvailabilityContext()),
    false
  );
  assert.equal(hasConfirmableAppointmentProposal(confirmableSlotContext()), true);
});

test("candidate slot + ok → schedule_confirm", () => {
  const r = turn("ok", confirmableSlotContext());
  assert.equal(r.interpretation.intent, "schedule_confirm");
  assert.equal(r.structuredDecision.decision.nextAction, "create_appointment");
});

test("candidate slot + si → schedule_confirm", () => {
  const r = turn("si", confirmableSlotContext());
  assert.equal(r.interpretation.intent, "schedule_confirm");
});

const NETWORK_PHRASES = [
  "no conozco a nadie",
  "no conozco nadie",
  "no tengo contactos",
  "no tengo a quien llamar",
  "no tengo a quién llamar",
  "no tengo clientes",
  "a quien le voy a vender",
  "I don't know anyone",
  "I don't have contacts",
  "I don't have a network"
];

for (const text of NETWORK_PHRASES) {
  test(`network objection: "${text}"`, () => {
    assert.equal(looksLikeNetworkObjection(text), true);
    const r = turn(text, awaitingAvailabilityContext());
    assert.equal(r.interpretation.intent, "network_objection");
    assert.equal(r.structuredDecision.decision.shouldEscalate, false);
    assert.equal(r.nextContext.appointment.proposedTime, "10:00");
    assert.equal(r.nextContext.knownFacts.preferredDayPart, "morning");
    assert.doesNotMatch(r.rendered.text, /dato que te acabo/i);
    assert.doesNotMatch(
      r.rendered.text,
      /garantiz|te conseguimos clientes|te damos leads|never need to speak/i
    );
  });
}

test("BR-095 network + ok normalization", () => {
  for (const text of [
    "no conozco a nadie",
    "NO CONOZCO A NADIE",
    "¡No conozco a nadie!"
  ]) {
    const r = turn(text, awaitingAvailabilityContext());
    assert.equal(r.interpretation.intent, "network_objection");
    assert.equal(r.interpretation.entities.rawText, text);
  }
  for (const text of ["ok", "OK", "Okay"]) {
    assert.equal(isSoftAcknowledgement(text), true);
    const r = turn(text, awaitingAvailabilityContext());
    assert.equal(r.interpretation.intent, "soft_acknowledgement");
    assert.equal(r.interpretation.entities.rawText, text);
  }
});

test("exact playground scenario acknowledgement-not-confirmation-network-objection", () => {
  const report = runRecruitAiV2ScenarioById(
    "acknowledgement-not-confirmation-network-objection"
  );
  assert.equal(report.pass, true, JSON.stringify(report.turns?.filter((t) => t.failedChecks?.length)));
});

test("exact conversation: florida→Orlando→auth→morning→10→ok→network", () => {
  let ctx = createConversationContext({
    preferredLanguage: "spanish",
    languageMeta: { source: "active_conversation" },
    _testNow: FIXED_NOW
  });
  const steps = [
    "hola",
    "florida",
    "Orlando",
    "si soy residente",
    "en la manana",
    "10",
    "ok",
    "no conozco a nadie"
  ];
  const out = [];
  for (const s of steps) {
    const r = turn(s, ctx);
    out.push({
      in: s,
      intent: r.interpretation.intent,
      text: r.rendered.text
    });
    ctx = r.nextContext;
  }
  assert.equal(ctx.knownFacts.city, "Orlando");
  assert.equal(ctx.knownFacts.state, "FL");
  assert.equal(ctx.knownFacts.workAuthorization, true);
  assert.equal(ctx.knownFacts.preferredDayPart, "morning");
  assert.equal(ctx.appointment.proposedTime, "10:00");
  assert.equal(out[6].intent, "soft_acknowledgement");
  assert.equal(out[7].intent, "network_objection");
  assert.doesNotMatch(
    out.map((o) => o.text).join("\n"),
    /anoté tu confirmación|dato que te acabo/i
  );
  assert.equal(
    authorizeSideEffects({
      structuredDecision: turn("ok", awaitingAvailabilityContext()).structuredDecision
    }).authorized,
    false
  );
  assert.equal(isExecutionEnabled({}), false);
});

test("BR-102 / BR-101 / BR-100 / BR-099 regressions", () => {
  assert.equal(
    runRecruitAiV2ScenarioById("acknowledgement-not-confirmation-network-objection")
      .pass,
    true
  );
  assert.equal(runRecruitAiV2ScenarioById("sales-objection-not-location").pass, true);
  assert.equal(
    runRecruitAiV2ScenarioById("work-until-5-direct-time-negotiation").pass,
    true
  );

  const morning = turn(
    "10",
    createConversationContext({
      preferredLanguage: "spanish",
      currentStage: "scheduling",
      _testNow: FIXED_NOW,
      knownFacts: {
        city: "Miami",
        state: "FL",
        workAuthorization: true,
        preferredDayPart: "morning"
      },
      conversation: {
        lastQuestionAsked: "ask_time_preference",
        lastAtlasOutboundText: "¿Qué hora en la mañana te funciona mejor?"
      }
    })
  );
  assert.equal(morning.interpretation.entities.requestedTime, "10:00");

  const auth = turn(
    "si soy ciudadano",
    createConversationContext({
      preferredLanguage: "spanish",
      _testNow: FIXED_NOW,
      knownFacts: { city: "Miami", state: "FL" },
      conversation: {
        lastQuestionAsked: "ask_authorization",
        lastAtlasOutboundText: "¿Tienes permiso de trabajo?"
      }
    })
  );
  assert.equal(auth.interpretation.intent, "provide_authorization");
});

test("simulator pack + isolation", () => {
  const pack = runAllRecruitAiV2ScenarioPack();
  assert.equal(pack.failed, 0, JSON.stringify(pack.reports?.filter((r) => !r.pass)));
});

test("docs exist", () => {
  const root = path.join(__dirname, "../../docs");
  assert.ok(
    fs.existsSync(
      path.join(
        root,
        "03-engineering/recruit-ai-v2/31_ACK_VS_CONFIRM_NETWORK_OBJECTION.md"
      )
    )
  );
  const rules = fs.readFileSync(
    path.join(root, "06-business/BUSINESS_RULES.md"),
    "utf8"
  );
  assert.match(rules, /BR-103/);
});
