/**
 * ATLAS_SHARED_SCHEDULING_V2 — scheduling diagnostics (no secrets).
 */

"use strict";

const { logWhatsAppStage } = require("../whatsappStructuredLogger");

function buildSchedulingDiagnostics({
  workflowConfig = null,
  negotiationState = null,
  availability = null,
  booking = null
} = {}) {
  const readResult = availability?.readResult || null;
  return {
    workflowType: workflowConfig?.workflowType || null,
    appointmentType: workflowConfig?.appointmentType || null,
    requestedConstraints: negotiationState
      ? {
          requestedDate: negotiationState.requestedDate || null,
          requestedDayPart: negotiationState.requestedDayPart || null,
          earliestTime: negotiationState.earliestTime || null,
          latestTime: negotiationState.latestTime || null,
          requestedExactTime: negotiationState.requestedExactTime || null
        }
      : null,
    resolvedConstraints: readResult?.constraints || null,
    availableSlotsCount: Array.isArray(readResult?.slots)
      ? readResult.slots.length
      : Array.isArray(readResult?.unconstrainedFutureSlots)
        ? readResult.unconstrainedFutureSlots.length
        : null,
    proposedSlots: availability?.nearestAlternatives || readResult?.offeredSlots || [],
    selectedSlot: negotiationState?.selectedSlot || null,
    bookingIdempotencyKey: booking?.idempotencyKey || null,
    calendarResult: booking?.calendarEventId ? "ok" : booking?.calendarResult || null,
    zoomResult: booking?.zoomUrl ? "ok" : booking?.zoomResult || null,
    reminderResult: booking?.reminderResult || null,
    rescheduleResult: booking?.rescheduleResult || null,
    cancelResult: booking?.cancelResult || null,
    alternativeToConstraint: Boolean(readResult?.alternativeToConstraint),
    readStatus: availability?.status || readResult?.status || null
  };
}

function logSchedulingDiagnostics(event, payload = {}) {
  try {
    logWhatsAppStage(event, payload);
  } catch {
    // Observability must never break scheduling.
  }
}

module.exports = {
  buildSchedulingDiagnostics,
  logSchedulingDiagnostics
};
