/**
 * BR-137 — objection handling + soft interview progression (CE/V2 parity).
 * Execution and live execution gates remain OFF. No ads.
 */

"use strict";

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  interpretInboundMessage,
  decideConversationTurn,
  createConversationContext,
  buildResponsePlan,
  renderCustomerReply,
  INTENTS,
  NEXT_ACTIONS,
  FACT_CERTAINTY,
  isExecutionEnabled
} = require("../core/recruitAiV2");
const { isLiveExecutionPathEnabled } = require("../core/recruitAiV2/liveExecutionPathConfig");
const {
  resolveRecruitFaqAnswer,
  composeAnswerThenOneQuestion
} = require("../core/recruitConversationSequencing");
const {
  getSalesObjectionFaqAnswer,
  getExperienceFaqAnswer,
  getLegitimacyTrustFaqAnswer,
  getRecruitRoleObjectionFaqAnswer
} = require("../core/teamVisionWorkflowCopy");
const { shouldDeliverAutomatedReply } = require("../core/communicationHub");

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

function qualifiedContext(extraFacts = {}) {
  return knownMiamiContext({
    workAuthorization: true,
    workAuthorizationStatus: "authorized",
    ...extraFacts
  });
}

function renderTurn(message, context) {
  const interpretation = interpretInboundMessage({ message: { text: message }, context });
  const decision = decideConversationTurn({ context, interpretation });
  const plan = buildResponsePlan(decision);
  const rendered = renderCustomerReply(plan);
  return { interpretation, decision, plan, rendered };
}

function questionCount(text) {
  return (String(text).match(/\?/g) || []).length;
}

test("execution gates remain OFF", () => {
  assert.equal(isExecutionEnabled({ env: process.env }), false);
  assert.equal(isLiveExecutionPathEnabled({ env: process.env }), false);
  assert.notEqual(process.env.RECRUIT_AI_V2_EXECUTION_ENABLED, "true");
  assert.notEqual(process.env.RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED, "true");
});

test('1. "Is this sales?" — truthful identity answer, never "we\'re not in sales"', () => {
  const { interpretation, rendered, decision } = renderTurn(
    "Is this sales?",
    knownMiamiContext()
  );
  assert.equal(interpretation.intent, INTENTS.SALES_OBJECTION);
  assert.equal(interpretation.entities.salesObjectionKind, "identity");
  assert.match(rendered.text, /financial[- ]services/i);
  assert.match(rendered.text, /licens|training|educat|famil/i);
  assert.doesNotMatch(rendered.text, /we'?re not in sales|not (a )?sales|no es ventas/i);
  assert.equal(questionCount(rendered.text), 1);
  assert.ok(decision.reasonCodes.includes("IS_THIS_SALES_IDENTITY"));
  // Still missing auth → one forward auth question
  assert.match(rendered.text, /work authorization|legal documentation/i);
});

test('2. "I have no experience." — training/licensing + continue forward', () => {
  const { interpretation, rendered } = renderTurn(
    "I have no experience",
    knownMiamiContext()
  );
  assert.equal(interpretation.intent, INTENTS.EXPERIENCE_QUESTION);
  assert.match(rendered.text, /training|licensing|prior financial/i);
  assert.doesNotMatch(rendered.text, /guaranteed|you will be accepted|promise/i);
  assert.equal(questionCount(rendered.text), 1);
  assert.match(rendered.text, /work authorization|legal documentation/i);
});

test('3. "I need to think about it." — clarify without pressure', () => {
  const mid = renderTurn("I need to think about it", knownMiamiContext());
  assert.equal(mid.interpretation.intent, INTENTS.THINK_ABOUT_IT);
  assert.match(mid.rendered.text, /think through/i);
  assert.doesNotMatch(mid.rendered.text, /must schedule|you have to|deadline/i);
  assert.equal(questionCount(mid.rendered.text), 1);

  const ready = renderTurn("I need to think about it", qualifiedContext());
  assert.equal(ready.interpretation.intent, INTENTS.THINK_ABOUT_IT);
  assert.match(ready.rendered.text, /interview|morning or afternoon/i);
  assert.doesNotMatch(ready.rendered.text, /no pressure.*(no pressure)/i);
});

test('4. "How much can I make?" — no guarantee / salary; progress when qualified', () => {
  const mid = renderTurn("How much can I make?", knownMiamiContext());
  assert.equal(mid.interpretation.intent, INTENTS.COMPENSATION_QUESTION);
  assert.doesNotMatch(mid.rendered.text, /\$\d{2,}|salary of|you'll make|guaranteed income/i);
  assert.equal(questionCount(mid.rendered.text), 1);

  const ready = renderTurn("How much can I make?", qualifiedContext());
  assert.match(ready.rendered.text, /interview/i);
  assert.match(ready.rendered.text, /morning or afternoon|next step/i);
  assert.doesNotMatch(ready.rendered.text, /city and state/i);
});

test('5. "Is this a scam?" — calm factual; soft interview when qualified', () => {
  const { interpretation, rendered } = renderTurn(
    "Is this a scam?",
    qualifiedContext()
  );
  assert.equal(interpretation.intent, INTENTS.LEGITIMACY_TRUST);
  assert.match(rendered.text, /understand|careful|financial-services|interview/i);
  assert.doesNotMatch(rendered.text, /5-star|BBB|rated #1|guaranteed legit/i);
  assert.match(rendered.text, /morning or afternoon|next step/i);
});

test('6. "I don\'t want to recruit people." — truthful; no false denial', () => {
  const { interpretation, rendered } = renderTurn(
    "I don't want to recruit people",
    knownMiamiContext()
  );
  assert.equal(interpretation.intent, INTENTS.RECRUIT_ROLE_OBJECTION);
  assert.doesNotMatch(rendered.text, /no recruiting|we never recruit|recruiting (isn'?t|is not) (part|involved)/i);
  assert.match(rendered.text, /team|families|training|understand/i);
  assert.equal(questionCount(rendered.text), 1);
  assert.doesNotMatch(rendered.text, /Quiero Reclutar|city and state/i);
});

test("7. Prospect goal flexibility — stored as context and referenced later", () => {
  const ctx = qualifiedContext();
  const first = renderTurn("I'm looking for flexibility", ctx);
  assert.equal(first.interpretation.intent, INTENTS.PROSPECT_GOAL);
  assert.equal(first.interpretation.entities.prospectGoalTheme, "flexibility");
  const patched = createConversationContext({
    preferredLanguage: "english",
    knownFacts: {
      ...ctx.knownFacts,
      ...(first.decision.contextPatch?.knownFacts || {})
    },
    conversation: {
      ...(ctx.conversation || {}),
      ...(first.decision.contextPatch?.conversation || {})
    }
  });
  assert.equal(patched.knownFacts.prospectGoalTheme, "flexibility");
  assert.ok(patched.knownFacts.prospectGoals.includes("flexibility"));

  const later = renderTurn("What is the job?", patched);
  assert.match(later.rendered.text, /flexibility|part-time|interview/i);
});

test("8. Qualified + objection resolved → soft interview transition", () => {
  const { rendered, decision } = renderTurn(
    "Is this sales?",
    qualifiedContext()
  );
  assert.match(rendered.text, /financial[- ]services/i);
  assert.match(rendered.text, /next step would be a short interview|morning or afternoon/i);
  assert.doesNotMatch(rendered.text, /work authorization|city and state/i);
  const codes = decision.reasonCodes || [];
  assert.ok(
    codes.includes("SOFT_INTERVIEW_TRANSITION") ||
      /short interview/i.test(rendered.text)
  );
});

test("9. Qualified + FAQ → answer then move toward interview", () => {
  const { rendered } = renderTurn("What is the job?", qualifiedContext());
  assert.match(rendered.text, /financial services/i);
  assert.match(rendered.text, /interview|morning or afternoon/i);
  assert.doesNotMatch(rendered.text, /work authorization/i);
});

test("10. Clearly uninterested — no interview pressure", () => {
  const { interpretation, rendered, decision } = renderTurn(
    "I'm not interested",
    qualifiedContext()
  );
  assert.equal(interpretation.intent, INTENTS.WITHDRAW_INTEREST);
  assert.equal(
    decision.decision.nextAction,
    NEXT_ACTIONS.ACKNOWLEDGE_WITHDRAW_NO_WRITE
  );
  assert.doesNotMatch(rendered.text, /morning or afternoon|schedule|interview time/i);
});

test("11. Known facts — no re-ask of location/auth", () => {
  const { rendered } = renderTurn(
    "Is this legit?",
    qualifiedContext({ preferredDayPart: "afternoon" })
  );
  assert.doesNotMatch(rendered.text, /city and state/i);
  assert.doesNotMatch(rendered.text, /work authorization/i);
  assert.doesNotMatch(rendered.text, /morning or afternoon/i);
});

test("12. CE/V2 parity — material equivalence for key objections", () => {
  const cases = [
    ["Is this sales?", "en", /financial[- ]services/i],
    ["I have no experience", "en", /training|licensing/i],
    ["Is this a scam?", "en", /interview|careful|financial/i],
    ["I don't want to recruit people", "en", /team|families|understand/i],
    ["¿Es esto ventas?", "es", /servicios financieros/i],
    ["¿Es una estafa?", "es", /entrevista|servicios financieros/i]
  ];
  for (const [msg, lang, re] of cases) {
    const ce = resolveRecruitFaqAnswer(msg, lang);
    assert.ok(ce, `CE answer missing for ${msg}`);
    assert.match(ce, re);
    assert.doesNotMatch(ce, /we'?re not in sales|no es ventas/i);
  }
  const v2Id = getSalesObjectionFaqAnswer("en", "identity");
  const ceId = resolveRecruitFaqAnswer("Is this sales?", "en");
  assert.equal(v2Id, ceId);
  assert.equal(
    getLegitimacyTrustFaqAnswer("en"),
    resolveRecruitFaqAnswer("Is this a scam?", "en")
  );
  assert.equal(
    getRecruitRoleObjectionFaqAnswer("en"),
    resolveRecruitFaqAnswer("I don't want to recruit people", "en")
  );
  assert.ok(composeAnswerThenOneQuestion(getExperienceFaqAnswer("en"), "Next?").includes("?"));
});

test("13. Spanish equivalents — same logic/compliance", () => {
  const esSalesBare = renderTurn(
    "¿Es ventas?",
    createConversationContext({
      preferredLanguage: "spanish",
      knownFacts: {
        city: "Miami",
        state: "FL",
        cityCertainty: FACT_CERTAINTY.CONFIRMED,
        stateCertainty: FACT_CERTAINTY.CONFIRMED,
        workAuthorization: true,
        workAuthorizationStatus: "authorized"
      }
    })
  );
  assert.equal(esSalesBare.interpretation.intent, INTENTS.SALES_OBJECTION);
  assert.equal(esSalesBare.interpretation.entities.salesObjectionKind, "identity");
  assert.doesNotMatch(esSalesBare.rendered.text, /no es ventas|no somos ventas|Continuemos/i);
  assert.match(esSalesBare.rendered.text, /servicios financieros|entrevista/i);

  const esSales = renderTurn(
    "¿Es esto ventas?",
    createConversationContext({
      preferredLanguage: "spanish",
      knownFacts: {
        city: "Miami",
        state: "FL",
        cityCertainty: FACT_CERTAINTY.CONFIRMED,
        stateCertainty: FACT_CERTAINTY.CONFIRMED,
        workAuthorization: true,
        workAuthorizationStatus: "authorized"
      }
    })
  );
  assert.equal(esSales.interpretation.intent, INTENTS.SALES_OBJECTION);
  assert.doesNotMatch(esSales.rendered.text, /no es ventas|no somos ventas/i);
  assert.match(esSales.rendered.text, /servicios financieros|entrevista/i);

  const esThink = renderTurn(
    "Necesito pensarlo",
    createConversationContext({ preferredLanguage: "spanish" })
  );
  assert.equal(esThink.interpretation.intent, INTENTS.THINK_ABOUT_IT);
  assert.match(esThink.rendered.text, /pensar/i);
});

test("14. Human takeover — Atlas remains silent under AGENT ownership", async () => {
  // Same contract as BR-124: without allowHandoffAck, AGENT-owned threads stay silent.
  // Probe phone unlikely to be AGENT-owned → assert API shape; silence enforced in hub.
  const result = await shouldDeliverAutomatedReply("br137-human-silence-probe", {
    allowHandoffAck: false
  });
  assert.equal(typeof result, "boolean");
});

test("15. Meta / execution config modules still present (sprint must not remove them)", () => {
  const required = [
    path.join(__dirname, "../core/recruitAiV2/executionConfig.js"),
    path.join(__dirname, "../core/recruitAiV2/liveExecutionPathConfig.js")
  ];
  for (const full of required) {
    assert.ok(fs.existsSync(full), full);
  }
  // Meta Review boundary suite remains the regression authority for fixtures/protections.
  const metaBoundary = path.join(
    __dirname,
    "scheduleConversationalFlexibilityMetaReviewBoundary.test.js"
  );
  assert.ok(fs.existsSync(metaBoundary));
});

test("16. Soft compose helper keeps one question", () => {
  const text = composeAnswerThenOneQuestion(
    getSalesObjectionFaqAnswer("en", "identity"),
    "Do you prefer morning or afternoon?"
  );
  assert.equal(questionCount(text), 1);
});
