/**
 * BR-175 — AI Quality & Learning Review Center.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const http = require("node:http");

const {
  FEATURE_FLAGS,
  MODES,
  SIGNAL_TYPES,
  CASE_STATUSES,
  REVIEW_ACTIONS,
  resolvePlatformCaptureConfig,
  isCaptureEligible,
  classifySignals,
  detectFrustration,
  captureFromSemanticShadow,
  applyReviewAction,
  computeOverview,
  createMemoryStore,
  buildRegressionCandidate,
  syntheticCases,
  SYNTHETIC_ORG,
  OTHER_ORG
} = require("../core/aiQuality");
const { processRecruitAiV2Turn } = require("../core/recruitAiV2/orchestrator");
const { createConversationContext } = require("../core/recruitAiV2/conversationContext");
const { createEmptySemanticInterpretation } = require("../core/recruitAiV2/semantic");
const { requireSuperAdmin } = require("../middleware/requireSuperAdmin");
const { requireOrgAdmin } = require("../middleware/requireOrgAdmin");
const { SAAS_ROLES } = require("../security/saasRoles");
const platformAiQualityRoutes = require("../routes/platformAiQuality");

const CAPTURE_ON = {
  [FEATURE_FLAGS.CAPTURE_ENABLED_ENV]: "true",
  [FEATURE_FLAGS.MODE_ENV]: MODES.REVIEW
};

function participating(organizationId = SYNTHETIC_ORG) {
  return {
    organizationId,
    participationEnabled: true,
    mode: MODES.REVIEW,
    sampleRate: 1
  };
}

function disagreementObservation() {
  return {
    eligible: true,
    applied: false,
    confidence: 0.9,
    latencyMs: 40,
    tokenUsage: { promptTokens: 10, completionTokens: 4, totalTokens: 14 },
    estimatedCostUsd: 0.0001,
    comparison: {
      agree: false,
      disagreementCount: 1,
      disagreements: [{ path: "intent", legacy: "unknown", semantic: "provide_location" }]
    },
    legacy: { intent: "unknown", facts: {} },
    semantic: createEmptySemanticInterpretation({
      intent: "provide_location",
      confidence: 0.9,
      facts: { state: "SC" }
    })
  };
}

test("platform master OFF captures nothing", async () => {
  const store = createMemoryStore();
  const result = await captureFromSemanticShadow({
    observation: disagreementObservation(),
    organizationId: SYNTHETIC_ORG,
    tenantSettings: participating(),
    store,
    env: {}
  });
  assert.equal(result.captured, false);
  assert.equal(result.reason, "PLATFORM_CAPTURE_OFF");
  assert.equal(store.cases.size, 0);
});

test("malformed master switch fails closed", () => {
  const config = resolvePlatformCaptureConfig({
    [FEATURE_FLAGS.CAPTURE_ENABLED_ENV]: "yes"
  });
  assert.equal(config.captureEnabled, false);
  assert.equal(config.failClosed, true);
});

test("participating tenant captures; non-participating tenant does not", async () => {
  const store = createMemoryStore();
  const hit = await captureFromSemanticShadow({
    observation: disagreementObservation(),
    organizationId: SYNTHETIC_ORG,
    tenantSettings: participating(),
    store,
    env: CAPTURE_ON
  });
  const miss = await captureFromSemanticShadow({
    observation: disagreementObservation(),
    organizationId: OTHER_ORG,
    tenantSettings: { participationEnabled: false, mode: MODES.REVIEW, sampleRate: 1 },
    store,
    env: CAPTURE_ON
  });
  assert.equal(hit.captured, true);
  assert.equal(miss.captured, false);
  assert.equal(miss.reason, "TENANT_NOT_PARTICIPATING");
  assert.equal([...store.cases.values()].every((row) => row.organizationId === SYNTHETIC_ORG), true);
});

test("tenant cannot override platform OFF", () => {
  const gate = isCaptureEligible({
    organizationId: SYNTHETIC_ORG,
    tenantSettings: participating(),
    env: { [FEATURE_FLAGS.CAPTURE_ENABLED_ENV]: "false", [FEATURE_FLAGS.MODE_ENV]: MODES.REVIEW }
  });
  assert.equal(gate.eligible, false);
  assert.equal(gate.reason, "PLATFORM_CAPTURE_OFF");
});

test("semantic disagreement creates one deduplicated case", async () => {
  const store = createMemoryStore();
  const first = await captureFromSemanticShadow({
    observation: disagreementObservation(),
    organizationId: SYNTHETIC_ORG,
    prospectId: "prospect-1",
    tenantSettings: participating(),
    store,
    env: CAPTURE_ON
  });
  const second = await captureFromSemanticShadow({
    observation: disagreementObservation(),
    organizationId: SYNTHETIC_ORG,
    prospectId: "prospect-1",
    tenantSettings: participating(),
    store,
    env: CAPTURE_ON
  });
  assert.equal(first.captured, true);
  assert.equal(second.captured, false);
  assert.equal(second.reason, "DUPLICATE_EPISODE");
  assert.equal(store.cases.size, 1);
  const row = [...store.cases.values()][0];
  assert.equal(row.inboundTextStored, false);
  assert.equal(row.signalType, SIGNAL_TYPES.SEMANTIC_DISAGREEMENT);
  assert.equal(row.semanticInterpretation.intent, "provide_location");
});

test("repeated-question complaint creates a case", async () => {
  const store = createMemoryStore();
  const result = await captureFromSemanticShadow({
    observation: { eligible: true, applied: false, legacy: { intent: "unknown" }, semantic: null },
    organizationId: SYNTHETIC_ORG,
    inboundText: "ya me preguntaste eso",
    tenantSettings: participating(),
    store,
    env: CAPTURE_ON
  });
  assert.equal(result.captured, true);
  assert.equal([...store.cases.values()][0].signalType, SIGNAL_TYPES.REPEATED_QUESTION_COMPLAINT);
});

test("classifySignals covers frustration and human-required automation", () => {
  assert.equal(detectFrustration("eso no fue lo que dije"), true);
  const signals = classifySignals({
    inboundText: "you already asked me",
    context: {
      conversation: { lastQuestionAsked: "ask_authorization", humanRequired: true },
      knownFacts: { workAuthorization: true }
    },
    structuredDecision: { decision: { nextAction: "ask_authorization" } }
  });
  const types = signals.map((item) => item.type);
  assert.ok(types.includes(SIGNAL_TYPES.REPEATED_QUESTION_COMPLAINT));
  assert.ok(types.includes(SIGNAL_TYPES.REPEATED_QUESTION));
  assert.ok(types.includes(SIGNAL_TYPES.HUMAN_REQUIRED_THEN_QUALIFICATION));
});

test("operational quality signals are not semantic disagreement", () => {
  const faq = classifySignals({
    inboundText: "de que se trata",
    interpretation: { intent: "job_opportunity_question" },
    context: { conversation: { lastQuestionAsked: "ask_authorization" } },
    structuredDecision: { customerReplyPlan: { templateKey: "safe_uncertain_escalate" } }
  });
  assert.ok(faq.some((item) => item.type === SIGNAL_TYPES.FAQ_INTERRUPT_MISAPPLIED));
  assert.equal(faq.some((item) => item.type === SIGNAL_TYPES.SEMANTIC_DISAGREEMENT), false);

  const handoff = classifySignals({
    inboundText: "Discúlpame cual dato",
    interpretation: { intent: "conversation_clarification_request" },
    structuredDecision: { customerReplyPlan: { templateKey: "safe_uncertain_escalate" } }
  });
  assert.ok(handoff.some((item) => item.type === SIGNAL_TYPES.PREMATURE_HANDOFF));

  const mismatch = classifySignals({
    interpretation: { intent: "schedule_confirm" },
    structuredDecision: {
      decision: { nextAction: "create_appointment" },
      customerReplyPlan: { templateKey: "acknowledge_preference_awaiting_availability" }
    }
  });
  assert.ok(mismatch.some((item) => item.type === SIGNAL_TYPES.APPOINTMENT_CONFIRMATION_MISMATCH));
});

test("tenant isolation keeps other-org cases hidden", async () => {
  const store = createMemoryStore(syntheticCases());
  const own = await store.listCases({ organizationId: SYNTHETIC_ORG });
  const other = await store.listCases({ organizationId: OTHER_ORG });
  assert.ok(own.length >= 7);
  assert.equal(own.every((row) => row.organizationId === SYNTHETIC_ORG), true);
  assert.equal(other.every((row) => row.organizationId === OTHER_ORG), true);
  assert.equal(other.length, 1);
});

test("reviewer actions are audited and promotion does not mutate code", async () => {
  const store = createMemoryStore(syntheticCases());
  const qualityCase = await store.getCase("qa-insurance-condition");
  const result = await applyReviewAction({
    qualityCase,
    action: REVIEW_ACTIONS.CREATE_REGRESSION_CANDIDATE,
    notes: "Promote after human review",
    expectedBehavior: {
      expectedIntent: "insurance_condition_objection",
      expectedNextAction: "acknowledge_insurance_condition",
      forbiddenBehavior: ["continue_qualification"]
    },
    reviewerUserId: "reviewer-1",
    store
  });
  assert.equal(result.qualityCase.status, CASE_STATUSES.REGRESSION_CANDIDATE);
  assert.equal(result.regression.mutatesSourceCode, false);
  assert.equal(result.regression.mutatesTests, false);
  assert.match(result.markdown, /Do not auto-edit source or tests/);
  assert.equal(store.audits[0].action, "ai_quality.regression_promoted");
  assert.equal(result.spec.mutatesSourceCode, false);
});

test("overview metrics include win rates and cost", () => {
  const overview = computeOverview([
    { status: CASE_STATUSES.SEMANTIC_CORRECT, signalType: SIGNAL_TYPES.SEMANTIC_DISAGREEMENT, sourceEngine: "recruit_ai_v2_semantic", organizationId: SYNTHETIC_ORG, latencyMs: 20, promptTokens: 10, completionTokens: 5, estimatedCostUsd: 0.001 },
    { status: CASE_STATUSES.LEGACY_CORRECT, signalType: SIGNAL_TYPES.REPEATED_QUESTION, sourceEngine: "recruit_ai_v2", organizationId: SYNTHETIC_ORG, latencyMs: 40, promptTokens: 8, completionTokens: 2, estimatedCostUsd: 0.002 }
  ]);
  assert.equal(overview.casesDetected, 2);
  assert.equal(overview.semanticWinRate, 0.5);
  assert.equal(overview.legacyWinRate, 0.5);
  assert.equal(overview.repeatedQuestionIncidents, 1);
  assert.ok(overview.estimatedSemanticCostUsd > 0);
});

test("regression spec builder stays documentation-only", () => {
  const { spec, markdown } = buildRegressionCandidate({
    qualityCase: syntheticCases()[0],
    expectedBehavior: { expectedIntent: "insurance_condition_objection" }
  });
  assert.equal(spec.status, "proposed");
  assert.equal(spec.mutatesTests, false);
  assert.match(markdown, /Expected/);
});

test("async orchestrator behavior is unchanged when quality capture runs", async () => {
  const store = createMemoryStore();
  const context = createConversationContext({
    preferredLanguage: "spanish",
    currentStage: "qualification",
    conversation: { lastQuestionAsked: "ask_location" }
  });
  const options = {
    persistContext: false,
    env: {
      RECRUIT_AI_V2_SEMANTIC_SHADOW_ENABLED: "true",
      ...CAPTURE_ON
    },
    organizationId: SYNTHETIC_ORG,
    semanticAdapters: {
      openai: async () => ({
        ok: true,
        interpretation: createEmptySemanticInterpretation({
          intent: "provide_location",
          facts: { state: "SC" },
          confidence: 0.9
        }),
        usage: { provider: "openai", model: "gpt-4o-mini", latencyMs: 8, estimatedCostUsd: 0.0001 }
      })
    },
    captureAiQuality: async (payload) =>
      captureFromSemanticShadow({
        ...payload,
        tenantSettings: participating(),
        store,
        env: CAPTURE_ON
      })
  };
  const captured = await processRecruitAiV2Turn({
    message: { text: "Sur Carolina" },
    context,
    options
  });
  const baseline = await processRecruitAiV2Turn({
    message: { text: "Sur Carolina" },
    context,
    options: { ...options, captureAiQuality: async () => ({ captured: false }) }
  });
  assert.equal(captured.interpretation.intent, baseline.interpretation.intent);
  assert.equal(
    captured.structuredDecision.customerReplyPlan.templateKey,
    baseline.structuredDecision.customerReplyPlan.templateKey
  );
  assert.equal(captured.semanticShadow.applied, false);
  assert.ok(store.cases.size >= 1);
});

test("Super Admin can list cases; tenant Admin cannot use platform route", async () => {
  const store = createMemoryStore(syntheticCases());
  const service = require("../services/aiQualityService");
  const originalGetStore = service.getStore;
  const originalList = service.listCasesForScope;
  service.getStore = () => store;
  service.listCasesForScope = (query) => store.listCases(query);

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.authContext = {
      userId: "actor",
      saasRole: req.headers["x-super"] === "1" ? SAAS_ROLES.SUPER_ADMIN : SAAS_ROLES.ADMIN,
      organizationId: SYNTHETIC_ORG
    };
    next();
  });
  app.use("/api/platform/ai-quality", requireSuperAdmin, platformAiQualityRoutes);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  const denied = await fetch(`http://127.0.0.1:${port}/api/platform/ai-quality/cases`);
  const allowed = await fetch(`http://127.0.0.1:${port}/api/platform/ai-quality/cases`, {
    headers: { "x-super": "1" }
  });
  assert.equal(denied.status, 403);
  assert.equal(allowed.status, 200);
  const body = await allowed.json();
  assert.ok(body.cases.length >= 1);
  server.close();
  service.getStore = originalGetStore;
  service.listCasesForScope = originalList;
});

test("tenant Admin API hides other-org cases", async () => {
  const store = createMemoryStore(syntheticCases());
  const { getCaseForScope } = require("../services/aiQualityService");
  const own = await getCaseForScope({
    caseId: "qa-insurance-condition",
    organizationId: SYNTHETIC_ORG,
    store
  });
  const leaked = await getCaseForScope({
    caseId: "qa-other-tenant",
    organizationId: SYNTHETIC_ORG,
    store
  });
  assert.equal(own.id, "qa-insurance-condition");
  assert.equal(leaked, null);
});

test("requireOrgAdmin rejects normal agents", () => {
  const req = { authContext: { saasRole: SAAS_ROLES.REPRESENTATIVE } };
  let status = 0;
  const res = {
    status(code) {
      status = code;
      return this;
    },
    json() {
      return this;
    }
  };
  requireOrgAdmin(req, res, () => {
    status = 200;
  });
  assert.equal(status, 403);
});

test("migration and UI stay capture-default-off and apply-off", () => {
  const sql = fs.readFileSync(
    path.join(__dirname, "../database/migrations/059_br175_ai_quality_learning_center.sql"),
    "utf8"
  );
  assert.match(sql, /participation_enabled BOOLEAN NOT NULL DEFAULT false/);
  assert.match(sql, /ai_quality_cases/);
  assert.match(sql, /deny_anon/);
  const page = fs.readFileSync(
    path.join(__dirname, "../../frontend/src/pages/platform/AiQualityPage.jsx"),
    "utf8"
  );
  assert.match(page, /Semantic apply stays off/);
  assert.doesNotMatch(page, /OPENAI_API_KEY/);
  const interpreter = fs.readFileSync(
    path.join(__dirname, "../core/recruitAiV2/semantic/semanticInterpreterConfig.js"),
    "utf8"
  );
  assert.match(interpreter, /applyEnabled: false/);
});
