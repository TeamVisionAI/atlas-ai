/**
 * ATLAS_SHARED_SCHEDULING_V2 — shared scheduling reliability tests.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");

const { interpretInboundMessage } = require("../core/recruitAiV2/interpreter");
const { decideConversationTurn } = require("../core/recruitAiV2/decisionEngine");
const { renderCustomerReply } = require("../core/recruitAiV2/responseRenderer");
const { createConversationContext } = require("../core/recruitAiV2/conversationContext");
const {
  resolveAvailabilityForTurnSync,
  filterSlotsByConstraints
} = require("../core/recruitAiV2/schedulingAvailabilityReader");
const {
  mergeSchedulingConstraints,
  buildNegotiationState,
  shouldSuppressSchedulingReopen
} = require("../core/sharedScheduling/schedulingNegotiationState");
const {
  findNearestAlternativeSlots,
  enrichReadResultWithNearestAlternatives
} = require("../core/sharedScheduling/sharedSchedulingOffer");
const {
  resolveSchedulingConfig,
  WORKFLOW_TYPES
} = require("../core/sharedScheduling/sharedSchedulingConfig");
const { buildSchedulingAttemptId } = require("../core/sharedScheduling/schedulingIdempotency");
const { readPolicyReviewAvailabilitySync } = require("../core/recruitAiV2/iulPolicyReviewScheduling");
const { APPOINTMENT_PURPOSES } = require("../core/configuration/appointmentDomain");

const FIXED_NOW = new Date("2026-08-08T15:00:00.000-04:00");
const TOMORROW = "2026-08-09";
const DAY_AFTER = "2026-08-10";

function slot(dateKey, timeKey) {
  return { dateKey, timeKey, date: dateKey, time: timeKey };
}

test("1. mañana preserved in negotiation state", () => {
  const context = createConversationContext({
    appointment: { proposedDate: TOMORROW, proposedDateLabel: "mañana" },
    knownFacts: {}
  });
  const state = buildNegotiationState({
    context,
    interpretation: { entities: { resolvedDate: { isoDate: TOMORROW } } }
  });
  assert.equal(state.requestedDate, TOMORROW);
});

test("2. mañana + después de las 5 merged constraints", () => {
  const prior = {
    earliestTime: null,
    dayPart: null,
    earliestTimeInclusive: true,
    raw: "mañana"
  };
  const incoming = {
    earliestTime: "17:00",
    earliestTimeInclusive: false,
    raw: "después de las 5"
  };
  const merged = mergeSchedulingConstraints(prior, incoming, {
    appointment: { proposedDate: TOMORROW }
  });
  assert.equal(merged.earliestTime, "17:00");
  assert.equal(merged.earliestTimeInclusive, false);
});

test("3. afternoon constraint filters morning slots", () => {
  const slots = [slot(TOMORROW, "10:00"), slot(TOMORROW, "14:00")];
  const filtered = filterSlotsByConstraints(slots, { dayPart: "afternoon" });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].timeKey, "14:00");
});

test("4. exact time constraint via earliest/latest", () => {
  const slots = [slot(TOMORROW, "15:30"), slot(TOMORROW, "16:00")];
  const filtered = filterSlotsByConstraints(slots, {
    earliestTime: "16:00",
    earliestTimeInclusive: true
  });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].timeKey, "16:00");
});

test("5. date + time combined in resolve read", () => {
  const context = createConversationContext({
    timezone: "America/New_York",
    _testNow: FIXED_NOW,
    agentId: "agent-1",
    organizationId: "org-1",
    appointment: { proposedDate: TOMORROW },
    knownFacts: {
      availabilityConstraint: {
        earliestTime: "17:00",
        earliestTimeInclusive: false
      }
    },
    _availabilityFixture: {
      slots: [
        slot(TOMORROW, "16:30"),
        slot(TOMORROW, "17:30"),
        slot(DAY_AFTER, "17:30")
      ]
    }
  });
  const availability = resolveAvailabilityForTurnSync({
    context,
    interpretation: {
      intent: "provide_availability_constraint",
      entities: {
        availabilityConstraint: { earliestTime: "17:00", earliestTimeInclusive: false }
      }
    },
    options: {
      now: FIXED_NOW,
      agentId: "agent-1",
      availabilityFixture: context._availabilityFixture
    }
  });
  assert.ok(availability.checked);
  assert.ok(availability.nearestAlternatives.length >= 1);
});

test("6. range 2–5 filters slots", () => {
  const slots = [
    slot(TOMORROW, "13:00"),
    slot(TOMORROW, "14:30"),
    slot(TOMORROW, "17:30")
  ];
  const filtered = filterSlotsByConstraints(slots, {
    earliestTime: "14:00",
    latestTime: "17:00",
    earliestTimeInclusive: true
  });
  assert.deepEqual(
    filtered.map((s) => s.timeKey),
    ["14:30"]
  );
});

test("7. English after 5 equivalent to Spanish constraint merge", () => {
  const merged = mergeSchedulingConstraints(
    null,
    { earliestTime: "17:00", earliestTimeInclusive: false, raw: "after 5" },
    { appointment: { proposedDate: TOMORROW } }
  );
  assert.equal(merged.earliestTime, "17:00");
  assert.equal(merged.earliestTimeInclusive, false);
});

test("8. scheduling attempt idempotency key is deterministic", () => {
  const a = buildSchedulingAttemptId({
    organizationId: "org",
    agentId: "agent",
    prospectPhone: "+15551234567",
    appointmentType: APPOINTMENT_PURPOSES.RECRUITING_INTERVIEW,
    dateKey: TOMORROW,
    timeKey: "10:00",
    timezone: "America/New_York",
    inboundMessageId: "msg-1"
  });
  const b = buildSchedulingAttemptId({
    organizationId: "org",
    agentId: "agent",
    prospectPhone: "+15551234567",
    appointmentType: APPOINTMENT_PURPOSES.RECRUITING_INTERVIEW,
    dateKey: TOMORROW,
    timeKey: "10:00",
    timezone: "America/New_York",
    inboundMessageId: "msg-1"
  });
  assert.equal(a, b);
  assert.ok(a.includes("scheduling-attempt:"));
});

test("9. only real free slots proposed — constrained filter", () => {
  const slots = [slot(TOMORROW, "16:00"), slot(TOMORROW, "18:00")];
  const filtered = filterSlotsByConstraints(slots, {
    earliestTime: "17:00",
    earliestTimeInclusive: false
  });
  assert.deepEqual(filtered.map((s) => s.timeKey), ["18:00"]);
});

test("13. unavailable exact window → nearest alternatives", () => {
  const pool = [
    slot(TOMORROW, "16:30"),
    slot(TOMORROW, "17:00"),
    slot(DAY_AFTER, "17:00")
  ];
  const nearest = findNearestAlternativeSlots(
    pool,
    { earliestTime: "17:00", earliestTimeInclusive: false },
    TOMORROW,
    { maxCandidates: 2 }
  );
  assert.ok(nearest.length >= 1);
  assert.equal(nearest[0].timeKey, "16:30");
});

test("14. enrich read result upgrades zero-slot to nearest offer", () => {
  const enriched = enrichReadResultWithNearestAlternatives(
    {
      status: "zero_slots",
      date: TOMORROW,
      offeredSlots: [],
      unconstrainedFutureSlots: [
        slot(TOMORROW, "16:30"),
        slot(DAY_AFTER, "17:00")
      ]
    },
    {
      constraints: { earliestTime: "17:00", earliestTimeInclusive: false },
      requestedDate: TOMORROW,
      maxCandidates: 2
    }
  );
  assert.equal(enriched.status, "available");
  assert.ok(enriched.offeredSlots.length >= 1);
  assert.equal(enriched.alternativeToConstraint, true);
});

test("15. no availability → zero slots without fabrication", () => {
  const enriched = enrichReadResultWithNearestAlternatives(
    {
      status: "zero_slots",
      offeredSlots: [],
      unconstrainedFutureSlots: []
    },
    { constraints: { earliestTime: "17:00" }, requestedDate: TOMORROW }
  );
  assert.equal(enriched.offeredSlots.length, 0);
});

test("21. partial constraints preserved across interpreter turns", () => {
  const context = createConversationContext({
    timezone: "America/New_York",
    _testNow: FIXED_NOW,
    appointment: { proposedDate: TOMORROW },
    knownFacts: {
      availabilityConstraint: {
        earliestTime: "17:00",
        earliestTimeInclusive: false,
        raw: "después de las 5"
      }
    },
    conversation: { lastQuestionAsked: "ask_time_preference" }
  });
  const interpretation = interpretInboundMessage({
    message: { text: "después de las 5" },
    context,
    options: { now: FIXED_NOW }
  });
  const merged = mergeSchedulingConstraints(
    context.knownFacts.availabilityConstraint,
    interpretation.entities?.availabilityConstraint || null,
    context,
    interpretation
  );
  assert.equal(merged?.earliestTime, "17:00");
  assert.equal(context.appointment.proposedDate, TOMORROW);
});

test("22. stale lastQuestionAsked does not erase merged constraint", () => {
  const merged = mergeSchedulingConstraints(
    { earliestTime: "17:00", earliestTimeInclusive: false },
    { earliestTime: "18:00", earliestTimeInclusive: false },
    { conversation: { lastQuestionAsked: "ask_date" } }
  );
  assert.equal(merged.earliestTime, "18:00");
});

test("23. confirmed appointment suppresses scheduling reopen", () => {
  assert.equal(
    shouldSuppressSchedulingReopen({
      appointment: { status: "confirmed", proposedDate: TOMORROW, proposedTime: "10:00" }
    }),
    true
  );
});

test("24. human zoom prep text matches post-scheduling human takeover guard", () => {
  const t = "Descarga Zoom antes de la revisión mañana"
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  assert.match(
    t,
    /\b(zoom|descarga|download|preparacion|preparation|enlace|link)\b/
  );
});

test("32. recruiting config resolves default interview purpose", () => {
  const config = resolveSchedulingConfig({ conversationGoal: "recruiting" });
  assert.equal(config.workflowType, WORKFLOW_TYPES.RECRUITING_INTERVIEW);
  assert.equal(config.purpose, APPOINTMENT_PURPOSES.RECRUITING_INTERVIEW);
});

test("33. IUL uses same reader with policy_review purpose", () => {
  const context = createConversationContext({
    conversationGoal: "policy_review",
    timezone: "America/New_York",
    _testNow: FIXED_NOW,
    organizationId: "org-iul",
    knownFacts: { reviewPreferredDayPart: "afternoon" },
    _availabilityFixture: {
      slots: [slot(TOMORROW, "14:00"), slot(DAY_AFTER, "15:00")]
    }
  });
  const availability = readPolicyReviewAvailabilitySync({
    context,
    options: {
      agentId: "fixture-agent",
      availabilityFixture: context._availabilityFixture,
      now: FIXED_NOW
    }
  });
  assert.equal(availability.schedulingConfig.workflowType, WORKFLOW_TYPES.IUL_POLICY_REVIEW);
  assert.equal(availability.appointmentPurpose, APPOINTMENT_PURPOSES.POLICY_REVIEW);
  assert.ok(availability.offeredSlots.length >= 1);
});

test("34. workflow configs do not leak appointment types", () => {
  const recruiting = resolveSchedulingConfig({ conversationGoal: "recruiting" });
  const iul = resolveSchedulingConfig({ conversationGoal: "policy_review" });
  assert.notEqual(recruiting.appointmentType, iul.appointmentType);
});

test("nearest alternatives render with improved copy", () => {
  const context = createConversationContext({
    timezone: "America/New_York",
    _testNow: FIXED_NOW,
    agentId: "agent-1",
    organizationId: "org-1",
    preferredLanguage: "spanish",
    appointment: { proposedDate: TOMORROW, proposedDateLabel: "mañana" },
    knownFacts: {
      availabilityConstraint: {
        earliestTime: "17:00",
        earliestTimeInclusive: false
      }
    },
    _availabilityFixture: {
      slots: [slot(TOMORROW, "16:30"), slot(DAY_AFTER, "17:00")]
    }
  });
  const interpretation = interpretInboundMessage({
    message: { text: "después de las 5 mañana" },
    context,
    options: { now: FIXED_NOW, flexible: true }
  });
  const availability = resolveAvailabilityForTurnSync({
    context,
    interpretation,
    options: {
      now: FIXED_NOW,
      agentId: "agent-1",
      availabilityFixture: context._availabilityFixture
    }
  });
  const structured = decideConversationTurn({ context, interpretation, availability });
  assert.equal(
    structured.customerReplyPlan.templateKey,
    availability.readResult?.alternativeToConstraint
      ? "offer_nearest_alternatives"
      : structured.customerReplyPlan.templateKey
  );
  const rendered = renderCustomerReply(structured.customerReplyPlan);
  if (structured.customerReplyPlan.templateKey === "offer_nearest_alternatives") {
    assert.match(rendered.text, /m[áa]s cercano|closest/i);
    assert.match(rendered.text, /funciona/i);
  }
});
