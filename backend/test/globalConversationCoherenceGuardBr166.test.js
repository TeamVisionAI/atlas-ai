"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  REASONS,
  evaluateAgainstLatestContext,
  asksAlreadyResolvedFact,
  guardOutboundConversationCoherence
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

test("async guard loads latest state under explicit tenant+prospect scope", async () => {
  const calls = [];
  const persistenceService = {
    async loadContext(args) {
      calls.push(args);
      return latestContext({
        version: 22,
        facts: {
          city: "Orlando",
          state: "FL",
          workAuthorization: true,
          workAuthorizationStatus: "authorized",
          preferredDayPart: null
        }
      });
    }
  };

  const result = await guardOutboundConversationCoherence({
    normalized: {
      channel: "whatsapp",
      phone: "+13055551212",
      providerMessageId: "wamid-current"
    },
    prospect: {
      id: "legacy-prospect-id",
      organization_id: "00000000-0000-4000-8000-000000000001",
      phone: "+13055551212"
    },
    engineResult: v2EngineResult({ version: 22, question: "ask_day_part" }),
    persistenceService
  });

  assert.equal(result.allowed, true);
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].organizationId,
    "00000000-0000-4000-8000-000000000001"
  );
  assert.equal(
    calls[0].prospectId,
    "11111111-1111-4111-8111-111111111111"
  );
  assert.equal(calls[0].channel, "whatsapp");
});

test("async guard fails closed when tenant/prospect scope is missing", async () => {
  const result = await guardOutboundConversationCoherence({
    normalized: { channel: "whatsapp", providerMessageId: "wamid-current" },
    prospect: {},
    engineResult: {
      source: "recruit_ai_v2_live_authoring",
      owner: "v2",
      v2Result: {}
    },
    persistenceService: { loadContext: async () => latestContext() }
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reason, REASONS.SCOPE_MISSING);
});
