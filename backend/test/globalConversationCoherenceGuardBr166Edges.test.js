"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  REASONS,
  evaluateAgainstLatestContext,
  resolveAuthoredQuestionKey
} = require("../core/recruitAiV2/globalConversationCoherenceGuard");

function context(version, facts = {}) {
  return {
    knownFacts: facts,
    appointment: {},
    conversation: {},
    _persistence: {
      contextVersion: version,
      lastProcessedMessageId: "wamid-current"
    }
  };
}

test("post-save repaired nextContext does not hide the stale question actually authored", () => {
  const engineResult = {
    source: "recruit_ai_v2_live_authoring",
    owner: "v2",
    v2Result: {
      // Persistence repaired this forward to day-part...
      nextContext: {
        prospectId: "11111111-1111-4111-8111-111111111111",
        conversation: { lastQuestionAsked: "ask_day_part" },
        _persistence: { contextVersion: 10 }
      },
      // ...but the actual authored decision was still asking authorization.
      structuredDecision: {
        contextPatch: { conversation: { lastQuestionAsked: "ask_authorization" } },
        customerReplyPlan: { templateKey: "continue_qualification_after_location" }
      },
      responsePlan: { templateKey: "continue_qualification_after_location" }
    }
  };

  assert.equal(resolveAuthoredQuestionKey(engineResult), "ask_authorization");

  const result = evaluateAgainstLatestContext({
    engineResult,
    latestContext: context(10, {
      city: "Orlando",
      state: "FL",
      workAuthorization: true,
      workAuthorizationStatus: "authorized"
    }),
    currentInboundMessageId: "wamid-current"
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reason, REASONS.RESOLVED_FACT_REASK);
  assert.equal(result.questionKey, "ask_authorization");
});

test("legitimate ask_date is not falsely ranked as an old qualification question", () => {
  const engineResult = {
    source: "recruit_ai_v2_live_authoring",
    owner: "v2",
    v2Result: {
      nextContext: {
        prospectId: "11111111-1111-4111-8111-111111111111",
        conversation: { lastQuestionAsked: "ask_date" },
        _persistence: { contextVersion: 14 }
      },
      structuredDecision: {
        contextPatch: { conversation: { lastQuestionAsked: "ask_date" } },
        customerReplyPlan: { templateKey: "ask_date" }
      },
      responsePlan: { templateKey: "ask_date" }
    }
  };

  const result = evaluateAgainstLatestContext({
    engineResult,
    latestContext: context(14, {
      city: "Miami",
      state: "FL",
      workAuthorization: true,
      workAuthorizationStatus: "authorized",
      preferredDayPart: "afternoon"
    }),
    currentInboundMessageId: "wamid-current"
  });

  assert.equal(result.allowed, true);
  assert.equal(result.reason, REASONS.OK);
  assert.equal(result.questionKey, "ask_date");
});
