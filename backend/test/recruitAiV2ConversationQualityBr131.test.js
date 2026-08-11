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
  assert.match(rendered.text, /don'?t need prior experience|training/i);
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
  assert.match(rendered.text, /don'?t need prior experience/i);
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
  assert.match(exp, /don'?t need prior experience/i);

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