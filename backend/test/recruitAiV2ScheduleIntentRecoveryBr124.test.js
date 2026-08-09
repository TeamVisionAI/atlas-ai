/**
 * BR-124 — Explicit schedule intent recovers stale pre-appointment ambiguity.
 */
"use strict";

const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  interpretInboundMessage,
  looksLikeExplicitScheduleRequest
} = require("../core/recruitAiV2/interpreter");
const { decideConversationTurn } = require("../core/recruitAiV2/decisionEngine");
const { renderCustomerReply } = require("../core/recruitAiV2/responseRenderer");
const { shouldDeliverAutomatedReply } = require("../core/communicationHub");
const {
  INTENTS,
  NEXT_ACTIONS,
  REASON_CODES,
  APPOINTMENT_STATUS,
  STAGES
} = require("../core/recruitAiV2/constants");
const { createConversationContext } = require("../core/recruitAiV2/conversationContext");

function buildAnaContext(overrides = {}) {
  const c = createConversationContext({
    organizationId: "00000000-0000-4000-8000-000000000001",
    prospectId: "af02e5a9-bafd-442a-b333-346d099b8378",
    preferredLanguage: "spanish",
    timezone: "America/New_York"
  });
  c.currentStage = STAGES.QUALIFICATION;
  c.knownFacts = {
    ...c.knownFacts,
    city: "Miami",
    cityCertainty: "confirmed",
    state: "FL",
    stateCertainty: "confirmed",
    workAuthorization: true,
    workAuthorizationStatus: "authorized",
    preferredMeetingType: "in_person",
    coverage: "LOCAL",
    ...(overrides.knownFacts || {})
  };
  c.appointment = {
    ...c.appointment,
    status: "none",
    appointmentId: null,
    ...(overrides.appointment || {})
  };
  c.conversation = {
    ...c.conversation,
    clarificationCount: 1,
    pendingClarification: "clarify_once",
    lastClarificationTemplateKey: "clarify_once",
    lastQuestionAsked: "ask_day_part",
    ...(overrides.conversation || {})
  };
  c.attention = {
    needsHumanAttention: true,
    reason: "prior_ambiguity",
    ...(overrides.attention || {})
  };
  return c;
}

function interpret(text, context) {
  return interpretInboundMessage({
    message: { text },
    context
  });
}

describe("BR-124 schedule intent recovery", () => {
  test("1. DAY_PART residue + explicit quiero agendar → resumes scheduling, not escalate", () => {
    const text = "Hola, quiero agendar una entrevista";
    assert.equal(looksLikeExplicitScheduleRequest(text), true);

    const context = buildAnaContext();
    const interpretation = interpret(text, context);
    assert.equal(interpretation.intent, INTENTS.REQUEST_SCHEDULE_INTERVIEW);
    assert.ok(interpretation.confidence >= 0.9);

    const decision = decideConversationTurn({ context, interpretation });
    assert.equal(
      decision.decision.nextAction,
      NEXT_ACTIONS.RESUME_SCHEDULING_AFTER_EXPLICIT_REQUEST
    );
    assert.equal(decision.decision.shouldEscalate, false);
    assert.ok(
      decision.reasonCodes.includes(
        REASON_CODES.EXPLICIT_SCHEDULE_INTENT_RECOVERS_AMBIGUITY
      )
    );
    assert.equal(decision.contextPatch.conversation.clarificationCount, 0);
    assert.equal(decision.contextPatch.attention.needsHumanAttention, false);
    assert.match(
      String(decision.customerReplyPlan.templateKey || ""),
      /day_part|qualification|ask_/i
    );
  });

  test("2. repeated ambiguity residue + strong scheduling intent → stale ambiguity reset", () => {
    const context = buildAnaContext({
      conversation: {
        clarificationCount: 3,
        pendingClarification: "safe_uncertain_escalate",
        lastClarificationTemplateKey: "safe_uncertain_escalate",
        lastQuestionAsked: "ask_day_part"
      }
    });
    const interpretation = interpret("Quiero agendar una entrevista", context);
    const decision = decideConversationTurn({ context, interpretation });
    assert.notEqual(decision.decision.nextAction, NEXT_ACTIONS.ESCALATE_TO_HUMAN);
    assert.equal(decision.contextPatch.conversation.clarificationCount, 0);
    assert.ok(
      decision.reasonCodes.includes(
        REASON_CODES.EXPLICIT_SCHEDULE_INTENT_RECOVERS_AMBIGUITY
      )
    );
  });

  test("3. weak/ambiguous input with repeated ambiguity → escalation still works", () => {
    const context = buildAnaContext({
      conversation: {
        clarificationCount: 1,
        pendingClarification: "clarify_once",
        lastClarificationTemplateKey: "clarify_once",
        lastQuestionAsked: "ask_day_part"
      }
    });
    const decision = decideConversationTurn({
      context,
      interpretation: {
        intent: INTENTS.UNKNOWN,
        confidence: 0.4,
        preferredLanguage: "spanish",
        entities: {},
        languageAdapted: false
      }
    });
    assert.equal(decision.decision.nextAction, NEXT_ACTIONS.ESCALATE_TO_HUMAN);
    assert.ok(
      decision.reasonCodes.includes(REASON_CODES.REPEATED_AMBIGUITY_ESCALATE)
    );
    assert.equal(decision.customerReplyPlan.entities.requiresHuman, true);
  });

  test("4. confirmed appointment + new scheduling request → reschedule flow, not day-part recovery", () => {
    const context = buildAnaContext({
      appointment: {
        status: APPOINTMENT_STATUS.CONFIRMED,
        appointmentId: "appt-confirmed-1",
        confirmedDate: "2026-08-12",
        confirmedTime: "19:30"
      }
    });
    const interpretation = interpret("Quiero agendar una entrevista", context);
    const decision = decideConversationTurn({ context, interpretation });
    assert.equal(decision.decision.nextAction, NEXT_ACTIONS.OFFER_RESCHEDULE_FLOW);
    assert.ok(
      decision.reasonCodes.includes(REASON_CODES.APPOINTMENT_ALREADY_CONFIRMED)
    );
    assert.notEqual(
      decision.decision.nextAction,
      NEXT_ACTIONS.RESUME_SCHEDULING_AFTER_EXPLICIT_REQUEST
    );
  });

  test("5. appointment.status=none + no active appointment → clean scheduling recovery", () => {
    const context = buildAnaContext({
      conversation: {
        clarificationCount: 0,
        lastQuestionAsked: null,
        pendingClarification: null,
        lastClarificationTemplateKey: null
      }
    });
    const interpretation = interpret(
      "I want to schedule an interview",
      context
    );
    assert.equal(interpretation.intent, INTENTS.REQUEST_SCHEDULE_INTERVIEW);
    const decision = decideConversationTurn({ context, interpretation });
    assert.equal(
      decision.decision.nextAction,
      NEXT_ACTIONS.RESUME_SCHEDULING_AFTER_EXPLICIT_REQUEST
    );
    assert.equal(decision.decision.shouldEscalate, false);
  });

  test("6. genuine escalate_to_human → customer-facing handoff reply + delivery ack allowed", () => {
    const decision = decideConversationTurn({
      context: buildAnaContext({
        conversation: {
          clarificationCount: 1,
          pendingClarification: "clarify_once"
        }
      }),
      interpretation: {
        intent: INTENTS.UNKNOWN,
        confidence: 0.4,
        preferredLanguage: "spanish",
        entities: {},
        languageAdapted: false
      }
    });
    assert.equal(decision.decision.nextAction, NEXT_ACTIONS.ESCALATE_TO_HUMAN);
    assert.equal(decision.customerReplyPlan.entities.requiresHuman, true);
    assert.ok(
      decision.reasonCodes.includes(REASON_CODES.ESCALATE_HANDOFF_CUSTOMER_ACK)
    );

    const rendered = renderCustomerReply({
      templateKey: "safe_uncertain_escalate",
      language: "spanish",
      entities: { requiresHuman: true }
    });
    assert.match(
      String(rendered.text || rendered),
      /companero|compañero|Team Vision/i
    );

    assert.equal(
      shouldDeliverAutomatedReply(
        { phone: "+17862967254", current_step: "DAY_PART" },
        { allowHandoffAck: true }
      ),
      true
    );
  });

  test("docs: BR-124 documented", () => {
    const docs = fs.readFileSync(
      path.join(__dirname, "../../docs/06-business/BUSINESS_RULES.md"),
      "utf8"
    );
    assert.match(docs, /## BR-124/);
    assert.match(docs, /request_schedule_interview|Explicit Schedule Intent/i);
  });
});
