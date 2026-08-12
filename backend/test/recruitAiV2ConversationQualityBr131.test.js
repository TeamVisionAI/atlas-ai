/**
 * BR-131 — thin first-turn + FAQ resume guard + CE/V2 FAQ sequencing parity.
 * Execution and live execution gates remain OFF. No ads.
 */

"use strict";

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  interpretInboundMessage,
  decideConversationTurn,
  createConversationContext,
  buildResponsePlan,
  renderCustomerReply,
  processRecruitAiV2TurnSync,
  INTENTS,
  FACT_CERTAINTY,
  isExecutionEnabled
} = require("../core/recruitAiV2");
const { isLiveExecutionPathEnabled } = require("../core/recruitAiV2/liveExecutionPathConfig");
const {
  composeAnswerThenOneQuestion,
  resolveRecruitFaqAnswer,
  resolveFaqResumeTemplateKeyFromFacts
} = require("../core/recruitConversationSequencing");
const {
  getFirstMessage,
  getJobOverviewFaqAnswer,
  getExperienceFaqAnswer
} = require("../core/teamVisionWorkflowCopy");
const {
  resolveQualificationResume
} = require("../core/recruitAiV2/decisionEngine");

function knownMiamiContext(extraFacts = {}) {
  return createConversationContext({
    preferredLanguage: "english",
    knownFacts: {
      city: "Miami",
      state: "FL",
      cityCertainty: FACT_CERTAINTY.CONFIRMED,
      stateCertainty: FACT_CERTAINTY.CONFIRMED,
      workAuthorization: null,
      workAuthorizationStatus: "unknown",
      preferredDayPart: null,
      ...extraFacts
    }
  });
}

function renderTurn(message, context) {
  const interpretation = interpretInboundMessage({ message: { text: message }, context });
  const decision = decideConversationTurn({ context, interpretation });
  const plan = buildResponsePlan(decision);
  const rendered = renderCustomerReply(plan);
  return { interpretation, decision, plan, rendered };
}

test("execution gates remain OFF", () => {
  assert.equal(isExecutionEnabled({ env: process.env }), false);
  assert.equal(isLiveExecutionPathEnabled({ env: process.env }), false);
  assert.notEqual(process.env.RECRUIT_AI_V2_EXECUTION_ENABLED, "true");
  assert.notEqual(process.env.RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED, "true");
});

test("1. Greeting-only first inbound — natural response + one location question", () => {
  const { interpretation, rendered } = renderTurn(
    "Hi",
    createConversationContext({ preferredLanguage: "english" })
  );
  assert.equal(interpretation.intent, INTENTS.GREETING);
  assert.match(rendered.text, /thanks for reaching out/i);
  assert.match(rendered.text, /city and state/i);
  assert.equal((rendered.text.match(/\?/g) || []).length, 1);
  assert.doesNotMatch(rendered.text, /\n\n/);
});

test("2. What is the job? before city — answer first then one qualify question", () => {
  const { rendered, decision } = renderTurn(
    "What is the job?",
    createConversationContext({ preferredLanguage: "english" })
  );
  assert.match(rendered.text, /financial services/i);
  assert.doesNotMatch(rendered.text, /we'll explain all the details during the interview/i);
  assert.match(rendered.text, /city and state/i);
  assert.ok(
    decision.customerReplyPlan.templateKey.includes("job_") ||
      decision.customerReplyPlan.templateKey.includes("opportunity") ||
      decision.customerReplyPlan.templateKey.includes("overview")
  );
  // Not a pure location deflection
  assert.notEqual(rendered.text.trim(), getFirstMessage("en"));
});

test("3. Known Miami, FL + FAQ — do not ask city/state again", () => {
  const { rendered } = renderTurn("What is the job?", knownMiamiContext());
  assert.match(rendered.text, /financial services/i);
  assert.doesNotMatch(rendered.text, /city and state/i);
  assert.doesNotMatch(rendered.text, /which state/i);
  assert.match(rendered.text, /work authorization|legal documentation/i);
});

test("4. Known work authorization + FAQ — do not ask authorization again", () => {
  const { rendered } = renderTurn(
    "Do I need experience?",
    knownMiamiContext({
      workAuthorization: true,
      workAuthorizationStatus: "authorized"
    })
  );
  assert.match(rendered.text, /don'?t need prior experience|isn'?t required|training/i);
  assert.doesNotMatch(rendered.text, /work authorization|legal documentation to work/i);
  assert.doesNotMatch(rendered.text, /city and state/i);
});

test("5. Known location + authorization — resume at next true missing fact", () => {
  const resume = resolveQualificationResume(
    knownMiamiContext({
      workAuthorization: true,
      workAuthorizationStatus: "authorized"
    })
  );
  assert.equal(resume.lastQuestionAsked, "ask_day_part");
  assert.notEqual(resume.templateKey, "greeting_ask_location");
  assert.notEqual(resume.templateKey, "continue_qualification_after_location");
});

test("6. Later-stage FAQ — resume without regressing to earlier question", () => {
  const { rendered } = renderTurn(
    "I don't know how to sell",
    knownMiamiContext({
      workAuthorization: true,
      workAuthorizationStatus: "authorized",
      preferredDayPart: "morning"
    })
  );
  assert.doesNotMatch(rendered.text, /city and state/i);
  assert.doesNotMatch(rendered.text, /work authorization/i);
  assert.doesNotMatch(rendered.text, /morning or afternoon/i);
  assert.match(rendered.text, /morning|time/i);
});

test("7. Experience question — concise + correct resume", () => {
  const answer = getExperienceFaqAnswer("en");
  assert.ok(answer.length < 160);
  assert.doesNotMatch(answer, /interview/i);
  const { rendered } = renderTurn(
    "Do I need experience?",
    createConversationContext({ preferredLanguage: "english" })
  );
  assert.match(rendered.text, /don'?t need prior experience|isn'?t required|training and licensing/i);
  assert.match(rendered.text, /city and state/i);
});

test("8. Sales/network objection — acknowledge + one next question", () => {
  const sales = renderTurn(
    "I don't know how to sell",
    knownMiamiContext()
  );
  assert.match(sales.rendered.text, /training|sales experience/i);
  assert.equal((sales.rendered.text.match(/\?/g) || []).length >= 1, true);
  assert.doesNotMatch(sales.rendered.text, /city and state/i);

  const network = renderTurn(
    "I don't know anyone",
    knownMiamiContext({
      workAuthorization: true,
      workAuthorizationStatus: "authorized"
    })
  );
  assert.match(network.rendered.text, /network|contacts|training/i);
  assert.doesNotMatch(network.rendered.text, /work authorization/i);
});

test("9. No premature scheduling from FAQ resume before qual complete", () => {
  const resume = resolveFaqResumeTemplateKeyFromFacts({
    city: "Miami",
    state: "FL",
    cityCertainty: "confirmed",
    stateCertainty: "confirmed",
    workAuthorization: null
  });
  assert.equal(resume.lastQuestionAsked, "ask_authorization");
  assert.notEqual(resume.lastQuestionAsked, "ask_time_preference");

  const blank = resolveFaqResumeTemplateKeyFromFacts({});
  assert.equal(blank.lastQuestionAsked, "ask_location");
});

test("10. Shared sequencing compose helper", () => {
  const text = composeAnswerThenOneQuestion(
    getJobOverviewFaqAnswer("en"),
    "What city and state do you live in?"
  );
  assert.match(text, /financial services/i);
  assert.match(text, /city and state/i);
  assert.doesNotMatch(text, /By the way/i);
  assert.doesNotMatch(text, /\n\n/);
});

test("11. CE vs V2 FAQ content parity for job and experience", () => {
  const job = resolveRecruitFaqAnswer("What is the job?", "en");
  const exp = resolveRecruitFaqAnswer("Do I need experience?", "en");
  assert.match(job, /financial services/i);
  assert.match(exp, /don'?t need prior experience|isn'?t required|training and licensing/i);

  const v2 = renderTurn("What is the job?", createConversationContext());
  assert.match(v2.rendered.text, /financial services/i);
  assert.match(v2.rendered.text, /city and state/i);
});

test("12. Greeting with known location resumes next missing fact (no city re-ask)", () => {
  const { rendered, plan } = renderTurn("Hello", knownMiamiContext());
  assert.equal(plan.templateKey, "greeting_then_resume");
  assert.doesNotMatch(rendered.text, /city and state/i);
  assert.match(rendered.text, /work authorization|legal documentation/i);
});

test("sync turn path remains non-mutating when allowExecution true", () => {
  const result = processRecruitAiV2TurnSync({
    message: { text: "Hi" },
    context: createConversationContext(),
    allowExecution: true
  });
  assert.ok(result);
  assert.notEqual(process.env.RECRUIT_AI_V2_EXECUTION_ENABLED, "true");
  assert.equal(isExecutionEnabled({ env: process.env }), false);
});

const SPANISH_OVERVIEW =
  "Es una oportunidad en servicios financieros donde ayudamos a las familias con protección y planificación financiera. Ofrecemos entrenamiento y capacitación.";

function spanishBlank() {
  return createConversationContext({ preferredLanguage: "spanish" });
}

function assertSpanishOverviewThenCity(message) {
  const { interpretation, plan, rendered } = renderTurn(message, spanishBlank());
  assert.equal(interpretation.intent, INTENTS.JOB_OPPORTUNITY_QUESTION);
  assert.equal(plan.templateKey, "job_overview_faq_then_resume");
  assert.equal(
    rendered.text,
    `${SPANISH_OVERVIEW} ¿En qué ciudad y estado vives?`
  );
  assert.doesNotMatch(rendered.text, /empleo por hora/i);
  assert.doesNotMatch(rendered.text, /\bcampaign\b|\bcódigo QR\b|QR campaign/i);
  assert.doesNotMatch(rendered.text, /\bnegocio\b|\bcontratista\b|\bsalario\b|\bcomisi[oó]n\b/i);
}

test("13. Spanish QR prefill maps to job overview (not prospect_goal)", () => {
  assertSpanishOverviewThenCity(
    "Hola, quiero conocer más sobre la oportunidad."
  );
});

test("14. Quiero conocer más sobre la oportunidad → overview", () => {
  assertSpanishOverviewThenCity("Quiero conocer más sobre la oportunidad");
});

test("15. Vi el código QR → overview, not clarify_once", () => {
  assertSpanishOverviewThenCity("Vi el código QR");
});

test("16. Vi el QR → overview", () => {
  assertSpanishOverviewThenCity("Vi el QR");
});

test("17. Escaneé el código → overview", () => {
  assertSpanishOverviewThenCity("Escaneé el código");
});

test("18. Escaneé el código QR → overview", () => {
  assertSpanishOverviewThenCity("Escaneé el código QR");
});

test("19. Quiero más información / ¿De qué se trata? still overview", () => {
  assertSpanishOverviewThenCity("Quiero más información");
  assertSpanishOverviewThenCity("¿De qué se trata?");
});

test("20. Hola remains greeting-only (no unsolicited overview)", () => {
  const { interpretation, plan, rendered } = renderTurn("Hola", spanishBlank());
  assert.equal(interpretation.intent, INTENTS.GREETING);
  assert.equal(plan.templateKey, "greeting_ask_location");
  assert.equal(
    rendered.text,
    "¡Hola! Gracias por escribirnos. ¿En qué ciudad y estado vives?"
  );
  assert.doesNotMatch(rendered.text, /servicios financieros/i);
});

test("21. Me interesa stays prospect_goal (not stolen by info detector)", () => {
  const { interpretation, plan } = renderTurn("Me interesa", spanishBlank());
  assert.equal(interpretation.intent, INTENTS.PROSPECT_GOAL);
  assert.equal(plan.templateKey, "prospect_goal_ack_then_resume");
});

test("22. Me interesa flexibilidad / Quiero ganar más dinero not stolen", () => {
  const flex = renderTurn("Me interesa flexibilidad", spanishBlank());
  assert.equal(flex.interpretation.intent, INTENTS.PROSPECT_GOAL);
  assert.notEqual(flex.plan.templateKey, "job_overview_faq_then_resume");

  const money = renderTurn("Quiero ganar más dinero", spanishBlank());
  assert.notEqual(money.interpretation.intent, INTENTS.JOB_OPPORTUNITY_QUESTION);
  assert.notEqual(money.plan.templateKey, "job_overview_faq_then_resume");
});

test("23. ¿Cuánto pagan? compensation unchanged", () => {
  const { interpretation, plan } = renderTurn("¿Cuánto pagan?", spanishBlank());
  assert.equal(interpretation.intent, INTENTS.COMPENSATION_QUESTION);
  assert.equal(plan.templateKey, "compensation_faq_then_resume");
});

test("24. ¿Es ventas? stays BR-137 sales path", () => {
  const { interpretation, plan } = renderTurn("¿Es ventas?", spanishBlank());
  assert.equal(interpretation.intent, INTENTS.SALES_OBJECTION);
  assert.match(String(plan.templateKey || ""), /sales/i);
});

test("25. No me interesa withdraw unchanged", () => {
  const { interpretation, plan } = renderTurn("No me interesa", spanishBlank());
  assert.equal(interpretation.intent, INTENTS.WITHDRAW_INTEREST);
  assert.match(String(plan.templateKey || ""), /withdraw/i);
});

test("26. Spanish job overview exact canonical copy (no hourly disclaimer)", () => {
  assert.equal(getJobOverviewFaqAnswer("es"), SPANISH_OVERVIEW);
  assert.doesNotMatch(getJobOverviewFaqAnswer("es"), /empleo por hora/i);
});
const ENGLISH_OVERVIEW =
  "It's an opportunity in financial services where we help families with protection and financial planning. We provide training and support.";

function englishBlank() {
  return createConversationContext({ preferredLanguage: "english" });
}

function assertEnglishOverviewThenCity(message) {
  const { interpretation, plan, rendered } = renderTurn(message, englishBlank());
  assert.equal(interpretation.intent, INTENTS.JOB_OPPORTUNITY_QUESTION);
  assert.equal(plan.templateKey, "job_overview_faq_then_resume");
  assert.equal(
    rendered.text,
    `${ENGLISH_OVERVIEW} What city and state do you live in?`
  );
  assert.doesNotMatch(rendered.text, /guaranteed hourly|hourly job/i);
  assert.doesNotMatch(rendered.text, /\bcampaign\b|\bQR code\b|QR campaign/i);
  assert.doesNotMatch(
    rendered.text,
    /\bindependent contractor\b|\bcommission\b|\bbusiness opportunity\b|\bsalary\b/i
  );
}

test("27. Hi + learn more about the opportunity → English overview + city/state", () => {
  assertEnglishOverviewThenCity(
    "Hi, I want to learn more about the opportunity."
  );
});

test("28. I want to learn more about the opportunity → overview", () => {
  assertEnglishOverviewThenCity("I want to learn more about the opportunity");
});

test("29. I'd like more information → overview", () => {
  assertEnglishOverviewThenCity("I'd like more information");
});

test("30. I would like more information → overview", () => {
  assertEnglishOverviewThenCity("I would like more information");
});

test("31. Can you tell me more? → overview", () => {
  assertEnglishOverviewThenCity("Can you tell me more?");
});

test("32. What is this about? → overview", () => {
  assertEnglishOverviewThenCity("What is this about?");
});

test("33. I saw the QR code → overview", () => {
  assertEnglishOverviewThenCity("I saw the QR code");
});

test("34. I scanned the QR code → overview", () => {
  assertEnglishOverviewThenCity("I scanned the QR code");
});

test("35. I saw the QR → overview", () => {
  assertEnglishOverviewThenCity("I saw the QR");
});

test("36. Tell me about the opportunity → overview", () => {
  assertEnglishOverviewThenCity("Tell me about the opportunity");
});

test("37. Hi remains greeting-only (no unsolicited overview)", () => {
  const { interpretation, plan, rendered } = renderTurn("Hi", englishBlank());
  assert.equal(interpretation.intent, INTENTS.GREETING);
  assert.equal(plan.templateKey, "greeting_ask_location");
  assert.match(rendered.text, /thanks for reaching out/i);
  assert.match(rendered.text, /city and state/i);
  assert.doesNotMatch(rendered.text, /financial services/i);
});

test("38. I'm interested in flexibility not stolen by info detector", () => {
  const { interpretation, plan } = renderTurn(
    "I'm interested in flexibility",
    englishBlank()
  );
  assert.equal(interpretation.intent, INTENTS.PROSPECT_GOAL);
  assert.notEqual(plan.templateKey, "job_overview_faq_then_resume");
});

test("39. I want to make more money not stolen by info detector", () => {
  const { interpretation, plan } = renderTurn(
    "I want to make more money",
    englishBlank()
  );
  assert.notEqual(interpretation.intent, INTENTS.JOB_OPPORTUNITY_QUESTION);
  assert.notEqual(plan.templateKey, "job_overview_faq_then_resume");
});

test("40. How much does it pay? compensation unchanged", () => {
  const { interpretation, plan } = renderTurn(
    "How much does it pay?",
    englishBlank()
  );
  assert.equal(interpretation.intent, INTENTS.COMPENSATION_QUESTION);
  assert.equal(plan.templateKey, "compensation_faq_then_resume");
});

test("41. Is this sales? stays sales path", () => {
  const { interpretation, plan } = renderTurn("Is this sales?", englishBlank());
  assert.equal(interpretation.intent, INTENTS.SALES_OBJECTION);
  assert.match(String(plan.templateKey || ""), /sales/i);
});

test("42. I'm not interested withdraw unchanged", () => {
  const { interpretation, plan } = renderTurn(
    "I'm not interested",
    englishBlank()
  );
  assert.equal(interpretation.intent, INTENTS.WITHDRAW_INTEREST);
  assert.match(String(plan.templateKey || ""), /withdraw/i);
});

test("43. English job overview exact canonical copy (no hourly disclaimer)", () => {
  assert.equal(getJobOverviewFaqAnswer("en"), ENGLISH_OVERVIEW);
  assert.doesNotMatch(getJobOverviewFaqAnswer("en"), /guaranteed hourly|hourly job/i);
});
