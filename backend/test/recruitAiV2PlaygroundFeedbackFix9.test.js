/**
 * Recruit AI v2 — Playground Feedback Fix #9 (BR-097)
 * Concise first-level job FAQ + progressive disclosure.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  interpretInboundMessage,
  looksLikeJobOpportunityQuestion,
  looksLikeJobOverviewQuestion
} = require("../core/recruitAiV2/interpreter");
const { decideConversationTurn } = require("../core/recruitAiV2/decisionEngine");
const { renderCustomerReply } = require("../core/recruitAiV2/responseRenderer");
const { createConversationContext } = require("../core/recruitAiV2/conversationContext");
const { buildNextContextFromInterpretation } = require("../core/recruitAiV2/contextTurnUpdate");
const {
  authorizeSideEffects,
  isExecutionEnabled
} = require("../core/recruitAiV2/sideEffectAuthorizer");
const { resolveShadowConfig } = require("../core/recruitAiV2/shadowConfig");
const {
  resolveContextCaptureConfig
} = require("../core/recruitAiV2/contextCaptureConfig");
const { runRecruitAiV2ScenarioById } = require("../dev/recruitAiV2ScenarioPack");

const FIXED_NOW = new Date("2026-08-07T15:00:00.000-04:00");

function turn(text, context, options = {}) {
  const interpretation = interpretInboundMessage({
    message: { text },
    context,
    options: { flexible: true, now: FIXED_NOW, ...options }
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

function dayPartPendingContext(overrides = {}) {
  return createConversationContext({
    preferredLanguage: "spanish",
    languageMeta: { source: "active_conversation" },
    currentStage: "qualification",
    _testNow: FIXED_NOW,
    knownFacts: {
      city: "Tampa",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed",
      coverage: "OUTSIDE",
      preferredMeetingType: "zoom",
      workAuthorization: true,
      ...(overrides.knownFacts || {})
    },
    conversation: {
      lastQuestionAsked: "ask_day_part",
      lastAtlasOutboundText:
        "Como estás en Tampa, podemos hacer la entrevista por Zoom. ¿Prefieres en la mañana o en la tarde?",
      ...(overrides.conversation || {})
    },
    ...overrides
  });
}

const OVEREXPLAIN_RE =
  /asalariado|por hora garantizado|no se requiere experiencia|no experience is required|advisory and distribution|asesor[ií]a y distribuci[oó]n|2-14|2-15|license course|comisi[oó]n|commission structure/i;

test("1. de que se trata → short overview", () => {
  assert.equal(looksLikeJobOverviewQuestion("de que se trata"), true);
  assert.equal(looksLikeJobOpportunityQuestion("de que se trata"), true);
  const r = turn("de que se trata", dayPartPendingContext());
  assert.equal(r.interpretation.intent, "job_opportunity_question");
  assert.equal(r.interpretation.entities.jobFaqDetailLevel, "overview");
  assert.match(r.rendered.text, /oportunidad en el área de servicios financieros/i);
  assert.doesNotMatch(r.rendered.text, OVEREXPLAIN_RE);
});

test("2. ¿de qué se trata? → explicit role FAQ then resume", () => {
  const r = turn("¿de qué se trata?", dayPartPendingContext());
  assert.equal(r.interpretation.entities.jobFaqDetailLevel, "overview");
  assert.match(r.rendered.text, /servicios financieros/i);
  assert.match(r.rendered.text, /ventas de productos financieros/i);
  assert.match(r.rendered.text, /mañana|tarde/i);
  assert.doesNotMatch(r.rendered.text, OVEREXPLAIN_RE);
});

test("3. que hacen → short overview", () => {
  assert.equal(looksLikeJobOverviewQuestion("que hacen"), true);
  const r = turn("que hacen", dayPartPendingContext());
  assert.equal(r.interpretation.intent, "job_opportunity_question");
  assert.equal(r.interpretation.entities.jobFaqDetailLevel, "overview");
  assert.match(r.rendered.text, /servicios financieros/i);
  assert.doesNotMatch(r.rendered.text, OVEREXPLAIN_RE);
});

test("4. what is this about → short English overview", () => {
  const r = turn(
    "what is this about",
    dayPartPendingContext({ preferredLanguage: "english" })
  );
  assert.equal(r.interpretation.entities.jobFaqDetailLevel, "overview");
  assert.match(r.rendered.text, /opportunity in financial services/i);
  assert.match(r.rendered.text, /selling financial products/i);
  assert.match(r.rendered.text, /morning|afternoon/i);
  assert.doesNotMatch(r.rendered.text, OVEREXPLAIN_RE);
});

test("5. explicit FAQ resumes pending step — no caveat stack", () => {
  const r = turn("de que se trata", dayPartPendingContext());
  assert.match(r.rendered.text, /ventas de productos financieros/i);
  assert.match(r.rendered.text, /mañana|tarde/i);
  assert.equal(
    r.structuredDecision.customerReplyPlan.templateKey,
    "job_overview_faq_then_resume"
  );
  assert.ok(
    r.structuredDecision.reasonCodes.includes("JOB_FAQ_PROGRESSIVE_DISCLOSURE")
  );
});

test("6. no salary disclaimer unless salary asked", () => {
  const overview = turn("de que se trata", dayPartPendingContext());
  assert.doesNotMatch(
    overview.rendered.text,
    /asalariado|sueldo garantizado|salaried|hourly/i
  );
  const salary = turn("¿Es salario o comisión?", dayPartPendingContext());
  assert.equal(salary.interpretation.intent, "compensation_question");
  assert.match(salary.rendered.text, /compensa|comisi|sueldo|salary|commission/i);
});

test("7. no experience copy unless experience asked", () => {
  const overview = turn("¿De qué es?", dayPartPendingContext());
  assert.equal(overview.interpretation.entities.jobFaqDetailLevel, "overview");
  assert.doesNotMatch(overview.rendered.text, /no se requiere experiencia|no experience/i);
});

test("8. overview may mention licenses generally; 2-14/2-15 stay license-FAQ only", () => {
  const overview = turn("de que se trata", dayPartPendingContext());
  assert.match(overview.rendered.text, /licencias correspondientes/i);
  assert.doesNotMatch(overview.rendered.text, /2-14|2-15/i);
  const license = turn("¿Necesito licencia?", dayPartPendingContext());
  assert.equal(license.interpretation.intent, "license_requirement_question");
  assert.match(license.rendered.text, /licencia|license/i);
});

test("9. pending workflow resumes ask_day_part", () => {
  const r = turn("de que se trata", dayPartPendingContext());
  assert.equal(r.nextContext.conversation.lastQuestionAsked, "ask_day_part");
  assert.match(r.rendered.text, /mañana o en la tarde/i);
  assert.doesNotMatch(r.rendered.text, /Por cierto/i);
});

test("10. BR-088 FAQ priority preserved", () => {
  const r = turn("¿Esto es un trabajo?", dayPartPendingContext(), {
    availability: {
      checked: true,
      requestedSlotAvailable: false,
      nearestAlternatives: []
    }
  });
  assert.equal(r.interpretation.intent, "job_opportunity_question");
  assert.equal(r.interpretation.entities.jobFaqDetailLevel, "employment_framing");
  assert.ok(r.structuredDecision.reasonCodes.includes("FAQ_OUTRANKS_SCHEDULING"));
  assert.notEqual(
    r.structuredDecision.decision.nextAction,
    "offer_alternatives_no_handoff"
  );
  // Employment framing may still mention non-salaried structure when asked "is this a job?"
  assert.match(r.rendered.text, /oportunidad|servicios financieros/i);
});

test("11. no scheduling collision on overview FAQ", () => {
  const r = turn("what is this about", dayPartPendingContext(), {
    availability: {
      checked: true,
      requestedSlotAvailable: false,
      nearestAlternatives: []
    }
  });
  assert.doesNotMatch(
    r.rendered.text,
    /Esa hora puede no estar disponible|may not be available/i
  );
  assert.equal(
    r.structuredDecision.decision.nextAction,
    "answer_job_opportunity_then_resume"
  );
});

test("12. no side effects", () => {
  const r = turn("de que se trata", dayPartPendingContext());
  const auth = authorizeSideEffects({
    structuredDecision: r.structuredDecision
  });
  assert.equal(auth.authorized, false);
  assert.equal(isExecutionEnabled({}), false);
  assert.equal(resolveShadowConfig({}).enabled, false);
  assert.equal(resolveContextCaptureConfig({}).enabled, false);
  assert.equal(r.structuredDecision.decision.mayCreateAppointment, false);
  assert.equal((auth.proposals || []).every((p) => p.authorized === false), true);
});

test("employment framing still used for is-this-a-job", () => {
  assert.equal(looksLikeJobOverviewQuestion("Esto es un trabajo"), false);
  const r = turn("Is this a job?", dayPartPendingContext({ preferredLanguage: "english" }));
  assert.equal(r.interpretation.entities.jobFaqDetailLevel, "employment_framing");
  assert.equal(
    r.structuredDecision.customerReplyPlan.templateKey,
    "job_opportunity_faq_then_resume"
  );
});

test("simulator/playground regression — tampa FAQ continuity", () => {
  const result = runRecruitAiV2ScenarioById("tampa-faq-day-part-continuity");
  assert.equal(result.pass, true, JSON.stringify(result.turns?.filter((t) => !t.pass)));
  const w = result.summary?.productionWrites || {};
  assert.equal(w.whatsappSends ?? 0, 0);
  assert.equal(w.appointmentWrites ?? 0, 0);
  assert.equal(w.calendarWrites ?? 0, 0);
  assert.equal(w.br080Mutations ?? 0, 0);
});

test("docs exist", () => {
  const root = path.join(__dirname, "../../docs");
  assert.ok(
    fs.existsSync(
      path.join(
        root,
        "03-engineering/recruit-ai-v2/25_CONCISE_JOB_FAQ_OVERVIEW.md"
      )
    )
  );
  const rules = fs.readFileSync(
    path.join(root, "06-business/BUSINESS_RULES.md"),
    "utf8"
  );
  assert.match(rules, /BR-097/);
});
