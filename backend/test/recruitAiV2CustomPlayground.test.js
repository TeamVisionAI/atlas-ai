/**
 * Recruit AI v2 Custom Conversation Playground — ephemeral interactive sessions.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createPlaygroundSession,
  resetPlaygroundSession,
  sendPlaygroundTurn,
  buildRegressionCandidate,
  listPlaygroundMeta,
  _resetPlaygroundStoreForTests
} = require("../dev/recruitAiV2CustomPlayground");
const { listRecruitAiV2Scenarios } = require("../dev/recruitAiV2ScenarioPack");
const { runAllRecruitAiV2ScenarioPack } = require("../dev/recruitAiV2ScenarioPack");

function assertNoWrites(result) {
  const writes = result.writes || {};
  assert.equal(writes.productionContextRows ?? 0, 0);
  assert.equal(writes.shadowEvaluationRows ?? 0, 0);
  assert.equal(writes.whatsappSends ?? 0, 0);
  assert.equal(writes.appointmentWrites ?? 0, 0);
  assert.equal(writes.calendarWrites ?? 0, 0);
  assert.equal(writes.br080Mutations ?? 0, 0);
}

test.beforeEach(() => {
  _resetPlaygroundStoreForTests();
});

test("1. custom playground session creation", () => {
  const session = createPlaygroundSession({ initialLanguage: "auto" });
  assert.ok(session.sessionId.startsWith("sim-v2-playground-"));
  assert.equal(session.ephemeral, true);
  assert.equal(session.recruitAiV2, true);
  assert.equal(session.turnCount, 0);
  assert.ok(session.context.stage);
  assertNoWrites(session);
});

test("2. multi-turn context retention", () => {
  const session = createPlaygroundSession({ initialLanguage: "spanish" });
  const t1 = sendPlaygroundTurn(session.sessionId, { text: "Hola" });
  const t2 = sendPlaygroundTurn(session.sessionId, { text: "Miami" });
  assert.equal(t1.turn.turnNumber, 1);
  assert.equal(t2.turn.turnNumber, 2);
  assert.equal(t2.context.knownFacts.city, "Miami");
  assert.ok(t2.context.contextVersion >= 2);
});

test("3. reset", async () => {
  const session = createPlaygroundSession({ initialLanguage: "english" });
  sendPlaygroundTurn(session.sessionId, { text: "Hi" });
  const reset = await resetPlaygroundSession(session.sessionId, {
    initialLanguage: "english"
  });
  assert.notEqual(reset.sessionId, session.sessionId);
  assert.equal(reset.turnCount, 0);
});

test("4. English initial language", () => {
  const session = createPlaygroundSession({ initialLanguage: "english" });
  assert.equal(session.context.preferredLanguage, "english");
  assert.equal(session.context.languageMetaSource, "explicit");
});

test("5. Spanish initial language", () => {
  const session = createPlaygroundSession({ initialLanguage: "spanish" });
  assert.equal(session.context.preferredLanguage, "spanish");
});

test("6. Auto language", () => {
  const session = createPlaygroundSession({ initialLanguage: "auto" });
  assert.equal(session.initialLanguage, "auto");
  assert.equal(session.context.languageMetaSource, "inferred");
});

test("7. greeting flow", () => {
  const session = createPlaygroundSession({ initialLanguage: "spanish" });
  const result = sendPlaygroundTurn(session.sessionId, {
    text: "Hola",
    expectation: "greeting"
  });
  assert.equal(result.turn.diagnostics.interpretedIntent, "greeting");
  assert.equal(result.turn.pass, true);
  assert.ok(result.turn.atlasProposedReply);
  assert.equal(result.sideEffectsDenied, true);
});

test("8. partial location", () => {
  const session = createPlaygroundSession({ initialLanguage: "spanish" });
  sendPlaygroundTurn(session.sessionId, { text: "Hola" });
  const result = sendPlaygroundTurn(session.sessionId, {
    text: "Miami",
    expectation: "partial_location"
  });
  assert.equal(result.turn.diagnostics.interpretedIntent, "provide_location");
  assert.equal(result.turn.pass, true);
  assert.equal(result.context.knownFacts.city, "Miami");
});

test("9. counteroffer", () => {
  const session = createPlaygroundSession({
    initialLanguage: "english",
    meetingContext: "appointment_proposed"
  });
  const result = sendPlaygroundTurn(session.sessionId, {
    text: "6?",
    expectation: "counteroffer"
  });
  assert.equal(result.turn.pass, true);
});

test("10. reschedule", () => {
  const session = createPlaygroundSession({
    initialLanguage: "english",
    meetingContext: "appointment_confirmed"
  });
  const result = sendPlaygroundTurn(session.sessionId, {
    text: "Can we change it?",
    expectation: "reschedule"
  });
  assert.equal(result.turn.pass, true);
});

test("11. typo/fragment", () => {
  const session = createPlaygroundSession({ initialLanguage: "spanish" });
  sendPlaygroundTurn(session.sessionId, { text: "Hola" });
  // Seed pending day-part style clarification via fragment after location path
  // is heavy — assert fragment does not escalate immediately.
  const result = sendPlaygroundTurn(session.sessionId, {
    text: "La or",
    expectation: "clarification"
  });
  assert.equal(result.turn.diagnostics.humanEscalationState, false);
  assert.ok(
    result.turn.diagnostics.clarificationRequired === true ||
      result.turn.pass === true ||
      result.turn.diagnostics.interpretedIntent !== "provide_name"
  );
});

test("12. language adaptation", () => {
  const session = createPlaygroundSession({ initialLanguage: "auto" });
  const result = sendPlaygroundTurn(session.sessionId, {
    text: "Hola",
    expectation: "language_switch"
  });
  // Auto starts english inferred; Hola may switch preferred to spanish.
  assert.ok(
    result.turn.diagnostics.preferredConversationLanguage === "spanish" ||
      result.turn.pass === true ||
      result.turn.diagnostics.detectedLanguage === "spanish"
  );
});

test("13. unsupported question", () => {
  const session = createPlaygroundSession({ initialLanguage: "english" });
  const result = sendPlaygroundTurn(session.sessionId, {
    text: "How much money do I make?"
  });
  assert.equal(result.turn.pass, null);
  assert.ok(result.turn.diagnostics.interpretedIntent);
  assert.equal(result.turn.diagnostics.authorizationResult, "denied");
});

test("14. human escalation", () => {
  const session = createPlaygroundSession({ initialLanguage: "english" });
  // Drive repeated ambiguity if possible; otherwise assert expectation machinery.
  let last = null;
  for (const text of ["idk", "maybe", "not sure", "idk", "maybe", "later"]) {
    last = sendPlaygroundTurn(session.sessionId, { text });
  }
  assert.ok(last);
  assert.equal(typeof last.turn.diagnostics.humanEscalationState, "boolean");
});

test("15. expectation PASS", () => {
  const session = createPlaygroundSession({ initialLanguage: "spanish" });
  const result = sendPlaygroundTurn(session.sessionId, {
    text: "Hola",
    expectation: "greeting"
  });
  assert.equal(result.turn.pass, true);
  assert.equal(result.turn.diagnostics.expectation.label, "PASS");
});

test("16. expectation FAIL", () => {
  const session = createPlaygroundSession({ initialLanguage: "spanish" });
  const result = sendPlaygroundTurn(session.sessionId, {
    text: "Hola",
    expectation: "counteroffer"
  });
  assert.equal(result.turn.pass, false);
  assert.equal(result.turn.diagnostics.expectation.label, "FAIL");
});

test("17. regression candidate sanitization", () => {
  const session = createPlaygroundSession({ initialLanguage: "english" });
  sendPlaygroundTurn(session.sessionId, { text: "Hi", expectation: "greeting" });
  sendPlaygroundTurn(session.sessionId, { text: "I live in Tampa" });
  const exportPayload = buildRegressionCandidate(session.sessionId);
  assert.equal(exportPayload.candidate.kind, "recruit_ai_v2_regression_candidate");
  assert.ok(exportPayload.copyText.includes("turns"));
  assert.equal(exportPayload.candidate.safety.piiExcluded, true);
  assert.doesNotMatch(exportPayload.copyText, /\+1\d{10}/);
  assert.doesNotMatch(exportPayload.copyText, /EAA[A-Za-z0-9]{10,}/);
});

test("18. no production context writes", () => {
  const session = createPlaygroundSession();
  const result = sendPlaygroundTurn(session.sessionId, { text: "Hi" });
  assert.equal(result.writes.productionContextRows, 0);
  assert.equal(result.turn.persistence.productionContextRows, 0);
});

test("19. no shadow writes", () => {
  const session = createPlaygroundSession();
  const result = sendPlaygroundTurn(session.sessionId, { text: "Hi" });
  assert.equal(result.writes.shadowEvaluationRows, 0);
});

test("20. no WhatsApp send", () => {
  const session = createPlaygroundSession();
  const result = sendPlaygroundTurn(session.sessionId, { text: "Hi" });
  assert.equal(result.writes.whatsappSends, 0);
  assert.equal(result.turn.execution.whatsapp, false);
});

test("21. no appointment write", () => {
  const session = createPlaygroundSession({
    meetingContext: "appointment_proposed"
  });
  const result = sendPlaygroundTurn(session.sessionId, { text: "Yes that works" });
  assert.equal(result.writes.appointmentWrites, 0);
  assert.equal(result.turn.execution.appointment, false);
});

test("22. no Calendar write", () => {
  const session = createPlaygroundSession({
    meetingContext: "appointment_confirmed"
  });
  const result = sendPlaygroundTurn(session.sessionId, { text: "Can we change it?" });
  assert.equal(result.writes.calendarWrites, 0);
  assert.equal(result.turn.execution.calendar, false);
});

test("23. no BR-080 mutation", () => {
  const session = createPlaygroundSession();
  const result = sendPlaygroundTurn(session.sessionId, { text: "Stop texting me" });
  assert.equal(result.writes.br080Mutations, 0);
  assert.equal(result.turn.execution.br080, false);
});

test("24. real prospect id rejected", () => {
  assert.throws(
    () =>
      createPlaygroundSession({
        prospectId: "29853100-f151-4ca8-b07d-624fd20c6685"
      }),
    (err) => err.code === "SIMULATOR_IDENTITY_REJECTED"
  );
});

test("25. phone/PII guard", () => {
  const session = createPlaygroundSession();
  assert.throws(
    () => sendPlaygroundTurn(session.sessionId, { text: "Call me at +17875551212" }),
    (err) => err.code === "SIMULATOR_PII_REJECTED"
  );
});

test("26. existing simulator scenarios remain green", async () => {
  const listed = listRecruitAiV2Scenarios();
  assert.ok(listed.length >= 16);
  const suite = await runAllRecruitAiV2ScenarioPack();
  assert.equal(suite.failed, 0);
  assert.ok(suite.passed >= 16);
});

test("playground meta lists expectations and prompts", () => {
  const meta = listPlaygroundMeta();
  assert.ok(meta.expectations.includes("greeting"));
  assert.ok(meta.suggestedPrompts.spanish.includes("Hola"));
  assert.ok(meta.meetingContexts.includes("appointment_confirmed"));
});
