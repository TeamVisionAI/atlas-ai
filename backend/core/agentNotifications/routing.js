/**
 * BR-176 — route an operational event to one responsible user.
 * Never broadcast tenant-wide. Never route by phone alone.
 */

const { EVENT_TYPES, TAKEOVER_REQUEST_REASONS } = require("./constants");

function firstUserId(...candidates) {
  for (const value of candidates) {
    const id = String(value || "").trim();
    if (/^[0-9a-f-]{36}$/i.test(id)) {
      return id;
    }
  }
  return null;
}

function resolveAppointmentRecipient(appointment = {}, explicitRecipient = null) {
  return firstUserId(
    explicitRecipient,
    appointment.interviewerUserId,
    appointment.interviewer_user_id,
    appointment.agentId,
    appointment.agent_id,
    appointment.createdBy,
    appointment.created_by
  );
}

function resolveConversationRecipient(payload = {}) {
  return firstUserId(
    payload.recipientUserId,
    payload.ownerUserId,
    payload.assignedUserId,
    payload.prospect?.owner_user_id,
    payload.prospect?.ownerUserId,
    payload.workflow?.ownerUserId,
    payload.workflow?.assignedUserId
  );
}

function resolveRecipient(event) {
  return firstUserId(
    resolveAppointmentRecipient(event.appointment || event.entity || {}, event.recipientUserId),
    resolveConversationRecipient(event)
  );
}

function classifyAttentionEvent(handoffReason) {
  const reason = String(handoffReason || "").trim();
  if (TAKEOVER_REQUEST_REASONS.includes(reason)) {
    return EVENT_TYPES.HUMAN_TAKEOVER_REQUESTED;
  }
  return EVENT_TYPES.NEEDS_ATTENTION;
}

function enteredNeedsAttention(previous = {}, next = {}) {
  const prevSticky = previous.manualAgentOwnership === true && Boolean(previous.humanTakenOverAt);
  const nextSticky = next.manualAgentOwnership === true && Boolean(next.humanTakenOverAt);
  const prevAttention = Boolean(previous.needsHumanAttention) && !prevSticky;
  const nextAttention = Boolean(next.needsHumanAttention) && !nextSticky;
  return !prevAttention && nextAttention;
}

module.exports = {
  firstUserId,
  resolveAppointmentRecipient,
  resolveConversationRecipient,
  resolveRecipient,
  classifyAttentionEvent,
  enteredNeedsAttention
};
