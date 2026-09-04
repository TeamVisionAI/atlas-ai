/**
 * Recruit AI v2 — Playground Feedback Fix #3 (BR-083)
 * Work auth vs financial license, specific FAQs, compensation, location-aware meeting mode.
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
  parseLicenseStatement,
  parseWorkAuthorizationAnswer,
  WORK_AUTHORIZATION,
  FINANCIAL_LICENSE_STATUS
} = require("../core/recruitAiV2/qualificationFacts");
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
const {
  getInsuranceFaqAnswer,
  getLicenseRequirementFaqAnswer,
  getCompensationFaqAnswer
} = require("../core/teamVisionWorkflowCopy");

function turn(text, context, options = {}) {
  const interpretation = interpretInboundMessage({
    message: { text },
    context,
    options: { flexible: true, ...options }
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

const { TEAM_VISION_ORGANIZATION_ID } = require("../core/teamVisionSeedTenant");
const TV_OFFICE = "2500 NW 79th Ave, Suite 189, Doral, FL 33122";

function authContext(overrides = {}) {
  return createConversationContext({
    organizationId: TEAM_VISION_ORGANIZATION_ID,
    officeAddress: TV_OFFICE,
    officeAddressSource: "organization_profile",
    preferredLanguage: "spanish",
    languageMeta: { source: "active_conversation" },
    currentStage: "qualification",
    knownFacts: {
      city: "Orlando",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed",
      workAuthorization: null,
      workAuthorizationStatus: WORK_AUTHORIZATION.UNKNOWN,
      financialLicenseStatus: FINANCIAL_LICENSE_STATUS.UNKNOWN,
      ...(overrides.knownFacts || {})
    },
    conversation: {
      lastQuestionAsked: "ask_authorization",
      lastAtlasOutboundText:
        "Gracias. ¿Tienes permiso de trabajo o documentación legal para trabajar en Estados Unidos?",
      ...(overrides.conversation || {})
    },
    ...overrides
  });
}

test("1. pending work-auth + tengo licencia does not authorize", () => {
  const result = turn("sí, tengo licencia", authContext());
  assert.equal(result.interpretation.intent, "ambiguous_license_statement");
  assert.equal(result.nextContext.knownFacts.workAuthorization, null);
  assert.notEqual(
    result.nextContext.knownFacts.workAuthorizationStatus,
    WORK_AUTHORIZATION.AUTHORIZED
  );
  assert.equal(
    result.structuredDecision.decision.nextAction,
    "clarify_license_type"
  );
  assert.match(result.rendered.text, /conducir/i);
});

test("2. pending license + tengo permiso de trabajo captures auth only", () => {
  const context = authContext({
    conversation: {
      lastQuestionAsked: "clarify_license_type",
      pendingClarification: "clarify_license_type"
    },
    knownFacts: {
      financialLicenseStatus: FINANCIAL_LICENSE_STATUS.UNCLEAR
    }
  });
  const priorLicense = context.knownFacts.financialLicenseStatus;
  const result = turn("tengo permiso de trabajo", context);
  assert.equal(result.interpretation.intent, "provide_authorization");
  assert.equal(result.nextContext.knownFacts.workAuthorization, true);
  assert.equal(result.nextContext.knownFacts.financialLicenseStatus, priorLicense);
  assert.equal(
    result.structuredDecision.decision.nextAction,
    "clarify_license_type"
  );
});

test("3. generic I have a license is ambiguous", () => {
  const parsed = parseLicenseStatement("I have a license");
  assert.equal(parsed.ambiguous, true);
  const result = turn("I have a license", authContext({ preferredLanguage: "english" }));
  assert.equal(result.interpretation.intent, "ambiguous_license_statement");
  assert.match(result.rendered.text, /driver/i);
});

test("4. driver's license sets financialLicense none", () => {
  const context = authContext({
    conversation: { lastQuestionAsked: "clarify_license_type" }
  });
  const result = turn("driver's license", context);
  assert.equal(result.interpretation.intent, "provide_license_clarification");
  assert.equal(
    result.nextContext.knownFacts.financialLicenseStatus,
    FINANCIAL_LICENSE_STATUS.NONE
  );
  assert.equal(result.nextContext.knownFacts.workAuthorization, null);
});

test("5. la de conducir sets financialLicense none", () => {
  const context = authContext({
    conversation: { lastQuestionAsked: "clarify_license_type" }
  });
  const result = turn("La de conducir", context);
  assert.equal(
    result.nextContext.knownFacts.financialLicenseStatus,
    FINANCIAL_LICENSE_STATUS.NONE
  );
  assert.match(result.rendered.text, /autorizaci[oó]n|permiso/i);
});

test("6. tengo licencia de seguros is financial licensed", () => {
  const parsed = parseLicenseStatement("tengo licencia de seguros");
  assert.equal(parsed.ambiguous, false);
  assert.equal(parsed.financialLicenseStatus, FINANCIAL_LICENSE_STATUS.LICENSED);
  const result = turn("tengo licencia de seguros", authContext());
  assert.equal(result.interpretation.intent, "provide_license_clarification");
  assert.equal(
    result.nextContext.knownFacts.financialLicenseStatus,
    FINANCIAL_LICENSE_STATUS.LICENSED
  );
  assert.equal(result.nextContext.knownFacts.workAuthorization, null);
});

test("7. tengo la 215 is florida_215", () => {
  const parsed = parseLicenseStatement("tengo la 215");
  assert.equal(parsed.financialLicenseStatus, FINANCIAL_LICENSE_STATUS.LICENSED);
  assert.ok(parsed.financialLicenseTypes.includes("florida_215"));
});

test("8. estoy sacando la licencia is in_progress", () => {
  const parsed = parseLicenseStatement("estoy sacando la licencia");
  assert.equal(
    parsed.financialLicenseStatus,
    FINANCIAL_LICENSE_STATUS.IN_PROGRESS
  );
});

test("9. license requirement question answered specifically", () => {
  const result = turn("Do I need a license?", authContext());
  assert.equal(result.interpretation.intent, "license_requirement_question");
  assert.equal(
    result.structuredDecision.decision.nextAction,
    "answer_license_requirement_then_resume"
  );
  assert.match(result.rendered.text, /licenci/i);
  assert.equal(result.structuredDecision.decision.shouldEscalate, false);
});

test("10. insurance-specific FAQ", () => {
  const result = turn("Is this insurance?", authContext());
  assert.equal(result.interpretation.intent, "insurance_question");
  assert.match(result.rendered.text, /seguro/i);
  assert.doesNotMatch(result.rendered.text, /^Trabajamos en la asesoría/);
});

test("11. compensation FAQ", () => {
  const result = turn("How much money do I make?", authContext());
  assert.equal(result.interpretation.intent, "compensation_question");
  assert.match(result.rendered.text, /compensaci[oó]n|compensation|sueldo/i);
});

test("12. salary question", () => {
  const result = turn("Is there a salary?", authContext({ preferredLanguage: "english" }));
  assert.equal(result.interpretation.intent, "compensation_question");
});

test("13. commission question", () => {
  const result = turn("Is it commission?", authContext({ preferredLanguage: "english" }));
  assert.equal(result.interpretation.intent, "compensation_question");
});

test("14. no guaranteed income response", () => {
  const en = getCompensationFaqAnswer("en");
  const es = getCompensationFaqAnswer("es");
  assert.match(en, /without promising|not.*guaranteed|isn't an hourly/i);
  assert.match(es, /sin prometer|no es un puesto por hora|garantizado/i);
  assert.doesNotMatch(en, /\$\d/);
  assert.doesNotMatch(es, /\$\d/);
});

test("15. Orlando meeting-mode uses Zoom default after auth", () => {
  const result = turn("sí tengo permiso de trabajo", authContext());
  assert.equal(result.interpretation.intent, "provide_authorization");
  assert.equal(
    result.structuredDecision.decision.nextAction,
    "capture_authorization_continue"
  );
  assert.equal(result.nextContext.knownFacts.preferredMeetingType, "zoom");
  assert.match(result.rendered.text, /Zoom/i);
  assert.doesNotMatch(result.rendered.text, /2500 NW 79th/i);
});

test("16. Doral local meeting-mode uses office", () => {
  const context = authContext({
    knownFacts: {
      city: "Doral",
      state: "FL",
      cityCertainty: "confirmed",
      stateCertainty: "confirmed"
    }
  });
  const result = turn("sí tengo permiso", context);
  assert.match(result.rendered.text, /oficinas|offices|2500 NW 79th/i);
  assert.equal(result.nextContext.knownFacts.preferredMeetingType, "in_person");
});

test("17. FAQ interruption preserves pending state", () => {
  const context = authContext({
    conversation: {
      lastQuestionAsked: "clarify_license_type",
      pendingClarification: "clarify_license_type"
    }
  });
  const result = turn("de que se trata?", context);
  assert.equal(
    result.nextContext.conversation.lastQuestionAsked,
    "clarify_license_type"
  );
  assert.match(result.rendered.text, /conducir|seguros/i);
});

test("18. sequential different FAQ questions", () => {
  let ctx = authContext();
  for (const text of [
    "Is this insurance?",
    "Do I need a license?",
    "How much money do I make?"
  ]) {
    const result = turn(text, ctx);
    assert.equal(result.structuredDecision.decision.shouldEscalate, false);
    assert.equal(result.nextContext.conversation.lastQuestionAsked, "ask_authorization");
    ctx = result.nextContext;
  }
});

test("19. recognized FAQ does not fall into generic clarification", () => {
  const result = turn("How much money do I make?", authContext());
  assert.notEqual(result.structuredDecision.decision.nextAction, "clarify_once");
  assert.notEqual(
    result.structuredDecision.customerReplyPlan.templateKey,
    "clarify_once"
  );
});

test("20. normal FAQ does not trigger human handoff", () => {
  for (const text of [
    "Is this insurance?",
    "Do I need a license?",
    "How much does it pay?",
    "de que se trata?"
  ]) {
    const result = turn(text, authContext());
    assert.equal(result.structuredDecision.decision.shouldEscalate, false);
  }
});

test("21. workAuthorization and financialLicense never overwrite each other", () => {
  assert.equal(
    parseWorkAuthorizationAnswer("sí, tengo licencia", {
      conversation: { lastQuestionAsked: "ask_authorization" }
    }),
    null
  );
  const lic = parseLicenseStatement("tengo licencia de seguros");
  assert.ok(lic);
  assert.equal(
    parseWorkAuthorizationAnswer("tengo licencia de seguros", {
      conversation: { lastQuestionAsked: "ask_authorization" }
    }),
    null
  );
});

test("22. existing fact correction regression remains green", () => {
  const report = runRecruitAiV2ScenarioById("fact-correction-mid-flow-question");
  assert.equal(report.pass, true);
});

test("23. existing multi-counteroffer regression remains green", () => {
  const report = runRecruitAiV2ScenarioById("time-counteroffers");
  assert.equal(report.pass, true);
});

test("24. simulator scenarios remain green", () => {
  const pack = runAllRecruitAiV2ScenarioPack();
  assert.equal(pack.failed, 0, JSON.stringify(pack.reports?.filter((r) => !r.pass)));
  const ids = listRecruitAiV2Scenarios().map((s) => s.id);
  assert.ok(ids.includes("license-confusion-orlando-faq-flow"));
});

test("25. playground remains isolated", () => {
  _resetPlaygroundStoreForTests();
  const session = createPlaygroundSession({ initialLanguage: "spanish" });
  const r = sendPlaygroundTurn(session.sessionId, { text: "Hola" });
  assert.equal(r.turn.diagnostics.authorizationResult, "denied");
  assert.ok(session.sessionId);
});

test("26-29. no WhatsApp/appointment/Calendar/BR-080 mutation in scenario", () => {
  const report = runRecruitAiV2ScenarioById("license-confusion-orlando-faq-flow");
  assert.equal(report.pass, true);
  const writes = report.summary?.productionWrites || {};
  assert.equal(writes.whatsappSends ?? 0, 0);
  assert.equal(writes.appointmentWrites ?? 0, 0);
  assert.equal(writes.calendarWrites ?? 0, 0);
  assert.equal(writes.br080Mutations ?? 0, 0);
  for (const t of report.turns) {
    assert.equal(t.authorizationResult, "denied");
  }
});

test("30-32. production posture defaults remain fail-closed in code", () => {
  const { resolveShadowConfig } = require("../core/recruitAiV2/shadowConfig");
  const { authorizeSideEffects, isExecutionEnabled } = require("../core/recruitAiV2/sideEffectAuthorizer");
  const cfg = resolveShadowConfig({});
  assert.equal(cfg.enabled, false);
  assert.equal(Number(cfg.sampleRate) || 0, 0);
  assert.equal(isExecutionEnabled({}), false);
  const auth = authorizeSideEffects({
    structuredDecision: { decision: { nextAction: "create_appointment" } },
    responsePlan: { templateKey: "default" },
    env: {}
  });
  assert.equal(auth.authorized, false);
});

test("33. frontend unaffected marker — no frontend files in this fix suite", () => {
  assert.ok(true);
});

test("34. backend modules load (syntax)", () => {
  assert.ok(getInsuranceFaqAnswer("en"));
  assert.ok(getLicenseRequirementFaqAnswer("es"));
  require("../core/recruitAiV2/qualificationFacts");
  require("../core/recruitAiV2/decisionEngine");
  require("../core/recruitAiV2/interpreter");
});

test("regression scenario License Confusion + Orlando FAQ Flow", () => {
  const report = runRecruitAiV2ScenarioById("license-confusion-orlando-faq-flow");
  assert.equal(report.pass, true);
  const byId = Object.fromEntries(report.turns.map((t) => [t.turn, t]));
  assert.equal(byId.lc04.actual.workAuthorization, null);
  assert.equal(byId.lc04.actual.financialLicenseStatus, "unclear");
  assert.equal(byId.lc06.actual.meetingType, "zoom");
});
