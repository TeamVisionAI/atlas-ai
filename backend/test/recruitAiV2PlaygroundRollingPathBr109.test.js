/**
 * BR-109 — Actual Ops Playground path must invoke BR-108 rolling offers
 * (not legacy ask-time / "anoto" copy) when a time constraint has no date.
 */

const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const { DEFAULT_ORGANIZATION_ID } = require("../modules/prospects/domain/constants");
const {
  createPlaygroundSessionAsync,
  sendPlaygroundTurnAsync,
  resolvePlaygroundReadAgent,
  _resetPlaygroundStoreForTests
} = require("../dev/recruitAiV2CustomPlayground");
const {
  startRecruitAiV2PlaygroundSession,
  sendRecruitAiV2PlaygroundTurn
} = require("../dev/operationsCenterService");
const { processRecruitAiV2TurnSync } = require("../core/recruitAiV2/orchestrator");
const { createConversationContext } = require("../core/recruitAiV2/conversationContext");
const { authorizeSideEffects, isExecutionEnabled } = require("../core/recruitAiV2/sideEffectAuthorizer");

const LATE_FRIDAY = new Date("2026-08-07T23:00:00.000-04:00");
const FIXTURE_SLOTS = {
  timezone: "America/New_York",
  slots: [
    { dateKey: "2026-08-08", timeKey: "17:30" },
    { dateKey: "2026-08-08", timeKey: "20:00" }
  ]
};

beforeEach(() => {
  _resetPlaygroundStoreForTests();
});

function assertNoAnoto(text) {
  assert.doesNotMatch(
    String(text || ""),
    /anoto que puedes|anoto tu disponibilidad|Entendido — anoto|Perfecto, anoto|I've noted your|noted that you're available/i
  );
}

test("Ops playground route helper is async + liveAvailabilityRead", async () => {
  const session = await startRecruitAiV2PlaygroundSession({
    initialLanguage: "spanish",
    organizationId: DEFAULT_ORGANIZATION_ID,
    agentId: "agent-fixture-br109",
    availabilityFixture: FIXTURE_SLOTS,
    testNow: LATE_FRIDAY,
    liveAvailabilityRead: true
  });
  assert.equal(session.playground, true);
  assert.ok(session.sessionId.startsWith("sim-v2-playground-"));
});

test("exact Playground path: despues de las 5 → offer_available_slots + Tengo disponible", async () => {
  const session = await createPlaygroundSessionAsync({
    initialLanguage: "spanish",
    organizationId: DEFAULT_ORGANIZATION_ID,
    agentId: "agent-fixture-br109",
    availabilityFixture: FIXTURE_SLOTS,
    testNow: LATE_FRIDAY,
    liveAvailabilityRead: true
  });

  // Seed through the same async turn entry the UI uses.
  await sendPlaygroundTurnAsync(session.sessionId, { text: "Hola" });
  await sendPlaygroundTurnAsync(session.sessionId, { text: "Miami" });
  await sendPlaygroundTurnAsync(session.sessionId, { text: "Florida" });
  await sendPlaygroundTurnAsync(session.sessionId, { text: "si" });
  const result = await sendPlaygroundTurnAsync(session.sessionId, {
    text: "despues de las 5"
  });

  const reply = result.turn?.atlasProposedReply || "";
  const nextAction = result.turn?.diagnostics?.decisionCode;
  assert.equal(nextAction, "offer_available_slots");
  assert.match(reply, /^Tengo disponible/i);
  assert.doesNotMatch(reply, /Qué hora después de las 5|Qué día/i);
  assertNoAnoto(reply);
  assert.equal(result.sideEffectsDenied, true);
  assert.deepEqual(result.writes, {
    productionContextRows: 0,
    shadowEvaluationRows: 0,
    whatsappSends: 0,
    appointmentWrites: 0,
    calendarWrites: 0,
    br080Mutations: 0
  });
});

test("operationsCenterService send path matches offer behavior", async () => {
  const session = await startRecruitAiV2PlaygroundSession({
    initialLanguage: "spanish",
    organizationId: DEFAULT_ORGANIZATION_ID,
    agentId: "agent-ops-br109",
    availabilityFixture: FIXTURE_SLOTS,
    testNow: LATE_FRIDAY
  });
  await sendRecruitAiV2PlaygroundTurn(session.sessionId, { text: "Hola" });
  await sendRecruitAiV2PlaygroundTurn(session.sessionId, { text: "Miami" });
  await sendRecruitAiV2PlaygroundTurn(session.sessionId, { text: "Florida" });
  await sendRecruitAiV2PlaygroundTurn(session.sessionId, { text: "si" });
  const result = await sendRecruitAiV2PlaygroundTurn(session.sessionId, {
    text: "despues de las 5"
  });
  assert.equal(result.turn?.diagnostics?.decisionCode, "offer_available_slots");
  assert.match(result.turn?.atlasProposedReply || "", /^Tengo disponible/i);
  assertNoAnoto(result.turn?.atlasProposedReply);
});

test("copy: acknowledge fallback has no anoto for despues / a partir", () => {
  for (const text of ["despues de las 5", "a partir de las 5"]) {
    const ctx = createConversationContext({
      preferredLanguage: "spanish",
      currentStage: "scheduling",
      organizationId: DEFAULT_ORGANIZATION_ID,
      timezone: "America/New_York",
      knownFacts: {
        city: "Miami",
        state: "FL",
        workAuthorization: true,
        preferredDayPart: "afternoon"
      },
      appointment: { status: "proposed", proposedDate: null },
      conversation: { lastQuestionAsked: "ask_time_preference" }
    });
    // Force unread path (no agent / no fixture) — fallback clarification only.
    const r = processRecruitAiV2TurnSync({
      message: { text },
      context: ctx,
      options: { flexible: true, skipOrgDefaultLookup: true }
    });
    assertNoAnoto(r.rendered?.text);
    assert.doesNotMatch(r.rendered?.text || "", /anoto/i);
    assert.match(r.rendered?.text || "", /hora|horario/i);
  }
});

test("copy: por la mañana / solo puedo después del trabajo never use anoto", () => {
  for (const text of ["por la mañana", "solo puedo después del trabajo"]) {
    const ctx = createConversationContext({
      preferredLanguage: "spanish",
      currentStage: "scheduling",
      organizationId: DEFAULT_ORGANIZATION_ID,
      timezone: "America/New_York",
      knownFacts: {
        city: "Miami",
        state: "FL",
        workAuthorization: true
      },
      appointment: { status: "proposed", proposedDate: null },
      conversation: { lastQuestionAsked: "ask_time_preference" }
    });
    const r = processRecruitAiV2TurnSync({
      message: { text },
      context: ctx,
      options: { flexible: true, skipOrgDefaultLookup: true }
    });
    assertNoAnoto(r.rendered?.text);
  }
});

test("playground read-agent resolution: sim-org stays unresolved; explicit agent wins", async () => {
  const unresolved = await resolvePlaygroundReadAgent({
    organizationId: "sim-org-team-vision"
  });
  assert.equal(unresolved.agentId, null);

  const explicit = await resolvePlaygroundReadAgent({
    organizationId: DEFAULT_ORGANIZATION_ID,
    agentId: "agent-explicit"
  });
  assert.equal(explicit.agentId, "agent-explicit");
  assert.equal(explicit.source, "assigned_owner");
});

test("no-write + execution OFF posture", async () => {
  assert.equal(isExecutionEnabled({}), false);
  const session = await createPlaygroundSessionAsync({
    initialLanguage: "spanish",
    organizationId: DEFAULT_ORGANIZATION_ID,
    agentId: "agent-fixture-br109",
    availabilityFixture: FIXTURE_SLOTS,
    testNow: LATE_FRIDAY
  });
  const result = await sendPlaygroundTurnAsync(session.sessionId, {
    text: "despues de las 5"
  });
  const auth = authorizeSideEffects({
    structuredDecision: {
      decision: {
        nextAction: result.turn?.diagnostics?.decisionCode,
        mayCreateAppointment: false
      },
      reasonCodes: result.turn?.diagnostics?.safeReasonCodes || []
    },
    responsePlan: { templateKey: result.turn?.diagnostics?.decisionCode },
    env: { RECRUIT_AI_V2_EXECUTION_ENABLED: "false" }
  });
  assert.equal(auth.authorized, false);
  assert.equal(result.writes.appointmentWrites, 0);
  assert.equal(result.writes.calendarWrites, 0);
  assert.equal(result.writes.whatsappSends, 0);
  assert.equal(result.writes.br080Mutations, 0);
});
