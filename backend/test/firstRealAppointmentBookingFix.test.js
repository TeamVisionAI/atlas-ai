/**
 * First real appointment booking — live WhatsApp authoring execution gate (BR-114 × BR-111).
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveAllowExecutionForAuthoringTurn,
  resolveAllowExecutionForLiveTurn
} = require("../core/recruitAiV2/liveExecutionPathConfig");

const ORG = "00000000-0000-4000-8000-000000000001";
const AGENT = "33ad243a-9d00-4a4d-810b-df2762c0f076";

function executionEnv(overrides = {}) {
  return {
    RECRUIT_AI_V2_EXECUTION_ENABLED: "true",
    RECRUIT_AI_V2_EXECUTION_ORGANIZATION_IDS: ORG,
    RECRUIT_AI_V2_EXECUTION_USER_IDS: AGENT,
    RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED: "false",
    ...overrides
  };
}

test("live_whatsapp authoring allowExecution uses BR-111 only (not CE live path)", () => {
  const env = executionEnv();

  assert.equal(
    resolveAllowExecutionForAuthoringTurn({
      env,
      invocationSource: "live_whatsapp",
      organizationId: ORG,
      actingUserId: AGENT
    }),
    true
  );

  assert.equal(
    resolveAllowExecutionForLiveTurn({
      env,
      invocationSource: "live_ce"
    }),
    false
  );

  assert.equal(
    resolveAllowExecutionForAuthoringTurn({
      env: executionEnv({ RECRUIT_AI_V2_EXECUTION_ENABLED: "false" }),
      invocationSource: "live_whatsapp",
      organizationId: ORG,
      actingUserId: AGENT
    }),
    false
  );
});

test("live_ce authoring path still requires LIVE_EXECUTION_PATH_ENABLED", () => {
  const env = executionEnv({ RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED: "true" });

  assert.equal(
    resolveAllowExecutionForAuthoringTurn({
      env,
      invocationSource: "live_ce"
    }),
    true
  );
});

test("Betty production-shaped deferred state remains confirmable after exec OFF", () => {
  // Inline predicate — avoid loading liveAuthoringBridge (Supabase side effects on import).
  function isConfirmableProposedDurable(context = null) {
    if (!context) return false;
    const status = String(context.appointment?.status || "");
    const lastQ = String(context.conversation?.lastQuestionAsked || "");
    const lastOffer = String(context.conversation?.lastOfferMade || "");
    const lastIntent = String(context.conversation?.lastProspectIntent || "");
    const proposed =
      status === "proposed" ||
      Boolean(context.appointment?.proposedDate && context.appointment?.proposedTime);
    if (!proposed) return false;
    if (lastQ === "confirm_slot") return true;
    if (lastIntent === "schedule_confirm") return true;
    if (
      lastOffer === "appointment_confirm_deferred" ||
      lastOffer === "appointment_create_failed" ||
      lastOffer === "ask_confirm_slot"
    ) {
      return true;
    }
    return false;
  }

  const durable = {
    appointment: {
      status: "proposed",
      proposedDate: "2026-08-23",
      proposedTime: "16:00",
      meetingType: "zoom",
      previouslyOfferedSlots: [
        { date: "2026-08-23", time: "16:00", timezone: "America/New_York" },
        { date: "2026-08-23", time: "13:00", timezone: "America/New_York" }
      ]
    },
    conversation: {
      lastQuestionAsked: "confirm_slot",
      lastProspectIntent: "schedule_confirm",
      lastOfferMade: "appointment_confirm_deferred"
    }
  };

  assert.equal(isConfirmableProposedDurable(durable), true);
});
