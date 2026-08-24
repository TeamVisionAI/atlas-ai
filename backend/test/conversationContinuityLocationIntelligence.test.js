/**
 * Conversation continuity + Florida location intelligence fix tests.
 */

"use strict";

require("dotenv").config({ quiet: true });

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseLocationAnswer,
  isHighConfidenceFloridaCity,
  buildHighConfidenceFloridaLocation
} = require("../core/recruitAiV2/locationFacts");
const {
  inferPendingQuestionFromHumanText,
  findUnresolvedProspectTurn,
  combineBurstFragments
} = require("../core/conversationsCenter/returnToAtlasResumeService");
const {
  scheduleInboundBurstAggregation,
  resetInboundBurstAggregationForTests
} = require("../core/whatsappInboundBurstAggregator");
const {
  interpretInboundMessage,
  createConversationContext,
  INTENTS
} = require("../core/recruitAiV2");
const { parseWorkAuthorizationAnswer } = require("../core/recruitAiV2/qualificationFacts");

const FL_CITIES = [
  ["Miami", "Miami"],
  ["Kendall", "Kendall"],
  ["Miramar", "Miramar"],
  ["Homestead", "Homestead"],
  ["Cutler Bay", "Cutler Bay"],
  ["Miami Beach", "Miami Beach"],
  ["North Miami Beach", "North Miami Beach"],
  ["West Palm Beach", "West Palm Beach"],
  ["WPB", "West Palm Beach"],
  ["Doral", "Doral"],
  ["Orlando", "Orlando"],
  ["Kissimmee", "Kissimmee"],
  ["Tampa", "Tampa"],
  ["Ft Lauderdale", "Ft Lauderdale"],
  ["Fort Lauderdale", "Fort Lauderdale"],
  ["Fort Myers", "Fort Myers"]
];

for (const [input, expectedCity] of FL_CITIES) {
  test(`location: ${input} → ${expectedCity}, FL silently`, () => {
    const parsed = parseLocationAnswer(input);
    assert.equal(parsed?.completeness, "complete", input);
    assert.equal(parsed?.state, "FL", input);
    assert.equal(parsed?.requiresClarification, false, input);
    assert.ok(isHighConfidenceFloridaCity(input), input);
  });
}

test("location: Springfield remains ambiguous (asks state)", () => {
  const parsed = parseLocationAnswer("Springfield");
  assert.equal(parsed?.completeness, "partial");
  assert.equal(parsed?.proposedState, null);
  assert.equal(parsed?.requiresClarification, true);
});

test("location: persisted Miami context does not re-ask state on follow-up", () => {
  const ctx = createConversationContext({
    preferredLanguage: "spanish",
    knownFacts: { city: "Miami", state: "FL" },
    conversation: { lastQuestionAsked: "ask_authorization" }
  });
  const interpretation = interpretInboundMessage({
    message: { text: "Sí" },
    context: ctx
  });
  assert.notEqual(interpretation.intent, INTENTS.PROVIDE_LOCATION);
});

test("resume: infers ask_authorization from human work-permit question", () => {
  assert.equal(
    inferPendingQuestionFromHumanText(
      "¿Tienes permiso de trabajo o documentación legal vigente para trabajar en EEUU?"
    ),
    "ask_authorization"
  );
});

test("resume: finds unresolved prospect reply after human outbound", () => {
  const logs = [
    {
      id: "1",
      direction: "outbound",
      pipeline: "HUMAN",
      intent: "HUMAN_COMPOSER_REPLY",
      message: "¿Tienes permiso de trabajo?",
      created_at: "2026-01-01T10:00:00.000Z"
    },
    {
      id: "2",
      direction: "incoming",
      message: "Sí",
      created_at: "2026-01-01T10:01:00.000Z"
    }
  ];
  const unresolved = findUnresolvedProspectTurn(logs, "2026-01-01T09:59:00.000Z");
  assert.equal(unresolved.combinedText, "Sí");
  assert.equal(unresolved.pendingQuestion, "ask_authorization");
});

test("resume: no unresolved inbound when Atlas already replied", () => {
  const logs = [
    {
      id: "1",
      direction: "incoming",
      message: "Hola",
      created_at: "2026-01-01T10:00:00.000Z"
    },
    {
      id: "2",
      direction: "outbound",
      pipeline: "ATLAS",
      intent: "WHATSAPP_OUTBOUND",
      message: "Gracias",
      created_at: "2026-01-01T10:01:00.000Z"
    }
  ];
  assert.equal(findUnresolvedProspectTurn(logs, null), null);
});

test("resume: work auth yes with resumePendingQuestion context", () => {
  const status = parseWorkAuthorizationAnswer("Sí", {
    conversation: { resumePendingQuestion: "ask_authorization" }
  });
  assert.equal(status, "authorized");
});

test("disengagement: No dejemos así gracias", () => {
  const interpretation = interpretInboundMessage({
    message: { text: "No dejemos así gracias" },
    context: createConversationContext({ preferredLanguage: "spanish" })
  });
  assert.equal(interpretation.intent, INTENTS.WITHDRAW_INTEREST);
});

test("burst: combines rapid short fragments", async () => {
  resetInboundBurstAggregationForTests();
  const phone = "+15550001111";
  const p1 = scheduleInboundBurstAggregation({
    phone,
    text: "Miami",
    inbound: { providerMessageId: "wamid.1", phone }
  });
  const p2 = scheduleInboundBurstAggregation({
    phone,
    text: "Todo",
    inbound: { providerMessageId: "wamid.2", phone }
  });
  const [r1, r2] = await Promise.all([p1, p2]);
  assert.equal(r1.combinedText, "Miami Todo");
  assert.equal(r2.combinedText, "Miami Todo");
  assert.equal(r1.burst, true);
  assert.equal(r1.anchorProviderMessageId, "wamid.2");
});

test("burst: combineBurstFragments helper", () => {
  const combined = combineBurstFragments([
    { message: "Miami", created_at: "2026-01-01T10:00:00.000Z", id: "a" },
    { message: "Todo", created_at: "2026-01-01T10:00:01.000Z", id: "b" }
  ]);
  assert.equal(combined.combinedText, "Miami Todo");
});

test("location: buildHighConfidenceFloridaLocation canonicalizes WPB", () => {
  const loc = buildHighConfidenceFloridaLocation("WPB");
  assert.equal(loc.state, "FL");
  assert.equal(loc.completeness, "complete");
});
