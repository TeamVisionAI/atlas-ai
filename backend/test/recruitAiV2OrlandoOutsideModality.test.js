/**
 * Orlando OUTSIDE modality — clears stale Doral office state (BR-083 follow-up).
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { interpretInboundMessage } = require("../core/recruitAiV2/interpreter");
const {
  decideConversationTurn,
  resolveMeetingModalityForLocation
} = require("../core/recruitAiV2/decisionEngine");
const { renderCustomerReply } = require("../core/recruitAiV2/responseRenderer");
const { createConversationContext } = require("../core/recruitAiV2/conversationContext");
const { buildNextContextFromInterpretation } = require("../core/recruitAiV2/contextTurnUpdate");
const { evaluateCoverage } = require("../core/businessRulesEngine");
const {
  runRecruitAiV2ScenarioById,
  runAllRecruitAiV2ScenarioPack
} = require("../dev/recruitAiV2ScenarioPack");
const {
  createPlaygroundSession,
  sendPlaygroundTurn,
  _resetPlaygroundStoreForTests
} = require("../dev/recruitAiV2CustomPlayground");

function turn(text, context) {
  const interpretation = interpretInboundMessage({
    message: { text },
    context,
    options: { flexible: true }
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

test("evaluateCoverage: Orlando OUTSIDE / Doral LOCAL", () => {
  assert.equal(evaluateCoverage({ city: "Orlando", state: "FL" }).coverage, "OUTSIDE");
  assert.equal(evaluateCoverage({ city: "Doral", state: "FL" }).coverage, "LOCAL");
});

test("clean Orlando auth offers Zoom not office", () => {
  _resetPlaygroundStoreForTests();
  const s = createPlaygroundSession({ initialLanguage: "spanish" });
  let last = null;
  for (const text of ["Hola", "Orlando", "sí", "Sí tengo permiso de trabajo"]) {
    last = sendPlaygroundTurn(s.sessionId, { text });
  }
  assert.equal(last.context.knownFacts.city, "Orlando");
  assert.equal(last.context.knownFacts.coverage, "OUTSIDE");
  assert.equal(last.context.knownFacts.preferredMeetingType, "zoom");
  assert.match(last.turn.atlasProposedReply, /Zoom/i);
  assert.doesNotMatch(last.turn.atlasProposedReply, /2500 NW 79th|oficinas/i);
});

test("Doral→Orlando correction clears stale in_person/office", () => {
  const ctx = createConversationContext({
    preferredLanguage: "spanish",
    languageMeta: { source: "active_conversation" },
    currentStage: "qualification",
    knownFacts: {
      city: "Doral",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed",
      workAuthorization: true,
      workAuthorizationStatus: "authorized",
      preferredMeetingType: "in_person",
      meetingPreferenceSource: "coverage_default",
      coverage: "LOCAL"
    },
    appointment: { meetingType: "in_person" },
    conversation: {
      lastQuestionAsked: "ask_day_part",
      lastAtlasOutboundText:
        "Excelente. Estamos realizando las entrevistas en nuestras oficinas ubicadas en 2500 NW 79th Ave, Suite 189, Doral, FL 33122."
    }
  });
  const result = turn("Digo, vivo en Orlando", ctx);
  assert.equal(result.nextContext.knownFacts.city, "Orlando");
  assert.equal(result.nextContext.knownFacts.coverage, "OUTSIDE");
  assert.equal(result.nextContext.knownFacts.preferredMeetingType, "zoom");
  assert.equal(result.nextContext.appointment.meetingType, "zoom");
  assert.match(result.rendered.text, /Zoom/i);
  assert.doesNotMatch(result.rendered.text, /2500 NW 79th/i);
  assert.ok(
    result.structuredDecision.reasonCodes.includes("OUTSIDE_CLEARS_STALE_OFFICE")
  );
});

test("stale in_person before Orlando auth still becomes Zoom", () => {
  const ctx = createConversationContext({
    preferredLanguage: "spanish",
    knownFacts: {
      city: "Orlando",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed",
      preferredMeetingType: "in_person",
      meetingPreferenceSource: "coverage_default",
      coverage: "LOCAL"
    },
    appointment: { meetingType: "in_person" },
    conversation: { lastQuestionAsked: "ask_authorization" }
  });
  const result = turn("Sí tengo permiso de trabajo", ctx);
  assert.equal(result.nextContext.knownFacts.preferredMeetingType, "zoom");
  assert.equal(result.nextContext.knownFacts.coverage, "OUTSIDE");
  assert.match(result.rendered.text, /Zoom/i);
  assert.doesNotMatch(result.rendered.text, /2500 NW 79th|oficinas/i);
});

test("renderer never emits office when Zoom/OUTSIDE entities set", () => {
  const rendered = renderCustomerReply({
    language: "spanish",
    templateKey: "continue_qualification_after_authorization",
    entities: { coverage: "OUTSIDE", city: "Orlando", preferredMeetingType: "zoom" }
  });
  assert.match(rendered.text, /Zoom/i);
  assert.doesNotMatch(rendered.text, /2500 NW 79th|oficinas/i);
});

test("resolveMeetingModalityForLocation OUTSIDE clears office default", () => {
  const modality = resolveMeetingModalityForLocation({
    city: "Orlando",
    state: "FL",
    preferredMeetingType: "in_person",
    meetingPreferenceSource: "coverage_default",
    coverage: "LOCAL"
  });
  assert.equal(modality.coverage, "OUTSIDE");
  assert.equal(modality.meetingType, "zoom");
  assert.equal(modality.clearedStaleOffice, true);
});

test("regression scenarios green", () => {
  assert.equal(runRecruitAiV2ScenarioById("orlando-outside-clears-stale-office").pass, true);
  assert.equal(runRecruitAiV2ScenarioById("orlando-clean-zoom-path").pass, true);
  assert.equal(runRecruitAiV2ScenarioById("license-confusion-orlando-faq-flow").pass, true);
  assert.equal(runRecruitAiV2ScenarioById("work-until-5-direct-time-negotiation").pass, true);
});

test("full simulator pack remains green", () => {
  const pack = runAllRecruitAiV2ScenarioPack();
  assert.equal(pack.failed, 0, JSON.stringify(pack.reports?.filter((r) => !r.pass)));
});
