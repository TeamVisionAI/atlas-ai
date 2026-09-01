/**
 * BR-198 — AI Quality authorized learning actions.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  LEARNING_ACTIONS,
  PROPOSAL_STATUSES,
  REGRESSION_STATUSES,
  IMPLEMENTATION_STATUSES,
  CASE_STATUSES,
  SIGNAL_TYPES,
  RISK_LEVELS,
  applyLearningAction,
  buildLearningProposal,
  containsHiddenReasoning,
  buildLearningReport,
  createMemoryStore,
  syntheticCases,
  SYNTHETIC_ORG,
  OTHER_ORG
} = require("../core/aiQuality");
const { applyLearningCaseAction, presentPlatformSettings } = require("../services/aiQualityService");

function storeWithFixtures() {
  return createMemoryStore(syntheticCases());
}

function hiddenKeys() {
  return ["chainOfThought", "chain_of_thought", "hiddenReasoning", "thinking", "scratchpad"];
}

test("docs: BR-198 documented and APPLY stays off", () => {
  const rules = fs.readFileSync(path.join(__dirname, "../../docs/06-business/BUSINESS_RULES.md"), "utf8");
  assert.match(rules, /## BR-198 — AI Quality Authorized Learning Actions/);
  assert.match(rules, /Approving a regression must not authorize code changes/);
  const migration = fs.readFileSync(
    path.join(__dirname, "../database/migrations/070_br198_ai_quality_authorized_learning.sql"),
    "utf8"
  );
  assert.match(migration, /ai_quality_learning_proposals/);
  assert.match(migration, /ai_quality_implementation_proposals/);
  assert.match(migration, /ai_quality_learning_actions/);
  assert.match(migration, /deny_anon/);
  const settings = presentPlatformSettings({
    ATLAS_AI_QUALITY_CAPTURE_ENABLED: "true",
    ATLAS_AI_QUALITY_MODE: "REVIEW"
  });
  assert.equal(settings.applyEnabled, false);
  assert.equal(settings.autonomousApply, false);
  const interpreter = fs.readFileSync(
    path.join(__dirname, "../core/recruitAiV2/semantic/semanticInterpreterConfig.js"),
    "utf8"
  );
  assert.match(interpreter, /applyEnabled: false/);
});

test("A) quality case → proposal generated", async () => {
  const store = storeWithFixtures();
  const qualityCase = await store.getCase("qa-citizenship-repeat");
  const result = await applyLearningAction({
    qualityCase,
    action: LEARNING_ACTIONS.GENERATE_PROPOSAL,
    actorUserId: "reviewer-magner",
    store
  });
  assert.equal(result.proposal.status, PROPOSAL_STATUSES.GENERATED);
  assert.equal(result.proposal.proposal.signal_type, SIGNAL_TYPES.REPEATED_QUESTION);
  assert.equal(result.proposal.proposal.risk_level, RISK_LEVELS.LOW);
  assert.equal(result.regression, null);
  assert.equal(store.regressions.size, 0);
  assert.equal(result.qualityCase.status, CASE_STATUSES.REVIEWING);
});

test("B) proposal generation stores no chain-of-thought", async () => {
  const store = storeWithFixtures();
  const qualityCase = {
    ...(await store.getCase("qa-citizenship-repeat")),
    chainOfThought: "do not persist this",
    hiddenReasoning: "secret"
  };
  const result = await applyLearningAction({
    qualityCase,
    action: LEARNING_ACTIONS.GENERATE_PROPOSAL,
    actorUserId: "reviewer-1",
    store
  });
  const json = JSON.stringify(result.proposal);
  for (const key of hiddenKeys()) {
    assert.equal(json.includes(`"${key}"`), false, key);
  }
  assert.equal(containsHiddenReasoning(result.proposal.proposal), false);
  assert.equal(result.proposal.generatedBy, "atlas_deterministic");
});

test("C) regression cannot be created without explicit approval", async () => {
  const store = storeWithFixtures();
  const qualityCase = await store.getCase("qa-citizenship-repeat");
  await applyLearningAction({
    qualityCase,
    action: LEARNING_ACTIONS.GENERATE_PROPOSAL,
    actorUserId: "reviewer-1",
    store
  });
  assert.equal(store.regressions.size, 0);
  const pending = await store.getCase("qa-state-first");
  await assert.rejects(
    () =>
      applyLearningAction({
        qualityCase: pending,
        action: LEARNING_ACTIONS.APPROVE_REGRESSION,
        actorUserId: "reviewer-1",
        store
      }),
    /REGRESSION_APPROVAL_REQUIRED/
  );
  assert.equal(store.regressions.size, 0);
});

test("D/E) approved regression enters library and does not authorize implementation", async () => {
  const store = storeWithFixtures();
  const qualityCase = await store.getCase("qa-citizenship-repeat");
  await applyLearningAction({
    qualityCase,
    action: LEARNING_ACTIONS.GENERATE_PROPOSAL,
    actorUserId: "reviewer-1",
    store
  });
  const approved = await applyLearningAction({
    qualityCase: await store.getCase("qa-citizenship-repeat"),
    action: LEARNING_ACTIONS.APPROVE_REGRESSION,
    actorUserId: "reviewer-1",
    expectedBehavior: {
      expectedIntent: "provide_work_authorization",
      expectedNextAction: "ask_location",
      forbiddenBehavior: ["ask_authorization"]
    },
    store
  });
  assert.equal(approved.regression.status, REGRESSION_STATUSES.APPROVED);
  assert.equal(approved.regression.spec.implementationAuthorized, false);
  assert.equal(approved.implementationAuthorized, false);
  assert.equal(approved.implementation.status, IMPLEMENTATION_STATUSES.PROPOSED);
  assert.equal(approved.implementation.mutatesSourceCode, false);
  assert.equal(approved.proposal.status, PROPOSAL_STATUSES.REGRESSION_APPROVED);
  const listed = await store.listRegressions({ organizationId: SYNTHETIC_ORG });
  assert.equal(listed.length, 1);
  assert.equal(listed[0].status, REGRESSION_STATUSES.APPROVED);
});

test("F/G) implementation requires separate authorization; HIGH cannot bypass", async () => {
  const store = storeWithFixtures();
  const qualityCase = await store.getCase("qa-appointment-confirm-mismatch");
  await applyLearningAction({
    qualityCase,
    action: LEARNING_ACTIONS.GENERATE_PROPOSAL,
    actorUserId: "reviewer-1",
    store
  });
  const proposal = await store.getProposalByCase(qualityCase.id);
  assert.equal(proposal.riskLevel, RISK_LEVELS.HIGH);
  await assert.rejects(
    () =>
      applyLearningAction({
        qualityCase: { ...qualityCase },
        action: LEARNING_ACTIONS.APPROVE_REGRESSION,
        actorUserId: "reviewer-1",
        preAuthorize: true,
        store
      }),
    /IMPLEMENTATION_AUTHORIZATION_REQUIRED/
  );
  const approved = await applyLearningAction({
    qualityCase: await store.getCase(qualityCase.id),
    action: LEARNING_ACTIONS.APPROVE_REGRESSION,
    actorUserId: "reviewer-1",
    store
  });
  assert.equal(approved.implementationAuthorized, false);
  const afterApprove = await store.getCase(qualityCase.id);
  await assert.rejects(
    () =>
      applyLearningAction({
        qualityCase: afterApprove,
        action: LEARNING_ACTIONS.AUTHORIZE_IMPLEMENTATION,
        actorUserId: "reviewer-1",
        skipAuthorization: true,
        store
      }),
    /IMPLEMENTATION_AUTHORIZATION_REQUIRED/
  );
  const authorized = await applyLearningAction({
    qualityCase: await store.getCase(qualityCase.id),
    action: LEARNING_ACTIONS.AUTHORIZE_IMPLEMENTATION,
    actorUserId: "reviewer-1",
    store
  });
  assert.equal(authorized.implementation.status, IMPLEMENTATION_STATUSES.AUTHORIZED);
  assert.equal(authorized.implementationAuthorized, true);
  assert.equal(authorized.implementation.spec.auto_merge, false);
  assert.equal(authorized.implementation.mutatesSourceCode, false);
  assert.match(authorized.implementation.markdown, /Do not auto-merge/);
});

test("H) audit trail created for every action", async () => {
  const store = storeWithFixtures();
  const qualityCase = await store.getCase("qa-citizenship-repeat");
  const actorUserId = "auditor-1";
  const sequence = [
    LEARNING_ACTIONS.GENERATE_PROPOSAL,
    LEARNING_ACTIONS.REQUEST_REVISION,
    LEARNING_ACTIONS.GENERATE_PROPOSAL,
    LEARNING_ACTIONS.APPROVE_REGRESSION,
    LEARNING_ACTIONS.AUTHORIZE_IMPLEMENTATION,
    LEARNING_ACTIONS.MARK_IMPLEMENTED,
    LEARNING_ACTIONS.MARK_VERIFIED,
    LEARNING_ACTIONS.REOPEN
  ];
  for (const action of sequence) {
    await applyLearningAction({
      qualityCase: await store.getCase(qualityCase.id),
      action,
      actorUserId,
      store
    });
  }
  const rejectStore = storeWithFixtures();
  await applyLearningAction({
    qualityCase: await rejectStore.getCase("qa-state-first"),
    action: LEARNING_ACTIONS.GENERATE_PROPOSAL,
    actorUserId,
    store: rejectStore
  });
  await applyLearningAction({
    qualityCase: await rejectStore.getCase("qa-state-first"),
    action: LEARNING_ACTIONS.REJECT_PROPOSAL,
    actorUserId,
    store: rejectStore
  });
  assert.ok(store.learningActions.length >= sequence.length);
  assert.equal(store.learningActions.every((row) => row.actorUserId === actorUserId), true);
  assert.equal(store.learningActions.every((row) => row.createdAt), true);
  assert.ok(store.audits.some((row) => row.action === "ai_quality.proposal_generated"));
  assert.ok(store.audits.some((row) => row.action === "ai_quality.regression_approved"));
  assert.ok(store.audits.some((row) => row.action === "ai_quality.implementation_authorized"));
  assert.ok(store.audits.some((row) => row.action === "ai_quality.verified"));
  assert.ok(store.audits.some((row) => row.action === "ai_quality.reopened"));
  assert.ok(rejectStore.audits.some((row) => row.action === "ai_quality.proposal_rejected"));
});

test("I) tenant isolation enforced", async () => {
  const store = storeWithFixtures();
  const leaked = await applyLearningCaseAction({
    caseId: "qa-other-tenant",
    organizationId: SYNTHETIC_ORG,
    action: LEARNING_ACTIONS.GENERATE_PROPOSAL,
    actorUserId: "reviewer-1",
    store
  }).catch((error) => error);
  assert.equal(leaked.publicCode, "QUALITY_CASE_NOT_FOUND");
  const own = await applyLearningCaseAction({
    caseId: "qa-citizenship-repeat",
    organizationId: SYNTHETIC_ORG,
    action: LEARNING_ACTIONS.GENERATE_PROPOSAL,
    actorUserId: "reviewer-1",
    store
  });
  assert.equal(own.proposal.organizationId, SYNTHETIC_ORG);
  const otherCases = await store.listCases({ organizationId: OTHER_ORG });
  assert.equal(otherCases.every((row) => row.organizationId === OTHER_ORG), true);
  const otherProposals = await store.listProposals({ organizationId: OTHER_ORG });
  assert.equal(otherProposals.length, 0);
});

test("J) Learning & Improvements report aggregates lifecycle", async () => {
  const store = storeWithFixtures();
  await applyLearningAction({
    qualityCase: await store.getCase("qa-citizenship-repeat"),
    action: LEARNING_ACTIONS.GENERATE_PROPOSAL,
    actorUserId: "reviewer-1",
    store
  });
  await applyLearningAction({
    qualityCase: await store.getCase("qa-citizenship-repeat"),
    action: LEARNING_ACTIONS.APPROVE_REGRESSION,
    actorUserId: "reviewer-1",
    store
  });
  await applyLearningAction({
    qualityCase: await store.getCase("qa-citizenship-repeat"),
    action: LEARNING_ACTIONS.AUTHORIZE_IMPLEMENTATION,
    actorUserId: "reviewer-1",
    store
  });
  await applyLearningAction({
    qualityCase: await store.getCase("qa-citizenship-repeat"),
    action: LEARNING_ACTIONS.MARK_IMPLEMENTED,
    actorUserId: "reviewer-1",
    linkedPr: "https://github.com/TeamVisionAI/atlas-ai/pull/328",
    store
  });
  await applyLearningAction({
    qualityCase: await store.getCase("qa-citizenship-repeat"),
    action: LEARNING_ACTIONS.MARK_VERIFIED,
    actorUserId: "reviewer-1",
    store
  });
  await applyLearningAction({
    qualityCase: await store.getCase("qa-appointment-confirm-mismatch"),
    action: LEARNING_ACTIONS.GENERATE_PROPOSAL,
    actorUserId: "reviewer-1",
    store
  });
  const report = buildLearningReport({
    cases: await store.listCases({ organizationId: SYNTHETIC_ORG }),
    proposals: await store.listProposals({ organizationId: SYNTHETIC_ORG }),
    regressions: await store.listRegressions({ organizationId: SYNTHETIC_ORG }),
    implementations: await store.listImplementations({ organizationId: SYNTHETIC_ORG })
  });
  assert.ok(report.casesDetected >= 8);
  assert.equal(report.proposalsGenerated, 2);
  assert.ok(report.casesReviewed >= 1);
  assert.equal(report.regressionsApproved, 1);
  assert.equal(report.improvementsImplemented, 1);
  assert.equal(report.improvementsVerified, 1);
  const magner = report.rows.find((row) => row.signalType === SIGNAL_TYPES.REPEATED_QUESTION);
  assert.equal(magner.verificationStatus, IMPLEMENTATION_STATUSES.VERIFIED);
  assert.equal(magner.linkedPr.includes("pull/328"), true);
});

test("K/L) APPLY remains OFF and no source/test mutation before authorization", async () => {
  const store = storeWithFixtures();
  const interpreterPath = path.join(__dirname, "../core/recruitAiV2/semantic/semanticInterpreterConfig.js");
  const testPath = path.join(__dirname, "aiQualityLearningCenterBr175.test.js");
  const beforeInterpreter = fs.readFileSync(interpreterPath, "utf8");
  const beforeTest = fs.readFileSync(testPath, "utf8");
  const qualityCase = await store.getCase("qa-appointment-confirm-mismatch");
  const generated = await applyLearningAction({
    qualityCase,
    action: LEARNING_ACTIONS.GENERATE_PROPOSAL,
    actorUserId: "reviewer-1",
    store
  });
  const approved = await applyLearningAction({
    qualityCase: await store.getCase(qualityCase.id),
    action: LEARNING_ACTIONS.APPROVE_REGRESSION,
    actorUserId: "reviewer-1",
    store
  });
  const authorized = await applyLearningAction({
    qualityCase: await store.getCase(qualityCase.id),
    action: LEARNING_ACTIONS.AUTHORIZE_IMPLEMENTATION,
    actorUserId: "reviewer-1",
    store
  });
  assert.equal(generated.mutatedFiles.length, 0);
  assert.equal(approved.mutatesSourceCode, false);
  assert.equal(approved.mutatesTests, false);
  assert.equal(authorized.mutatesSourceCode, false);
  assert.equal(authorized.implementation.spec.mutates_source_code, false);
  assert.equal(fs.readFileSync(interpreterPath, "utf8"), beforeInterpreter);
  assert.equal(fs.readFileSync(testPath, "utf8"), beforeTest);
  assert.match(beforeInterpreter, /applyEnabled: false/);
});

test("Magner-style repeated-question proposal is review-safe", () => {
  const qualityCase = syntheticCases().find((row) => row.id === "qa-citizenship-repeat");
  const proposal = buildLearningProposal(qualityCase);
  assert.match(proposal.problem_summary, /already known/i);
  assert.match(proposal.expected_behavior, /next missing/i);
  assert.ok(proposal.forbidden_behavior.includes("re-ask the answered fact"));
  assert.equal(proposal.risk_level, RISK_LEVELS.LOW);
  assert.equal(proposal.requires_implementation_authorization, true);
});

test("appointment-confirmation mismatch is HIGH and stays unauthorized after approve", async () => {
  const store = storeWithFixtures();
  const qualityCase = await store.getCase("qa-appointment-confirm-mismatch");
  const proposal = buildLearningProposal(qualityCase);
  assert.equal(proposal.risk_level, RISK_LEVELS.HIGH);
  assert.match(proposal.problem_summary, /without a successful appointment create/i);
  await applyLearningAction({
    qualityCase,
    action: LEARNING_ACTIONS.GENERATE_PROPOSAL,
    actorUserId: "reviewer-1",
    store
  });
  const approved = await applyLearningAction({
    qualityCase: await store.getCase(qualityCase.id),
    action: LEARNING_ACTIONS.APPROVE_REGRESSION,
    actorUserId: "reviewer-1",
    store
  });
  assert.equal(approved.implementationAuthorized, false);
  assert.equal(approved.implementation.status, IMPLEMENTATION_STATUSES.PROPOSED);
});
