/**
 * BR-209 — IUL daypart wording + availability recovery.
 * Does not fabricate slots. Does not loosen BR-190 / BR-208.
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
  CAMPAIGN_KIND,
  parseIulReviewDayPart
} = require("../core/recruitAiV2/iulAdConversation");
const {
  IUL_OPTION_IDS,
  IUL_OPTION_LABELS,
  IUL_BUTTON_TITLES
} = require("../core/recruitAiV2/iulQualificationOptions");
const {
  normalizeIulDayPart,
  dayPartConstraints
} = require("../core/recruitAiV2/iulPolicyReviewScheduling");

const TEAM_VISION_ORG = "00000000-0000-4000-8000-000000000001";
const NOW = "2026-09-01T16:00:00.000Z";

function iulContext(overrides = {}) {
  return createConversationContext({
    preferredLanguage: "spanish",
    conversationGoal: CONVERSATION_GOAL,
    campaignKind: CAMPAIGN_KIND,
    campaignIntakePurpose: "IUL",
    organizationId: TEAM_VISION_ORG,
    agentId: "33ad243a-9d00-4a4d-810b-df2762c0f076",
    timezone: "America/New_York",
    _testNow: NOW,
    knownFacts: { name: "Ana" },
    conversation: { lastQuestionAsked: ASK.SCHEDULING_DAY_PART },
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

function morningTap() {
  return {
    text: "En la mañana",
    interactiveReply: {
      type: "button_reply",
      id: IUL_OPTION_IDS.DAY_MORNING,
      title: "En la mañana"
    }
  };
}

function afternoonTap() {
  return {
    text: "En la tarde",
    interactiveReply: {
      type: "button_reply",
      id: IUL_OPTION_IDS.DAY_AFTERNOON,
      title: "En la tarde"
    }
  };
}

function interactiveIds(decision) {
  const interactive = decision.customerReplyPlan?.entities?.whatsappInteractive;
  if (!interactive) return [];
  if (interactive.type === "button") {
    return (interactive.action?.buttons || []).map((row) => row.reply?.id);
  }
  if (interactive.type === "list") {
    return (interactive.action?.sections || []).flatMap((section) =>
      (section.rows || []).map((row) => row.id)
    );
  }
  return [];
}

function offeredCopy(decision, rendered) {
  const interactive = decision.customerReplyPlan?.entities?.whatsappInteractive;
  const titles = [];
  if (interactive?.type === "button") {
    titles.push(
      ...(interactive.action?.buttons || []).map((row) => row.reply?.title || "")
    );
  }
  if (interactive?.type === "list") {
    titles.push(
      ...((interactive.action?.sections || []).flatMap((section) =>
        (section.rows || []).map((row) => row.title || "")
      ))
    );
  }
  return [rendered.text, decision.customerReplyPlan?.entities?.interactiveFallbackText, ...titles]
    .filter(Boolean)
    .join(" ");
}

function slot(date, time) {
  return { dateKey: date, timeKey: time, date, time, timezone: "America/New_York" };
}

test("A) Spanish labels are En la mañana / En la tarde", () => {
  assert.equal(IUL_OPTION_LABELS[IUL_OPTION_IDS.DAY_MORNING], "En la mañana");
  assert.equal(IUL_OPTION_LABELS[IUL_OPTION_IDS.DAY_AFTERNOON], "En la tarde");
  assert.equal(IUL_BUTTON_TITLES[IUL_OPTION_IDS.DAY_MORNING], "En la mañana");
  assert.equal(IUL_BUTTON_TITLES[IUL_OPTION_IDS.DAY_AFTERNOON], "En la tarde");
  const { rendered, decision } = turn(
    { text: "Costos", interactiveReply: { id: IUL_OPTION_IDS.REVIEW_COSTS, title: "Costos" } },
    iulContext({
      conversation: { lastQuestionAsked: ASK.REVIEW_INTENT },
      knownFacts: { iulQualificationStatus: IUL_OPTION_IDS.STATUS_ACTIVE }
    })
  );
  assert.match(rendered.text, /¿Cómo prefiere hacer su revisión de póliza\?/);
  assert.ok(interactiveIds(decision).includes(IUL_OPTION_IDS.MEET_ZOOM));
  const dayPart = turn(
    { text: "Por Zoom", interactiveReply: { id: IUL_OPTION_IDS.MEET_ZOOM, title: "Por Zoom" } },
    iulContext({
      conversation: { lastQuestionAsked: ASK.MEETING_MODE },
      knownFacts: { iulQualificationStatus: IUL_OPTION_IDS.STATUS_ACTIVE }
    })
  );
  assert.match(dayPart.rendered.text, /¿Qué horario prefiere para su revisión por Zoom\?/);
  assert.deepEqual(interactiveIds(dayPart.decision), [
    IUL_OPTION_IDS.DAY_MORNING,
    IUL_OPTION_IDS.DAY_AFTERNOON
  ]);
  assert.doesNotMatch(rendered.text, /\bMañana\b/);
});

test("B) underlying morning/afternoon values remain unchanged", () => {
  assert.equal(normalizeIulDayPart("day"), "morning");
  assert.equal(normalizeIulDayPart("morning"), "morning");
  assert.equal(normalizeIulDayPart("afternoon"), "afternoon");
  assert.equal(parseIulReviewDayPart("En la mañana"), "morning");
  assert.equal(parseIulReviewDayPart("En la tarde"), "afternoon");
  assert.equal(dayPartConstraints("morning").dayPart, "morning");
  assert.equal(dayPartConstraints("afternoon").dayPart, "afternoon");
  const { interpretation, decision } = turn(morningTap(), iulContext());
  assert.equal(interpretation.entities.dayPart, "morning");
  assert.equal(interpretation.entities.iulReviewDayPart, "morning");
  assert.equal(decision.contextPatch.knownFacts.preferredDayPart, "morning");
  const afternoon = turn(afternoonTap(), iulContext());
  assert.equal(afternoon.interpretation.entities.dayPart, "afternoon");
  assert.equal(afternoon.decision.contextPatch.knownFacts.preferredDayPart, "afternoon");
});

test("C) morning has slots → offer real morning slots", () => {
  const { rendered, decision, interpretation } = turn(
    morningTap(),
    iulContext({
      _availabilityFixture: {
        slots: [slot("2026-09-02", "10:00"), slot("2026-09-02", "14:30")]
      }
    })
  );
  assert.equal(interpretation.intent, INTENTS.IUL_CHOOSE_REVIEW_DAY_PART);
  assert.equal(decision.contextPatch.conversation.lastQuestionAsked, ASK.OFFER_SLOTS);
  assert.equal(decision.decision.nextAction, NEXT_ACTIONS.IUL_OFFER_REVIEW_SLOTS);
  assert.match(offeredCopy(decision, rendered), /10:00|9:00 AM/);
  assert.doesNotMatch(offeredCopy(decision, rendered), /14:30|2:30 PM/);
  assert.doesNotMatch(rendered.text, /quedó confirmad|Perfecto, confirmado/i);
});

test("D) morning empty → search forward for later morning slots", () => {
  const { rendered, decision } = turn(
    morningTap(),
    iulContext({
      _availabilityFixture: {
        slots: [slot("2026-09-04", "09:30"), slot("2026-09-07", "10:00")]
      }
    })
  );
  assert.equal(decision.contextPatch.conversation.lastQuestionAsked, ASK.OFFER_SLOTS);
  assert.match(offeredCopy(decision, rendered), /09:30|9:30 AM|10:00|10:00 AM/);
  assert.equal(decision.contextPatch.knownFacts.iulDaypartSearchAttempted, true);
});

test("E) afternoon empty → search forward for later afternoon slots", () => {
  const { rendered, decision } = turn(
    afternoonTap(),
    iulContext({
      _availabilityFixture: {
        slots: [slot("2026-09-08", "15:00")]
      }
    })
  );
  assert.equal(decision.contextPatch.conversation.lastQuestionAsked, ASK.OFFER_SLOTS);
  assert.match(offeredCopy(decision, rendered), /3:00 PM|15:00/);
});

test("F) selected daypart empty but alternative slots exist → offer alternatives", () => {
  const { rendered, decision } = turn(
    morningTap(),
    iulContext({
      _availabilityFixture: {
        slots: [slot("2026-09-05", "14:00"), slot("2026-09-07", "15:30")]
      }
    })
  );
  assert.equal(decision.contextPatch.conversation.lastQuestionAsked, ASK.OFFER_SLOTS);
  assert.equal(decision.contextPatch.knownFacts.iulDaypartFallbackAttempted, true);
  assert.match(rendered.text, /No tengo disponibilidad en la mañana/);
  assert.match(offeredCopy(decision, rendered), /2:00 PM|3:30 PM|14:00|15:30/);
  assert.doesNotMatch(rendered.text, /quedó confirmad/i);
});

test("G) no slots anywhere → no loop; recoverable state", () => {
  const { rendered, decision } = turn(
    morningTap(),
    iulContext({
      _availabilityFixture: { slots: [] }
    })
  );
  assert.equal(decision.contextPatch.conversation.lastQuestionAsked, ASK.SCHEDULING_UNAVAILABLE);
  assert.equal(decision.decision.nextAction, NEXT_ACTIONS.IUL_SCHEDULING_UNAVAILABLE);
  assert.equal(decision.contextPatch.knownFacts.iulSchedulingUnavailable, true);
  assert.deepEqual(interactiveIds(decision), []);
  assert.match(rendered.text, /no tengo horarios disponibles/i);
  assert.doesNotMatch(rendered.text, /En la mañana|En la tarde/);
  assert.doesNotMatch(rendered.text, /quedó confirmad/i);
});

test("H) weekend preference preserved", () => {
  const { decision, interpretation } = turn(
    {
      text: "fin de semana en la mañana",
      interactiveReply: {
        id: IUL_OPTION_IDS.DAY_MORNING,
        title: "En la mañana"
      }
    },
    iulContext({
      _availabilityFixture: {
        slots: [slot("2026-09-05", "10:00"), slot("2026-09-07", "10:00")]
      }
    })
  );
  assert.equal(interpretation.entities.preferredWeekend, true);
  assert.equal(decision.contextPatch.knownFacts.preferredWeekend, true);
  const offered = decision.contextPatch.appointment.previouslyOfferedSlots || [];
  assert.ok(offered.some((row) => String(row.date || row.dateKey) === "2026-09-05"));
  assert.ok(offered.every((row) => String(row.date || row.dateKey) !== "2026-09-07"));
});

test("I) daypart question is not repeated after a valid answer", () => {
  const first = turn(
    morningTap(),
    iulContext({
      _availabilityFixture: { slots: [slot("2026-09-03", "10:00")] }
    })
  );
  assert.equal(first.decision.contextPatch.conversation.lastQuestionAsked, ASK.OFFER_SLOTS);
  const second = turn(
    morningTap(),
    iulContext({
      conversation: { lastQuestionAsked: ASK.SCHEDULING_DAY_PART },
      knownFacts: {
        iulSelectedDayPart: "morning",
        iulDaypartSearchAttempted: true
      },
      appointment: {
        previouslyOfferedSlots: [slot("2026-09-03", "10:00")]
      },
      _availabilityFixture: { slots: [slot("2026-09-03", "10:00")] }
    })
  );
  assert.equal(second.decision.contextPatch.conversation.lastQuestionAsked, ASK.OFFER_SLOTS);
  assert.ok(
    interactiveIds(second.decision).every((id) => String(id).startsWith("IUL_SLOT_")) ||
      interactiveIds(second.decision).length === 0
  );
  assert.ok(!interactiveIds(second.decision).includes(IUL_OPTION_IDS.DAY_MORNING));
});

test("J) FAQ interruption resumes exact scheduling stage", () => {
  const faq = turn(
    { text: "¿Cuánto cuesta la revisión?" },
    iulContext({
      conversation: { lastQuestionAsked: ASK.OFFER_SLOTS },
      knownFacts: {
        iulSelectedDayPart: "morning",
        iulDaypartSearchAttempted: true
      },
      appointment: {
        previouslyOfferedSlots: [slot("2026-09-03", "10:00")]
      }
    })
  );
  assert.equal(faq.decision.contextPatch.conversation.lastQuestionAsked, ASK.OFFER_SLOTS);
  assert.ok(interactiveIds(faq.decision).every((id) => String(id).startsWith("IUL_SLOT_")));
  assert.ok(interactiveIds(faq.decision).length > 0);
  assert.doesNotMatch(faq.rendered.text, /En la mañana|En la tarde/);
});
