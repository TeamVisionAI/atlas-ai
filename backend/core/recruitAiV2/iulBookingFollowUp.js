/**
 * BR-219 — After IUL deferred acknowledgement, deliver one late confirm/fail
 * without starting a second processTurn. Uses the already-tracked mutation.
 */

"use strict";

const { renderCustomerReply } = require("./responseRenderer");
const { NEXT_ACTIONS, REASON_CODES } = require("./constants");
const {
  isIulInPerson,
  proposedSlotFromContext,
  isIulCreateAction,
  weekdayTimeLabel,
  extractIulZoomJoinUrl,
  buildIulBookingFollowUpIdempotencyKey
} = require("./iulSchedulingOwnership");

const FOLLOW_UP_SENT = new Set();

function followUpKey(providerMessageId) {
  return String(providerMessageId || "").trim();
}

function performedSlot(execution = {}) {
  const performed = (execution.performed || []).find(
    (row) => row?.type === "create_appointment" || row?.dateKey
  );
  if (!performed) {
    return null;
  }
  return {
    date: performed.dateKey,
    time: performed.timeKey,
    dateKey: performed.dateKey,
    timeKey: performed.timeKey
  };
}

function slotStillMatches(context, slot) {
  if (!slot?.dateKey || !slot?.timeKey) {
    return true;
  }
  const proposed = proposedSlotFromContext(context);
  if (!proposed) {
    return true;
  }
  return (
    String(proposed.dateKey) === String(slot.dateKey) &&
    String(proposed.timeKey) === String(slot.timeKey)
  );
}

function confirmationTemplate(context, entities = {}) {
  return isIulInPerson(context, entities)
    ? "iul_review_confirmed_office"
    : "iul_review_confirmed_zoom";
}

async function deliverIulBookingFollowUp({
  error = null,
  v2Result = null,
  prospect = {},
  normalized = {},
  organizationId = null,
  actingUserId = null,
  env = process.env,
  deliverReply = null,
  logStage = null
} = {}) {
  const inboundId = followUpKey(normalized.providerMessageId);
  if (inboundId && FOLLOW_UP_SENT.has(inboundId)) {
    return { sent: false, reason: "ALREADY_SENT" };
  }

  let settled = v2Result;
  if (!settled && typeof error?.awaitTracked === "function") {
    try {
      settled = await error.awaitTracked();
    } catch {
      settled = typeof error.getLateResult === "function" ? error.getLateResult() : null;
    }
  }
  if (!settled) {
    return { sent: false, reason: "NO_SETTLED_RESULT" };
  }

  const nextAction = settled?.structuredDecision?.decision?.nextAction || null;
  const execution = settled.execution || {};
  if (!isIulCreateAction(nextAction) && !execution.attempted) {
    return { sent: false, reason: "NOT_IUL_CREATE" };
  }

  const context = settled.nextContext || settled.context || {};
  const lastOffer = String(context.conversation?.lastOfferMade || "");
  if (
    lastOffer === "iul_review_confirmed_office" ||
    lastOffer === "iul_review_confirmed_zoom"
  ) {
    return { sent: false, reason: "CONFIRMATION_ALREADY_OFFERED" };
  }

  const slot = performedSlot(execution) || proposedSlotFromContext(context);
  if (execution.success && !slotStillMatches(context, slot)) {
    return { sent: false, reason: "SLOT_SUPERSEDED" };
  }

  const language = context.preferredLanguage || "spanish";
  const inPerson = isIulInPerson(context);
  const locale = language === "english" || language === "en" ? "en" : "es";
  const entities = {
    ...(settled.customerReplyPlan?.entities || {}),
    ...(settled.responsePlan?.entities || {}),
    slotLabel:
      settled.customerReplyPlan?.entities?.slotLabel ||
      weekdayTimeLabel(slot, locale) ||
      null,
    meetingMode: inPerson ? "in_person" : "zoom",
    officeAddress: context.knownFacts?.reviewOfficeAddress || null,
    requestedDate: slot?.dateKey || slot?.date || null,
    requestedTime: slot?.timeKey || slot?.time || null,
    zoomJoinUrl: execution.success && !inPerson ? extractIulZoomJoinUrl(execution) : null
  };

  const templateKey = execution.success
    ? confirmationTemplate(context, entities)
    : "iul_review_create_failed";
  const missingZoomLink =
    execution.success && !inPerson && templateKey === "iul_review_confirmed_zoom" && !entities.zoomJoinUrl;
  const confirmationIdempotencyKey = buildIulBookingFollowUpIdempotencyKey({
    inboundMessageId: inboundId,
    schedulingAttemptId: execution.schedulingAttemptId || null,
    appointmentId: execution.appointmentId || null
  });

  const rendered = renderCustomerReply({
    templateKey,
    language,
    entities
  });
  const replyText = String(rendered?.text || "").trim();
  if (!replyText || typeof deliverReply !== "function") {
    return { sent: false, reason: "NO_REPLY_OR_DELIVERER", templateKey };
  }

  if (inboundId) {
    FOLLOW_UP_SENT.add(inboundId);
  }

  if (typeof logStage === "function") {
    logStage("recruit_ai_v2_iul_booking_follow_up", {
      phone: normalized.phone || prospect.phone || null,
      organizationId,
      agentId: actingUserId,
      providerMessageId: inboundId || null,
      templateKey,
      success: Boolean(execution.success),
      appointmentId: execution.appointmentId || null,
      confirmationIdempotencyKey,
      missingZoomLink
    });
  }

  const delivery = await deliverReply({
    replyText,
    templateKey,
    v2Result: settled,
    nextAction: NEXT_ACTIONS.IUL_CREATE_REVIEW_APPOINTMENT,
    confirmationIdempotencyKey,
    reasonCodes: execution.success
      ? missingZoomLink
        ? [REASON_CODES.IUL_SLOT_REVALIDATED, REASON_CODES.IUL_ZOOM_LINK_MISSING]
        : [REASON_CODES.IUL_SLOT_REVALIDATED]
      : [REASON_CODES.IUL_CREATE_FAILED_NO_HANDOFF]
  });

  return {
    sent: true,
    templateKey,
    success: Boolean(execution.success),
    appointmentId: execution.appointmentId || null,
    confirmationIdempotencyKey,
    missingZoomLink,
    delivery
  };
}

function scheduleIulBookingFollowUp(args = {}) {
  const run = () =>
    deliverIulBookingFollowUp(args).catch((error) => {
      if (typeof args.logStage === "function") {
        args.logStage("recruit_ai_v2_iul_booking_follow_up_failed", {
          phone: args.normalized?.phone || args.prospect?.phone || null,
          message: String(error?.message || error).slice(0, 200)
        });
      }
    });
  if (typeof setImmediate === "function") {
    setImmediate(run);
  } else {
    setTimeout(run, 0);
  }
  return { scheduled: true };
}

function resetIulBookingFollowUpForTests() {
  FOLLOW_UP_SENT.clear();
}

module.exports = {
  deliverIulBookingFollowUp,
  scheduleIulBookingFollowUp,
  resetIulBookingFollowUpForTests
};
