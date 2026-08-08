/**
 * BR-118 — non-text WhatsApp media must not reopen text clarification dialogue.
 * Execution remains OFF. No production writes.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  processRecruitAiV2TurnSync,
  authorizeSideEffects,
  executeAuthorizedSideEffects,
  isEligibleForLiveAuthoring,
  INTENTS,
  REASON_CODES,
  NEXT_ACTIONS
} = require("../core/recruitAiV2");
const {
  classifyInboundMedia,
  isPostConfirmDeferredSchedulingState,
  decideNonTextMediaTurn
} = require("../core/recruitAiV2/nonTextMedia");
const { createConversationContext } = require("../core/recruitAiV2/conversationContext");
const { interpretInboundMessage } = require("../core/recruitAiV2/interpreter");
const { renderCustomerReply } = require("../core/recruitAiV2/responseRenderer");
const { normalizeMessageBody } = require("../services/whatsappWebhookParser");

const ORG = "00000000-0000-4000-8000-000000000001";
const PRIMARY_RVP = "33ad243a-9d00-4a4d-810b-df2762c0f076";

function deferredContext(overrides = {}) {
  return createConversationContext({
    preferredLanguage: "spanish",
    timezone: "America/New_York",
    organizationId: ORG,
    agentId: PRIMARY_RVP,
    currentStage: "proposed",
    knownFacts: {
      city: "Miami",
      state: "FL",
      workAuthorization: true,
      preferredDayPart: "afternoon",
      preferredMeetingType: "in_person"
    },
    appointment: {
      status: "proposed",
      proposedDate: "2026-08-09",
      proposedTime: "19:30",
      previouslyOfferedSlots: [
        { date: "2026-08-08", time: "19:30", timezone: "America/New_York" },
        { date: "2026-08-09", time: "19:30", timezone: "America/New_York" }
      ]
    },
    conversation: {
      lastQuestionAsked: "confirm_slot",
      lastOfferMade: "appointment_confirm_deferred",
      lastProspectIntent: "schedule_confirm",
      clarificationCount: 0,
      pendingClarification: null,
      lastClarificationTemplateKey: null
    },
    ...overrides
  });
}

function runMedia(messageType, context = deferredContext()) {
  const placeholder = normalizeMessageBody({ type: messageType }) || `[${messageType} message]`;
  return processRecruitAiV2TurnSync({
    message: {
      text: placeholder,
      messageType,
      id: `wamid.media-${messageType}`
    },
    context,
    options: {
      channel: "whatsapp",
      allowExecution: false,
      env: {
        RECRUIT_AI_V2_EXECUTION_ENABLED: "false",
        RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED: "false"
      }
    }
  });
}

test("1–3. post-confirm document/image/audio do not clarify_once or reopen dialogue", () => {
  for (const type of ["document", "image", "audio"]) {
    const result = runMedia(type);
    assert.equal(result.interpretation.intent, INTENTS.NON_TEXT_MEDIA);
    assert.equal(
      result.structuredDecision.decision.nextAction,
      NEXT_ACTIONS.ACKNOWLEDGE_NON_TEXT_MEDIA
    );
    assert.notEqual(result.responsePlan.templateKey, "clarify_once");
    assert.doesNotMatch(result.rendered.text, /dato que te acabo de pedir/i);
    assert.match(result.rendered.text, /archivo|file|compañero|teammate/i);
  }
});

test("4–5. slot/date/time and clarificationCount unchanged", () => {
  const before = deferredContext();
  const result = runMedia("document", before);
  const next = result.nextContext;
  assert.equal(next.appointment.proposedDate, "2026-08-09");
  assert.equal(next.appointment.proposedTime, "19:30");
  assert.equal(next.timezone, "America/New_York");
  assert.equal(next.appointment.status, "proposed");
  assert.equal(next.conversation.lastOfferMade, "appointment_confirm_deferred");
  assert.equal(next.conversation.lastQuestionAsked, "confirm_slot");
  assert.equal(next.conversation.lastProspectIntent, "schedule_confirm");
  assert.equal(next.conversation.pendingClarification, null);
  assert.equal(Number(next.conversation.clarificationCount || 0), 0);
  assert.deepEqual(
    next.appointment.previouslyOfferedSlots.map((s) => `${s.date} ${s.time}`),
    ["2026-08-08 19:30", "2026-08-09 19:30"]
  );
  assert.ok(
    result.structuredDecision.reasonCodes.includes(
      REASON_CODES.NON_TEXT_MEDIA_POST_CONFIRM_HANDLED
    )
  );
});

test("6. no fake missing-field copy", () => {
  const text = runMedia("document").rendered.text;
  assert.doesNotMatch(text, /dato que te acabo de pedir|continuar\?/i);
});

test("7. zero appointment/calendar/BR-080 mutations while execution OFF", async () => {
  const result = runMedia("document");
  assert.equal(result.execution.attempted, false);
  assert.equal((result.execution.performed || []).length, 0);
  const auth = authorizeSideEffects({
    structuredDecision: result.structuredDecision,
    responsePlan: result.responsePlan,
    context: result.context,
    env: {
      RECRUIT_AI_V2_EXECUTION_ENABLED: "false",
      RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED: "false"
    },
    options: { allowExecution: false }
  });
  assert.equal(auth.authorized, false);
  const executed = await executeAuthorizedSideEffects({
    authorization: auth,
    structuredDecision: result.structuredDecision,
    context: result.context
  });
  assert.equal(executed.attempted, false);
});

test("8. single soft-ack reply (authoring path does not duplicate)", () => {
  const result = runMedia("document");
  assert.ok(result.rendered.text);
  assert.equal(result.structuredDecision.decision.nextAction, "acknowledge_non_text_media");
  // Exactly one customer reply plan — hub sends once.
  assert.equal(result.responsePlan.templateKey, "acknowledge_non_text_media");
});

test("9. pre-confirm non-text media preserves pending question", () => {
  const context = createConversationContext({
    preferredLanguage: "spanish",
    timezone: "America/New_York",
    organizationId: ORG,
    currentStage: "scheduling",
    knownFacts: { city: "Miami", state: "FL", workAuthorization: true },
    appointment: { status: "none", previouslyOfferedSlots: [] },
    conversation: {
      lastQuestionAsked: "ask_time_preference",
      lastOfferMade: null,
      lastProspectIntent: "provide_day_part",
      clarificationCount: 0,
      pendingClarification: null
    }
  });
  const result = runMedia("image", context);
  assert.equal(result.nextContext.conversation.lastQuestionAsked, "ask_time_preference");
  assert.equal(result.nextContext.conversation.lastProspectIntent, "provide_day_part");
  assert.equal(Number(result.nextContext.conversation.clarificationCount || 0), 0);
  assert.notEqual(result.responsePlan.templateKey, "clarify_once");
});

test("10. normal text messages still enter interpreter unchanged", () => {
  const context = deferredContext();
  const interpretation = interpretInboundMessage({
    message: { text: "Si", messageType: "text" },
    context,
    options: { flexible: true, channel: "whatsapp" }
  });
  assert.equal(interpretation.intent, INTENTS.SCHEDULE_CONFIRM);
  assert.notEqual(interpretation.intent, INTENTS.NON_TEXT_MEDIA);
});

test("11. genuine unknown TEXT can still use clarify_once", () => {
  const context = createConversationContext({
    preferredLanguage: "spanish",
    organizationId: ORG,
    currentStage: "scheduling",
    knownFacts: {
      city: "Miami",
      state: "FL",
      workAuthorization: true,
      preferredDayPart: "afternoon"
    },
    appointment: { status: "none" },
    conversation: {
      lastQuestionAsked: "ask_time_preference",
      clarificationCount: 0
    }
  });
  const result = processRecruitAiV2TurnSync({
    message: { text: "xyzzy plugh 999", messageType: "text" },
    context,
    options: { flexible: true, channel: "whatsapp" }
  });
  assert.equal(result.interpretation.intent, INTENTS.UNKNOWN);
  assert.equal(result.responsePlan.templateKey, "clarify_once");
  assert.equal(result.structuredDecision.decision.nextAction, "clarify_once");
});

test("12. structured detection prefers messageType; placeholder is fallback only", () => {
  assert.equal(
    classifyInboundMedia({ messageType: "document", text: "ignore me" }).detection,
    "structured_message_type"
  );
  assert.equal(
    classifyInboundMedia({ text: "[document message]" }).detection,
    "placeholder_text_fallback"
  );
  assert.equal(
    classifyInboundMedia({ messageType: "text", text: "Hola" }).isNonTextMedia,
    false
  );
  assert.equal(normalizeMessageBody({ type: "document" }), "[document message]");
});

test("13–15. BR-114/115/116/117 + 111/112/113 + 050 preserved (source gates)", () => {
  assert.equal(
    isEligibleForLiveAuthoring({
      organizationId: ORG,
      actingUserId: PRIMARY_RVP,
      env: {
        RECRUIT_AI_V2_LIVE_AUTHORING_ENABLED: "true",
        RECRUIT_AI_V2_LIVE_AUTHORING_ORGANIZATION_IDS: ORG,
        RECRUIT_AI_V2_LIVE_AUTHORING_USER_IDS: PRIMARY_RVP
      }
    }).eligible,
    true
  );

  const bridge = fs.readFileSync(
    path.join(__dirname, "../core/recruitAiV2/liveAuthoringBridge.js"),
    "utf8"
  );
  assert.match(bridge, /messageType/);
  assert.match(bridge, /BR-118/);

  const sanitizer = fs.readFileSync(
    path.join(__dirname, "../core/recruitAiV2/contextSanitizer.js"),
    "utf8"
  );
  assert.match(sanitizer, /ISO_TEMPORAL_TOKEN|BR-117/);

  const decision = fs.readFileSync(
    path.join(__dirname, "../core/recruitAiV2/decisionEngine.js"),
    "utf8"
  );
  assert.match(decision, /tryApplyAvailabilityOffer|OFFERED_SLOT_NATURAL_TIME_SELECTED/);

  assert.ok(
    fs.existsSync(path.join(__dirname, "appointmentTimezoneCanonicalBr050.test.js"))
  );
  assert.ok(isPostConfirmDeferredSchedulingState(deferredContext()));
  void decideNonTextMediaTurn;
  void renderCustomerReply;
});
