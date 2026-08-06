/**
 * Recruit AI v2 Workflow Simulator scenario pack.
 * Ephemeral only — no production table writes, no live providers.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  listRecruitAiV2Scenarios,
  runRecruitAiV2ScenarioById,
  runAllRecruitAiV2ScenarioPack,
  getRecruitAiV2GoldenSuiteMeta,
  RECRUIT_AI_V2_SCENARIOS
} = require("../dev/recruitAiV2ScenarioPack");
const {
  createEphemeralSession,
  runV2SimulatorTurn,
  assertSafeSimulatorIdentity,
  sanitizeInputText
} = require("../dev/recruitAiV2ScenarioRunner");
test("1. v2 scenario runner lists scenarios", () => {
  const listed = listRecruitAiV2Scenarios();
  assert.ok(listed.length >= 15);
  assert.ok(listed.some((s) => s.id === "first-production-failure"));
});

test("2. ephemeral context uses simulator prospect ids only", () => {
  const session = createEphemeralSession({
    prospectId: "sim-v2-unit",
    organizationId: "sim-org"
  });
  assert.equal(session.context.prospectId, "sim-v2-unit");
  assert.equal(session.writes.productionContextRows, 0);
});

test("3. rejects production-like prospect ids", () => {
  assert.throws(
    () =>
      assertSafeSimulatorIdentity({
        prospectId: "af02e5a9-bafd-442a-b333-346d099b8378",
        organizationId: "sim-org"
      }),
    /rejects non-simulator/
  );
});

test("4. no production context / shadow writes in reports", () => {
  const report = runRecruitAiV2ScenarioById("first-production-failure");
  assert.equal(report.ephemeral, true);
  assert.equal(report.summary.productionWrites.productionContextRows, 0);
  assert.equal(report.summary.productionWrites.shadowEvaluationRows, 0);
  for (const turn of report.turns) {
    assert.equal(turn.persistence.productionContextRows, 0);
    assert.equal(turn.persistence.shadowEvaluationRows, 0);
    assert.equal(turn.persistence.attempted, false);
  }
});

test("5. no WhatsApp send", () => {
  const report = runRecruitAiV2ScenarioById("time-counteroffers");
  for (const turn of report.turns) {
    assert.equal(turn.execution.whatsapp, false);
    assert.equal(turn.authorizationResult, "denied");
  }
});

test("6. no appointment write", () => {
  const report = runRecruitAiV2ScenarioById("time-counteroffers");
  for (const turn of report.turns) {
    assert.equal(turn.execution.appointment, false);
    assert.equal(turn.actual.authorizationAuthorized, false);
  }
});

test("7. no Calendar write", () => {
  const report = runRecruitAiV2ScenarioById("reschedule-after-confirmation");
  for (const turn of report.turns) {
    assert.equal(turn.execution.calendar, false);
  }
});

test("8. no BR-080 mutation", () => {
  const report = runRecruitAiV2ScenarioById("repeated-ambiguity-human");
  for (const turn of report.turns) {
    assert.equal(turn.execution.br080, false);
  }
});

test("9. first production failure scenario", () => {
  const report = runRecruitAiV2ScenarioById("first-production-failure");
  assert.equal(report.pass, true);
  assert.equal(report.turns[0].interpretedIntent, "greeting");
  assert.equal(report.turns[1].actual.city, "Miami");
  assert.equal(report.turns[1].actual.state, null);
  assert.notEqual(report.turns[2].interpretedIntent, "provide_name");
  assert.equal(report.turns[3].actual.state, "FL");
});

test("10. counteroffer scenario", () => {
  const report = runRecruitAiV2ScenarioById("time-counteroffers");
  assert.equal(report.pass, true);
  assert.equal(report.turns[0].interpretedIntent, "scheduling_counteroffer");
  assert.equal(report.turns[2].interpretedIntent, "schedule_confirm");
  assert.equal(report.turns[2].actual.authorizationAuthorized, false);
});

test("11. reschedule scenario", () => {
  const report = runRecruitAiV2ScenarioById("reschedule-after-confirmation");
  assert.equal(report.pass, true);
  assert.equal(report.turns[0].interpretedIntent, "reschedule_request");
});

test("12. language adaptation", () => {
  const report = runRecruitAiV2ScenarioById("language-switch");
  assert.equal(report.pass, true);
  assert.equal(report.turns[0].preferredLanguage, "spanish");
});

test("13. explicit language preference", () => {
  const report = runRecruitAiV2ScenarioById("language-explicit-english");
  assert.equal(report.pass, true);
  assert.equal(report.turns[0].preferredLanguage, "english");
});

test("14. fragment recovery", () => {
  const report = runRecruitAiV2ScenarioById("typo-fragment-recovery");
  assert.equal(report.pass, true);
  for (const turn of report.turns) {
    assert.notEqual(turn.interpretedIntent, "provide_name");
  }
});

test("15. repeated ambiguity escalation", () => {
  const report = runRecruitAiV2ScenarioById("repeated-ambiguity-human");
  assert.equal(report.pass, true);
  assert.equal(report.turns[0].actual.shouldEscalate, true);
});

test("16. partial location", () => {
  const report = runRecruitAiV2ScenarioById("partial-location");
  assert.equal(report.pass, true);
  assert.equal(report.turns[0].actual.state, null);
  assert.equal(report.turns[3].actual.state, "FL");
});

test("17. duplicate message idempotency", () => {
  const report = runRecruitAiV2ScenarioById("duplicate-message-idempotency");
  assert.equal(report.pass, true);
  assert.equal(report.turns[0].contextAdvanced, true);
  assert.equal(report.turns[1].idempotent, true);
  assert.equal(report.turns[1].contextAdvanced, false);
});

test("18. Zoom preference", () => {
  const report = runRecruitAiV2ScenarioById("zoom-preference");
  assert.equal(report.pass, true);
  assert.equal(report.turns[0].actual.meetingType, "zoom");
});

test("19. in-person preference", () => {
  const report = runRecruitAiV2ScenarioById("in-person-preference");
  assert.equal(report.pass, true);
  assert.equal(report.turns[0].actual.meetingType, "in_person");
});

test("20. full golden v2 suite", () => {
  const suite = runAllRecruitAiV2ScenarioPack();
  assert.equal(suite.total, RECRUIT_AI_V2_SCENARIOS.length);
  assert.equal(suite.failed, 0);
  assert.equal(suite.passed, suite.total);
  const meta = getRecruitAiV2GoldenSuiteMeta();
  assert.equal(meta.count, suite.total);
});

test("21. existing Workflow Simulator goldens remain separate from v2 pack", () => {
  // V2 pack must not reuse workflow golden numeric ids 01-10.
  const v2Ids = new Set(RECRUIT_AI_V2_SCENARIOS.map((s) => s.id));
  for (const id of ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"]) {
    assert.equal(v2Ids.has(id), false);
  }
  assert.ok(v2Ids.has("first-production-failure"));
});

test("22. rejects phone-like inbound text", () => {
  assert.throws(() => sanitizeInputText("call me at +17865551212"), /phone-like/);
});

test("23. side-effect authorizer always denied in turn runner", () => {
  const session = createEphemeralSession({
    prospectId: "sim-v2-deny",
    organizationId: "sim-org"
  });
  const turn = runV2SimulatorTurn(session, {
    id: "x",
    text: "Hello",
    inboundMessageId: "sim-wamid.deny.1"
  });
  assert.equal(turn.authorizationResult, "denied");
  assert.equal(turn.actual.authorizationAuthorized, false);
});

test("24. cancel appointment remains proposal-only", () => {
  const report = runRecruitAiV2ScenarioById("cancel-appointment");
  assert.equal(report.pass, true);
  assert.equal(report.turns[0].interpretedIntent, "cancel_request");
  assert.equal(report.summary.sideEffectsDenied, true);
});
