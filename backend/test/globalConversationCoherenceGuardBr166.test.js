"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  REASONS,
  evaluateAgainstLatestContext,
  asksAlreadyResolvedFact
} = require("../core/recruitAiV2/globalConversationCoherenceGuard");

function v2EngineResult({ version = 5, question = "ask_authorization" } = {}) {
  return {
    source: "recruit_ai_v2_live_authoring",
    owner: "v2",
    nextAction: "clarify_once",
    v2Result: {
      nextContext: {
        prospectId: "11111111-1111-4111-8111-111111111111",
        knownFacts: {},
        conversation: { lastQuestionAsked: question },
        _persistence: { contextVersion: version }
      },
      responsePlan: { templateKey: question },
      persistence: { result: { contextVersion: version } }
    }
  };
}

function latestContext({
  version = 5,
  messageId = "wamid-current",
  facts = {},
  question = null,
  appointment = {}
} = {}) {
  return {
    knownFacts: facts,
    appointment,
    conversation: { lastQuestionAsked: question },
    _persistence: {
      contextVersion: version,
      lastProcessedMessageId: messageId
    }
  };
}

test("BR-166 is tenant/user agnostic: non-v2 path is untouched", () => {
  const result = evaluateAgainstLatestContext({
    engineResult: { source: "legacy_ce" },
    latestContext: latestContext()
  });
  assert.equal(result.allowed, true);
  assert.equal(result.reason, REASONS.NOT_V2);
});

test("newer durable context suppresses an older authored reply", () => {
  const result = evaluateAgainstLatestContext({
    engineResult: v2EngineResult({ version: 7, question: "ask_authorization" }),
    latestContext: latestContext({
      version: 8,
      messageId: "wamid-newer",
      facts: {
        city: "Orlando",
        state: "FL",
        workAuthorization: true,
        workAuthorizationStatus: "authorized"
      }
    }),
    currentInboundMessageId: "wamid-older"
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reason, REASONS.STALE_OUTBOUND);
  assert.equal(result.authoredVersion, 7);
  assert.equal(result.latestVersion, 8);
});

test("confirmed Orlando FL cannot be re-asked as location/state", () => {
  const facts = {
    city: "Orlando",
    state: "FL",
    cityCertainty: "confirmed",
    stateCertainty: "confirmed"
  };

  assert.equal(asksAlreadyResolvedFact("ask_location", { knownFacts: facts }), true);
  assert.equal(asksAlreadyResolvedFact("ask_city", { knownFacts: facts }), true);
  assert.equal(asksAlreadyResolvedFact("ask_state", { knownFacts: facts }), true);

  const result = evaluateAgainstLatestContext({
    engineResult: v2EngineResult({ version: 9, question: "ask_state" }),
    latestContext: latestContext({ version: 9, facts }),
    currentInboundMessageId: "wamid-current"
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reason, REASONS.RESOLVED_FACT_REASK);
});

test("resolved authorization cannot be asked again", () => {
  const result = evaluateAgainstLatestContext({
    engineResult: v2EngineResult({ version: 4, question: "ask_authorization" }),
    latestContext: latestContext({
      version: 4,
      facts: {
        city: "Miami",
        state: "FL",
        workAuthorization: true,
        workAuthorizationStatus: "authorized"
      }
    }),
    currentInboundMessageId: "wamid-current"
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reason, REASONS.RESOLVED_FACT_REASK);
});

test("resolved daypart cannot regress to daypart question", () => {
  const result = evaluateAgainstLatestContext({
    engineResult: v2EngineResult({ version: 12, question: "ask_day_part" }),
    latestContext: latestContext({
      version: 12,
      facts: {
        city: "Miami",
        state: "FL",
        workAuthorization: true,
        workAuthorizationStatus: "authorized",
        preferredDayPart: "afternoon"
      }
    }),
    currentInboundMessageId: "wamid-current"
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reason, REASONS.RESOLVED_FACT_REASK);
});

test("forward-moving unresolved question is allowed", () => {
  const result = evaluateAgainstLatestContext({
    engineResult: v2EngineResult({ version: 15, question: "ask_day_part" }),
    latestContext: latestContext({
      version: 15,
      facts: {
        city: "Orlando",
        state: "FL",
        workAuthorization: true,
        workAuthorizationStatus: "authorized",
        preferredDayPart: null
      }
    }),
    currentInboundMessageId: "wamid-current"
  });

  assert.equal(result.allowed, true);
  assert.equal(result.reason, REASONS.OK);
});

test("known exact time prevents a time-preference re-ask", () => {
  const result = evaluateAgainstLatestContext({
    engineResult: v2EngineResult({ version: 20, question: "ask_time_preference" }),
    latestContext: latestContext({
      version: 20,
      facts: {
        city: "Miami",
        state: "FL",
        workAuthorization: true,
        workAuthorizationStatus: "authorized",
        preferredDayPart: "afternoon"
      },
      appointment: { proposedTime: "15:00" }
    }),
    currentInboundMessageId: "wamid-current"
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reason, REASONS.RESOLVED_FACT_REASK);
});
