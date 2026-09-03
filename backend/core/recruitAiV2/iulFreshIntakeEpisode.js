/**
 * Implements BR-222 — Fresh IUL campaign intake starts a new episode when no
 * confirmed policy-review appointment exists.
 * Decision engine only: never deletes logs or prospect identity.
 */

"use strict";

const { hasFreshIulCampaignIntakeMatch } = require("../atlasInboundAutomationEligibility");
const { IUL_STAGES } = require("../iulWorkflowConstants");
const { APPOINTMENT_STATUS, STAGES } = require("./constants");
const {
  isIulBookingComplete,
  isIulPolicyReviewContext
} = require("./iulSchedulingOwnership");

const IUL_EPISODE_FACT_KEYS = Object.freeze([
  "iulQualificationStatus",
  "iulPolicyActive",
  "policyType",
  "carrier",
  "carrierRaw",
  "carrierResolved",
  "originalPolicyPurpose",
  "originalPolicyPurposeRaw",
  "originalPurposeAsked",
  "policyAgeRange",
  "reviewReason",
  "reviewReasonRaw",
  "documentsAvailable",
  "iulReviewIntent",
  "iulOtherDetail",
  "iulPolicyInHand",
  "iulReviewTopic",
  "iulReviewDayPart",
  "reviewPreferredDayPart",
  "meetingMode",
  "reviewMeetingMode",
  "reviewMeetingType",
  "reviewOfficeAddress",
  "iulSelectedDate",
  "iulSelectedDayPart",
  "iulAvailableDays",
  "iulOfferedDays",
  "iulShownDayKeys",
  "iulSlotPool",
  "iulShownSlotKeys",
  "iulIncludeMoreSlots",
  "iulIncludeMoreDays",
  "reviewProposedDate",
  "reviewProposedTime",
  "iulBookingPending",
  "iulDaypartSearchAttempted",
  "iulDaypartFallbackAttempted",
  "iulSchedulingUnavailable",
  "zoomJoinUrl",
  "iulSlotSelectionId"
]);

const IUL_EPISODE_CLEARED_FACTS = Object.freeze(
  Object.fromEntries(
    IUL_EPISODE_FACT_KEYS.map((key) => [
      key,
      key === "carrierResolved" ||
      key === "originalPurposeAsked" ||
      key === "iulBookingPending" ||
      key === "iulIncludeMoreSlots" ||
      key === "iulIncludeMoreDays" ||
      key === "iulDaypartSearchAttempted" ||
      key === "iulDaypartFallbackAttempted" ||
      key === "iulSchedulingUnavailable"
        ? false
        : key.endsWith("Days") ||
            key.endsWith("Keys") ||
            key === "iulSlotPool"
          ? []
          : null
    ])
  )
);

function resolveFreshIulIntakeMatch({
  campaignIntakeMatch = null,
  extras = {},
  context = {},
  message = null
} = {}) {
  return (
    campaignIntakeMatch ||
    extras.campaignIntakeMatch ||
    message?.campaignIntakeMatch ||
    context._freshCampaignIntakeMatch ||
    null
  );
}

function hasFreshIulIntakeSignal({
  campaignIntakeMatch = null,
  extras = {},
  context = {},
  message = null
} = {}) {
  return hasFreshIulCampaignIntakeMatch({
    campaignIntakeMatch: resolveFreshIulIntakeMatch({
      campaignIntakeMatch,
      extras,
      context,
      message
    })
  });
}

function hasConfirmedIulPolicyReviewAppointment(context = {}) {
  if (context._confirmedPolicyReviewAppointment === false) {
    return false;
  }
  if (context._confirmedPolicyReviewAppointment === true) {
    return Boolean(context.appointment?.appointmentId);
  }
  if (!isIulPolicyReviewContext(context)) {
    return false;
  }
  return isIulBookingComplete(context);
}

function hasPriorIulEpisodeState(context = {}) {
  if (!isIulPolicyReviewContext(context)) {
    const facts = context.knownFacts || {};
    return IUL_EPISODE_FACT_KEYS.some((key) => {
      const value = facts[key];
      if (Array.isArray(value)) {
        return value.length > 0;
      }
      return value != null && value !== false;
    });
  }
  const lastAsk = String(context.conversation?.lastQuestionAsked || "");
  if (lastAsk) {
    return true;
  }
  const lastOffer = String(context.conversation?.lastOfferMade || "");
  if (lastOffer.startsWith("iul_")) {
    return true;
  }
  const stage = String(context.knownFacts?.iulWorkflowStage || "");
  if (stage && stage !== IUL_STAGES.NEW_IUL_LEAD) {
    return true;
  }
  const facts = context.knownFacts || {};
  if (
    IUL_EPISODE_FACT_KEYS.some((key) => {
      const value = facts[key];
      if (Array.isArray(value)) {
        return value.length > 0;
      }
      return value != null && value !== false;
    })
  ) {
    return true;
  }
  const appt = context.appointment || {};
  if (appt.appointmentId || appt.proposedDate || appt.proposedTime) {
    return true;
  }
  if (Array.isArray(appt.previouslyOfferedSlots) && appt.previouslyOfferedSlots.length) {
    return true;
  }
  return false;
}

function shouldResetIulEpisodeForFreshIntake({
  context = {},
  campaignIntakeMatch = null,
  extras = {},
  message = null
} = {}) {
  if (
    !hasFreshIulIntakeSignal({
      campaignIntakeMatch,
      extras,
      context,
      message
    })
  ) {
    return false;
  }
  if (hasConfirmedIulPolicyReviewAppointment(context)) {
    return false;
  }
  return hasPriorIulEpisodeState(context);
}

function emptyIulEpisodeAppointment() {
  return {
    status: APPOINTMENT_STATUS.NONE,
    proposedDate: null,
    proposedDateHistory: [],
    proposedDateLabel: null,
    proposedTime: null,
    proposedTimeHistory: [],
    confirmedDate: null,
    confirmedTime: null,
    meetingType: null,
    location: null,
    appointmentId: null,
    previouslyOfferedSlots: [],
    meetingUrl: null,
    meeting_url: null,
    zoomJoinUrl: null
  };
}

function resetIulEpisodeFacts(context = {}) {
  const persistence = context._persistence
    ? {
        ...context._persistence,
        lastDecisionCode: null
      }
    : context._persistence;
  return {
    ...context,
    currentStage: STAGES.QUALIFICATION,
    knownFacts: {
      ...(context.knownFacts || {}),
      ...IUL_EPISODE_CLEARED_FACTS,
      iulWorkflowStage: IUL_STAGES.NEW_IUL_LEAD
    },
    appointment: emptyIulEpisodeAppointment(),
    conversation: {
      ...(context.conversation || {}),
      lastQuestionAsked: null,
      lastOfferMade: null,
      lastProspectIntent: null,
      pendingClarification: null,
      clarificationCount: 0,
      lastClarificationTemplateKey: null
    },
    _persistence: persistence,
    _iulFreshEpisode: true
  };
}

function resolveIulFreshIntakeEpisode({
  context = {},
  campaignIntakeMatch = null,
  extras = {},
  message = null,
  text = null
} = {}) {
  const inbound = message || (text != null ? { text } : null);
  const match = resolveFreshIulIntakeMatch({
    campaignIntakeMatch,
    extras,
    context,
    message: inbound
  });
  const fresh = hasFreshIulIntakeSignal({
    campaignIntakeMatch: match,
    extras,
    context,
    message: inbound
  });
  if (!fresh) {
    return {
      reset: false,
      alreadyBooked: false,
      context,
      campaignIntakeMatch: match
    };
  }
  if (hasConfirmedIulPolicyReviewAppointment(context)) {
    return {
      reset: false,
      alreadyBooked: true,
      context,
      campaignIntakeMatch: match
    };
  }
  if (!hasPriorIulEpisodeState(context)) {
    return {
      reset: false,
      alreadyBooked: false,
      context,
      campaignIntakeMatch: match
    };
  }
  return {
    reset: true,
    alreadyBooked: false,
    context: resetIulEpisodeFacts(context),
    campaignIntakeMatch: match
  };
}

module.exports = {
  IUL_EPISODE_FACT_KEYS,
  hasFreshIulIntakeSignal,
  hasConfirmedIulPolicyReviewAppointment,
  hasPriorIulEpisodeState,
  shouldResetIulEpisodeForFreshIntake,
  resetIulEpisodeFacts,
  resolveIulFreshIntakeEpisode,
  emptyIulEpisodeAppointment
};
