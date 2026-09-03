/**
 * BR-219 — IUL selected-slot confirmation ownership.
 * Decision engine only: confirmable scheduling state, deferred copy, no CE/discovery.
 */

"use strict";

const { NEXT_ACTIONS } = require("./constants");
const {
  resolveIulSlotBySelectionId,
  isIulSlotSelectionId,
  parseIulFreeTextSlot
} = require("./iulSlotSelection");

const CONVERSATION_GOAL = "policy_review";
const ASK = Object.freeze({
  SCHEDULING_DAY: "iul_ask_review_day",
  SCHEDULING_DAY_PART: "iul_ask_scheduling_day_part",
  REVIEW_DAY_PART: "iul_ask_review_day_part",
  OFFER_SLOTS: "iul_offer_review_slots",
  CONFIRM_SLOT: "iul_confirm_review_slot",
  SCHEDULING_UNAVAILABLE: "iul_scheduling_unavailable"
});

const IUL_CONFIRMABLE_ASKS = Object.freeze([ASK.CONFIRM_SLOT]);

const IUL_SCHEDULING_ASKS = Object.freeze([
  ASK.SCHEDULING_DAY,
  ASK.SCHEDULING_DAY_PART,
  ASK.REVIEW_DAY_PART,
  ASK.OFFER_SLOTS,
  ASK.CONFIRM_SLOT,
  ASK.SCHEDULING_UNAVAILABLE
]);

const IUL_CONFIRMABLE_OFFERS = Object.freeze([
  "iul_confirm_review_deferred",
  "iul_confirm_review_slot",
  "iul_review_create_failed",
  "iul_review_confirmed_office",
  "iul_review_confirmed_zoom"
]);

const IUL_CONFIRMABLE_ACTIONS = Object.freeze([
  NEXT_ACTIONS.IUL_CREATE_REVIEW_APPOINTMENT
]);

const IUL_DEFERRED_BOOKING_OFFERS = Object.freeze([
  "iul_confirm_review_deferred",
  "iul_review_booking_pending"
]);

function fold(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function isIulPolicyReviewContext(context = {}) {
  return (
    String(context.conversationGoal || "") === CONVERSATION_GOAL ||
    String(context.campaignKind || "") === "iul_review_ad" ||
    String(context.campaignIntakePurpose || "")
      .toUpperCase()
      .includes("IUL")
  );
}

function lastAskOf(context = {}) {
  return String(context.conversation?.lastQuestionAsked || "");
}

function lastOfferOf(context = {}) {
  return String(context.conversation?.lastOfferMade || "");
}

function isIulSchedulingOwnedAsk(lastAsk) {
  return IUL_SCHEDULING_ASKS.includes(String(lastAsk || ""));
}

function isIulConfirmableAsk(lastAsk) {
  return IUL_CONFIRMABLE_ASKS.includes(String(lastAsk || ""));
}

function hasProposedIulSlot(context = {}) {
  const appt = context.appointment || {};
  const facts = context.knownFacts || {};
  const dateKey = appt.proposedDate || facts.reviewProposedDate || null;
  const timeKey = appt.proposedTime || facts.reviewProposedTime || null;
  return Boolean(dateKey && timeKey);
}

function isIulBookingPending(context = {}) {
  if (!isIulPolicyReviewContext(context)) {
    return false;
  }
  const appt = context.appointment || {};
  if (appt.appointmentId) {
    return false;
  }
  if (fold(appt.status) === "confirmed") {
    return false;
  }
  if (context.knownFacts?.iulBookingPending === true) {
    return true;
  }
  if (lastOfferOf(context) === "iul_confirm_review_deferred") {
    return true;
  }
  return (
    lastAskOf(context) === ASK.CONFIRM_SLOT &&
    hasProposedIulSlot(context) &&
    !appt.appointmentId
  );
}

function isIulDeferredBookingState(context = {}, inboundSelectedSlot = null) {
  if (!isIulPolicyReviewContext(context)) {
    return false;
  }
  if (inboundSelectedSlot) {
    return true;
  }
  if (isIulBookingPending(context)) {
    return true;
  }
  const ask = lastAskOf(context);
  const offer = lastOfferOf(context);
  const action = String(context._persistence?.lastDecisionCode || "");
  if (IUL_DEFERRED_BOOKING_OFFERS.includes(offer)) {
    return true;
  }
  if (action === NEXT_ACTIONS.IUL_CREATE_REVIEW_APPOINTMENT) {
    return true;
  }
  return ask === ASK.CONFIRM_SLOT && hasProposedIulSlot(context) && !context.appointment?.appointmentId;
}

function isIulConfirmableSchedulingState(context = {}) {
  if (!isIulPolicyReviewContext(context)) {
    return false;
  }
  const ask = lastAskOf(context);
  const offer = lastOfferOf(context);
  const action = String(context._persistence?.lastDecisionCode || "");
  if (IUL_CONFIRMABLE_ASKS.includes(ask) || IUL_CONFIRMABLE_OFFERS.includes(offer)) {
    return true;
  }
  if (IUL_CONFIRMABLE_ACTIONS.includes(action)) {
    return true;
  }
  const appt = context.appointment || {};
  if (
    fold(appt.status) === "proposed" &&
    hasProposedIulSlot(context) &&
    !appt.appointmentId
  ) {
    return true;
  }
  return isIulBookingPending(context);
}

function isIulInformationSeeker(context = {}) {
  return String(context.knownFacts?.iulQualificationStatus || "") === "IUL_STATUS_RESEARCH";
}

function isIulReviewReadyForScheduling(context = {}) {
  const facts = context.knownFacts || {};
  if (facts.iulQualificationStatus && (facts.iulReviewIntent || facts.reviewReason)) {
    return true;
  }
  if (facts.iulPolicyActive && facts.policyType) {
    return true;
  }
  if (
    String(facts.iulQualificationStatus || "") === "IUL_STATUS_UNSURE" &&
    facts.iulPolicyInHand != null
  ) {
    return true;
  }
  return false;
}

function isIulBookingComplete(context = {}) {
  const appt = context.appointment || {};
  return Boolean(appt.appointmentId) && fold(appt.status) === "confirmed";
}

function isIulSchedulingOwnedState(context = {}) {
  if (!isIulPolicyReviewContext(context)) {
    return false;
  }
  if (isIulSchedulingOwnedAsk(lastAskOf(context))) {
    return true;
  }
  if (isIulConfirmableSchedulingState(context)) {
    return true;
  }
  const facts = context.knownFacts || {};
  if (
    !isIulBookingComplete(context) &&
    (facts.meetingMode || facts.reviewMeetingMode) &&
    isIulReviewReadyForScheduling(context)
  ) {
    return true;
  }
  return Boolean(facts.meetingMode && hasProposedIulSlot(context));
}

function isIulQualificationCompleteForScheduling(context = {}) {
  const facts = context.knownFacts || {};
  if (isIulReviewReadyForScheduling(context)) {
    return true;
  }
  if (isIulSchedulingOwnedAsk(lastAskOf(context)) && facts.meetingMode) {
    return true;
  }
  return false;
}

function shouldBlockIulDiscovery(context = {}) {
  return isIulSchedulingOwnedState(context);
}

function resolveIulSelectedSlotFromInbound(context = {}, { text, interactiveReply } = {}) {
  const offered = context.appointment?.previouslyOfferedSlots || [];
  if (isIulSlotSelectionId(interactiveReply?.id)) {
    return resolveIulSlotBySelectionId(interactiveReply.id, offered);
  }
  return parseIulFreeTextSlot(text || interactiveReply?.title, offered);
}

function proposedSlotFromContext(context = {}) {
  const appt = context.appointment || {};
  const facts = context.knownFacts || {};
  const dateKey = appt.proposedDate || facts.reviewProposedDate || null;
  const timeKey = appt.proposedTime || facts.reviewProposedTime || null;
  if (!dateKey || !timeKey) {
    return null;
  }
  return {
    date: dateKey,
    time: timeKey,
    dateKey,
    timeKey,
    timezone: context.timezone || "America/New_York"
  };
}

function isIulInPerson(context = {}, entities = {}) {
  const mode = String(
    entities.meetingMode ||
      context.knownFacts?.meetingMode ||
      context.knownFacts?.reviewMeetingMode ||
      ""
  ).toLowerCase();
  const meetingType = String(
    entities.reviewMeetingType ||
      context.knownFacts?.reviewMeetingType ||
      context.appointment?.meetingType ||
      ""
  ).toLowerCase();
  return mode === "in_person" || meetingType === "in_person" || meetingType === "office";
}

function formatClock(timeKey) {
  const [hRaw, mRaw] = String(timeKey || "").split(":");
  const hour = Number(hRaw);
  const minute = Number(mRaw || 0);
  if (!Number.isFinite(hour)) {
    return String(timeKey || "");
  }
  const meridiem = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${meridiem}`;
}

function weekdayTimeLabel(slot, language = "es") {
  if (!slot) {
    return "";
  }
  const { WEEKDAY_LABELS } = require("./dateResolution");
  const dateKey = String(slot.date || slot.dateKey || "");
  const time = formatClock(slot.time || slot.timeKey);
  const [y, m, d] = dateKey.split("-").map(Number);
  const weekdayIndex =
    y && m && d ? new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay() : null;
  if (weekdayIndex == null) {
    return time;
  }
  const weekday =
    language === "en"
      ? WEEKDAY_LABELS.en[weekdayIndex]
      : WEEKDAY_LABELS.es[weekdayIndex];
  return language === "en" ? `${weekday} at ${time}` : `${weekday} a las ${time}`;
}

function buildIulDeferredAcknowledgement({
  language = "es",
  slot = null,
  meetingMode = null,
  officeAddress = null,
  context = {}
} = {}) {
  const es = language !== "en";
  const resolvedSlot = slot || proposedSlotFromContext(context);
  const inPerson = isIulInPerson(context, { meetingMode });
  const slotLabel = weekdayTimeLabel(resolvedSlot, language);
  const safeOffice =
    inPerson && officeAddress
      ? String(officeAddress).trim()
      : inPerson
        ? String(context.knownFacts?.reviewOfficeAddress || "").trim()
        : "";
  if (es) {
    if (inPerson) {
      const address = safeOffice ? ` Dirección: ${safeOffice}.` : "";
      return `Estoy reservando su cita para el ${slotLabel} en la oficina.${address} Le confirmo en un momento.`.replace(
        "el  ",
        "el "
      );
    }
    return `Estoy reservando su cita por Zoom para el ${slotLabel}. Le confirmo en un momento.`;
  }
  if (inPerson) {
    const address = safeOffice ? ` Address: ${safeOffice}.` : "";
    return `I'm booking your in-office appointment for ${slotLabel}.${address} I'll confirm in a moment.`;
  }
  return `I'm booking your Zoom appointment for ${slotLabel}. I'll confirm in a moment.`;
}

function buildIulPendingAck({ language = "es", slot = null, context = {} } = {}) {
  const es = language !== "en";
  const slotLabel = weekdayTimeLabel(slot || proposedSlotFromContext(context), language);
  return es
    ? `Sigo reservando su cita para el ${slotLabel}. Le confirmo en un momento.`
    : `I'm still booking your appointment for ${slotLabel}. I'll confirm in a moment.`;
}

function isIulCreateAction(nextAction) {
  return String(nextAction || "") === NEXT_ACTIONS.IUL_CREATE_REVIEW_APPOINTMENT;
}

function safeIulZoomJoinUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
    return raw;
  } catch {
    return null;
  }
}

function extractIulZoomJoinUrl(execution = {}, extras = {}) {
  const source = extras.scheduleResult || execution.scheduleResult || {};
  return safeIulZoomJoinUrl(
    extras.zoomJoinUrl ||
      execution.zoomJoinUrl ||
      source.zoomJoinUrl ||
      source.zoomLink ||
      source.meetingUrl ||
      source.meetLink ||
      source.calendarEvent?.hangoutLink ||
      source.appointment?.meeting_url ||
      source.appointment?.meetingUrl ||
      source.appointment?.zoomJoinUrl ||
      extras.appointment?.meeting_url ||
      extras.appointment?.meetingUrl ||
      extras.appointment?.zoomJoinUrl
  );
}

function buildIulBookingFollowUpIdempotencyKey({
  inboundMessageId = null,
  schedulingAttemptId = null,
  appointmentId = null
} = {}) {
  const inbound = String(inboundMessageId || "").trim();
  if (inbound) {
    return `iul-booking-follow-up:${inbound}`;
  }
  const attempt = String(schedulingAttemptId || "").trim();
  if (attempt) {
    return `iul-booking-follow-up:${attempt}`;
  }
  const appt = String(appointmentId || "").trim();
  if (appt) {
    return `iul-booking-follow-up:appt:${appt}`;
  }
  return null;
}

module.exports = {
  IUL_CONFIRMABLE_ASKS,
  IUL_SCHEDULING_ASKS,
  IUL_CONFIRMABLE_OFFERS,
  IUL_CONFIRMABLE_ACTIONS,
  isIulPolicyReviewContext,
  isIulSchedulingOwnedAsk,
  isIulConfirmableAsk,
  isIulBookingPending,
  isIulDeferredBookingState,
  isIulConfirmableSchedulingState,
  weekdayTimeLabel,
  isIulSchedulingOwnedState,
  isIulInformationSeeker,
  isIulReviewReadyForScheduling,
  isIulQualificationCompleteForScheduling,
  shouldBlockIulDiscovery,
  resolveIulSelectedSlotFromInbound,
  proposedSlotFromContext,
  isIulInPerson,
  buildIulDeferredAcknowledgement,
  buildIulPendingAck,
  isIulCreateAction,
  hasProposedIulSlot,
  safeIulZoomJoinUrl,
  extractIulZoomJoinUrl,
  buildIulBookingFollowUpIdempotencyKey
};
