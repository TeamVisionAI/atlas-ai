/**
 * BR-211 — IUL interactive slot delivery trace + fix.
 * Live canary sent the offer body with no WhatsApp buttons because the
 * OFFER_SLOTS replay path never attached whatsappInteractive.
 */

"use strict";

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createConversationContext,
  interpretInboundMessage,
  decideConversationTurn,
  buildResponsePlan,
  renderCustomerReply,
  INTENTS
} = require("../core/recruitAiV2");
const { NEXT_ACTIONS } = require("../core/recruitAiV2/constants");
const {
  ASK,
  CONVERSATION_GOAL,
  CAMPAIGN_KIND
} = require("../core/recruitAiV2/iulAdConversation");
const { IUL_OPTION_IDS } = require("../core/recruitAiV2/iulQualificationOptions");
const {
  IUL_SLOT_MORE_ID,
  IUL_SLOT_ID_PREFIX,
  formatIulSlotButtonTitle
} = require("../core/recruitAiV2/iulSlotSelection");
const { resolveWhatsAppReplyEntities } = require("../core/communicationHub");
const { buildFreeformGraphBody } = require("../core/whatsappOutboundPipeline");
const {
  resolveInteractiveProviderFailureText,
  looksLikeTappableAppointmentText
} = require("../core/whatsappInteractiveMessage");

const NOW = "2026-09-01T16:00:00.000Z";
const OFFER_BODY =
  "Tengo estos horarios disponibles para su revisión por Zoom. ¿Cuál le funciona mejor?";

function slot(date, time) {
  return { dateKey: date, timeKey: time, date, time, timezone: "America/New_York" };
}

function iulContext(overrides = {}) {
  return createConversationContext({
    preferredLanguage: "spanish",
    conversationGoal: CONVERSATION_GOAL,
    campaignKind: CAMPAIGN_KIND,
    campaignIntakePurpose: "IUL",
    organizationId: "00000000-0000-4000-8000-000000000001",
    agentId: "33ad243a-9d00-4a4d-810b-df2762c0f076",
    timezone: "America/New_York",
    _testNow: NOW,
    knownFacts: { name: "Miller", iulSelectedDayPart: "morning" },
    conversation: { lastQuestionAsked: ASK.OFFER_SLOTS },
    appointment: {
      previouslyOfferedSlots: [slot("2026-09-02", "09:00"), slot("2026-09-02", "12:00")]
    },
    ...overrides
  });
}

function turn(message, context) {
  const interpretation = interpretInboundMessage({
    message: typeof message === "string" ? { text: message } : message,
    context
  });
  const decision = decideConversationTurn({ context, interpretation });
  const plan = buildResponsePlan(decision);
  const rendered = renderCustomerReply(plan);
  return { interpretation, decision, plan, rendered };
}

function interactive(decisionOrPlan) {
  return (
    decisionOrPlan.customerReplyPlan?.entities?.whatsappInteractive ||
    decisionOrPlan.entities?.whatsappInteractive ||
    null
  );
}

function optionIds(payload) {
  if (!payload) return [];
  if (payload.type === "button") {
    return (payload.action?.buttons || []).map((row) => row.reply?.id);
  }
  return (payload.action?.sections || []).flatMap((section) =>
    (section.rows || []).map((row) => row.id)
  );
}

test("A) IUL slot offer decision contains whatsappInteractive", () => {
  const { decision, rendered } = turn("ok gracias", iulContext());
  const payload = interactive(decision);
  assert.ok(payload);
  assert.equal(payload.type, "button");
  assert.match(rendered.text, /su revisión por Zoom/);
  assert.doesNotMatch(rendered.text, /^- /m);
});

test("B) communicationHub preserves it even when responsePlan.entities is empty", () => {
  const { decision, plan } = turn("ok gracias", iulContext());
  const engineResult = {
    v2Result: {
      responsePlan: { ...plan, entities: {} },
      structuredDecision: decision
    }
  };
  const entities = resolveWhatsAppReplyEntities(engineResult);
  assert.ok(entities.whatsappInteractive);
  assert.equal(entities.whatsappInteractive.type, "button");
});

test("C) Graph body is type=interactive", () => {
  const { decision } = turn("ok gracias", iulContext());
  const payload = interactive(decision);
  const body = buildFreeformGraphBody({
    metaTo: "15551234567",
    text: OFFER_BODY,
    interactive: payload
  });
  assert.equal(body.type, "interactive");
  assert.equal(body.interactive.type, "button");
});

test("D) <=3 slots → button payload", () => {
  const { decision } = turn("ok gracias", iulContext());
  assert.equal(interactive(decision).type, "button");
  assert.ok(optionIds(interactive(decision)).includes(IUL_SLOT_MORE_ID));
});

test("E) >3 slots → list payload", () => {
  const { decision } = turn(
    "ok gracias",
    iulContext({
      appointment: {
        previouslyOfferedSlots: [
          slot("2026-09-02", "09:00"),
          slot("2026-09-03", "09:30"),
          slot("2026-09-04", "10:00"),
          slot("2026-09-08", "10:30")
        ]
      }
    })
  );
  assert.equal(interactive(decision).type, "list");
  assert.ok(!optionIds(interactive(decision)).includes(IUL_SLOT_MORE_ID));
});

test("F) opaque IDs preserved exactly", () => {
  const { decision } = turn("ok gracias", iulContext());
  const ids = optionIds(interactive(decision)).filter((id) => id !== IUL_SLOT_MORE_ID);
  assert.ok(ids.every((id) => id.startsWith(IUL_SLOT_ID_PREFIX)));
  assert.deepEqual(
    decision.contextPatch.appointment.previouslyOfferedSlots.map((row) => row.selectionId),
    ids
  );
});

test("G) body text preserved", () => {
  const { decision, rendered } = turn("ok gracias", iulContext());
  assert.equal(rendered.text, OFFER_BODY);
  assert.equal(interactive(decision).body.text, OFFER_BODY);
});

test("H) provider error does not silently degrade to tappable-looking plain text", () => {
  const { decision } = turn("ok gracias", iulContext());
  const payload = interactive(decision);
  const recovery = resolveInteractiveProviderFailureText({
    interactive: payload,
    interactiveFallbackText: decision.customerReplyPlan.entities.interactiveFallbackText,
    message: OFFER_BODY,
    language: "es"
  });
  assert.match(recovery, /No pude mostrar las opciones de horario/);
  assert.equal(looksLikeTappableAppointmentText(recovery), false);
  assert.doesNotMatch(recovery, /9:00|12:00|Mié|IUL_SLOT/);
});

test("I) inbound button_reply still resolves the correct slot", () => {
  const first = turn("ok gracias", iulContext());
  const offered = first.decision.contextPatch.appointment.previouslyOfferedSlots;
  const selected = offered[0];
  const next = turn(
    {
      text: formatIulSlotButtonTitle(selected, "es"),
      interactiveReply: {
        type: "button_reply",
        id: selected.selectionId,
        title: formatIulSlotButtonTitle(selected, "es")
      }
    },
    iulContext({
      appointment: { previouslyOfferedSlots: offered }
    })
  );
  assert.equal(next.interpretation.intent, INTENTS.IUL_SELECT_OFFERED_SLOT);
  assert.equal(next.interpretation.entities.reviewProposedTime, "09:00");
  assert.equal(next.decision.decision.nextAction, NEXT_ACTIONS.IUL_CREATE_REVIEW_APPOINTMENT);
});

test("live canary replay: En la tarde during OFFER_SLOTS is a daypart change, not body-only text", () => {
  const { interpretation, decision } = turn("En la tarde", iulContext({
    _availabilityFixture: {
      slots: [
        slot("2026-09-02", "09:00"),
        slot("2026-09-02", "12:00"),
        slot("2026-09-02", "15:00")
      ]
    }
  }));
  assert.equal(interpretation.intent, INTENTS.IUL_CHOOSE_REVIEW_DAY_PART);
  assert.equal(interpretation.entities.iulReviewDayPart, "afternoon");
  assert.ok(interactive(decision));
  assert.equal(decision.customerReplyPlan.templateKey, "iul_offer_review_slots");
});

test("hub empty-object short-circuit no longer drops qualification-shaped entities", () => {
  const emptyPlanWins = resolveWhatsAppReplyEntities({
    v2Result: {
      responsePlan: { entities: {} },
      structuredDecision: {
        customerReplyPlan: {
          entities: { whatsappInteractive: { type: "button" } }
        }
      }
    }
  });
  assert.equal(emptyPlanWins.whatsappInteractive.type, "button");
});
