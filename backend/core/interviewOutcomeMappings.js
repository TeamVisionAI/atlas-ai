/**
 * Interview Outcome Engine — configuration-driven outcome → workflow mapping.
 * Workflow Engine owns transitions; UI consumes this read model only.
 */

const { MILESTONES } = require("./workflowConstants");

const INTERVIEW_OUTCOME_CATEGORIES = Object.freeze([
  {
    id: "recruiting",
    label: "Recruiting",
    outcomes: [
      "Recruited",
      "Pending IBA",
      "Pending License",
      "Orientation Scheduled"
    ]
  },
  {
    id: "client",
    label: "Client",
    outcomes: [
      "Became Client",
      "FNA Scheduled",
      "Application Pending",
      "Policy Submitted"
    ]
  },
  {
    id: "follow_up",
    label: "Follow-Up",
    outcomes: [
      "Thinking About It",
      "Requested More Information",
      "Wants to Talk to Spouse",
      "Call Back Later",
      "Reschedule Interview",
      "No Show"
    ]
  },
  {
    id: "closed",
    label: "Closed",
    outcomes: [
      "Not Interested",
      "Not Qualified",
      "Already Working with Another Company",
      "Unable to Contact"
    ]
  }
]);

const LEGACY_OUTCOME_ALIASES = Object.freeze({
  "Needs More Time": "Thinking About It",
  Rescheduled: "Reschedule Interview"
});

const ORIENTATION_ELIGIBLE_OUTCOMES = new Set([
  "Recruited",
  "Orientation Scheduled"
]);

function defaultFollowUpDate(days = 7) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function buildInterviewDateTime(date, time) {
  if (!date) {
    return null;
  }

  const iso = new Date(`${date}T${time || "09:00"}`).toISOString();
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

const INTERVIEW_OUTCOME_CONFIG = Object.freeze({
  Recruited: {
    label: "Recruited",
    targetMilestone: MILESTONES.ORIENTATION,
    workflowLabel: "Recruiting Onboarding Workflow",
    fields: [
      { key: "orientationDate", type: "date", label: "Orientation Date" },
      { key: "orientationTime", type: "time", label: "Orientation Time" }
    ],
    followUpRecommendation: {
      daysUntilFollowUp: 1,
      reminderSchedule: "1 day before orientation",
      preferredChannel: "whatsapp",
      suggestedScript:
        "Confirm orientation details and share the onboarding checklist."
    },
    buildCapturedFields(form = {}) {
      return {
        outcome: "Recruited",
        orientationScheduled: Boolean(form.orientationDate && form.orientationTime)
      };
    }
  },
  "Pending IBA": {
    label: "Pending IBA",
    targetMilestone: MILESTONES.LICENSING,
    workflowLabel: "Pending IBA Workflow",
    fields: [{ key: "notes", type: "textarea", label: "Notes" }],
    followUpRecommendation: {
      daysUntilFollowUp: 3,
      reminderSchedule: "Every 3 days until IBA complete",
      preferredChannel: "whatsapp",
      suggestedScript: "Check in on IBA paperwork progress and answer questions."
    },
    buildCapturedFields() {
      return { outcome: "Pending IBA" };
    }
  },
  "Pending License": {
    label: "Pending License",
    targetMilestone: MILESTONES.LICENSING,
    workflowLabel: "Pending License Workflow",
    fields: [{ key: "notes", type: "textarea", label: "Notes" }],
    followUpRecommendation: {
      daysUntilFollowUp: 7,
      reminderSchedule: "Weekly until licensed",
      preferredChannel: "whatsapp",
      suggestedScript: "Follow up on licensing steps and exam scheduling."
    },
    buildCapturedFields() {
      return { outcome: "Pending License" };
    }
  },
  "Orientation Scheduled": {
    label: "Orientation Scheduled",
    targetMilestone: MILESTONES.ORIENTATION,
    workflowLabel: "Orientation Workflow",
    fields: [
      { key: "orientationDate", type: "date", label: "Orientation Date" },
      { key: "orientationTime", type: "time", label: "Orientation Time" }
    ],
    followUpRecommendation: {
      daysUntilFollowUp: 1,
      reminderSchedule: "1 day before orientation",
      preferredChannel: "whatsapp",
      suggestedScript: "Confirm attendance and send orientation logistics."
    },
    buildCapturedFields(form = {}) {
      return {
        outcome: "Orientation Scheduled",
        orientationScheduled: Boolean(form.orientationDate && form.orientationTime)
      };
    }
  },
  "Became Client": {
    label: "Became Client",
    targetMilestone: MILESTONES.FAST_START,
    workflowLabel: "Client Workflow",
    fields: [{ key: "notes", type: "textarea", label: "Notes" }],
    followUpRecommendation: {
      daysUntilFollowUp: 2,
      reminderSchedule: "Day 2 service check-in",
      preferredChannel: "whatsapp",
      suggestedScript: "Welcome them as a client and confirm next service steps."
    },
    buildCapturedFields() {
      return { outcome: "Became Client" };
    }
  },
  "FNA Scheduled": {
    label: "FNA Scheduled",
    targetMilestone: MILESTONES.FOLLOW_UP,
    workflowLabel: "Client Workflow",
    fields: [
      { key: "followUpDate", type: "date", label: "FNA Date", defaultDays: 3 },
      { key: "followUpTime", type: "time", label: "FNA Time", defaultValue: "10:00" }
    ],
    followUpRecommendation: {
      daysUntilFollowUp: 3,
      reminderSchedule: "1 day before FNA",
      preferredChannel: "whatsapp",
      suggestedScript: "Confirm FNA appointment and required documents."
    },
    buildCapturedFields(form = {}) {
      return {
        outcome: "FNA Scheduled",
        followUpDate: form.followUpDate || defaultFollowUpDate(3),
        followUpTime: form.followUpTime || "10:00"
      };
    }
  },
  "Application Pending": {
    label: "Application Pending",
    targetMilestone: MILESTONES.LICENSING,
    workflowLabel: "Client Workflow",
    fields: [{ key: "notes", type: "textarea", label: "Notes" }],
    followUpRecommendation: {
      daysUntilFollowUp: 5,
      reminderSchedule: "Every 5 days until submitted",
      preferredChannel: "whatsapp",
      suggestedScript: "Check application status and remove blockers."
    },
    buildCapturedFields() {
      return { outcome: "Application Pending" };
    }
  },
  "Policy Submitted": {
    label: "Policy Submitted",
    targetMilestone: MILESTONES.FAST_START,
    workflowLabel: "Client Workflow",
    fields: [{ key: "notes", type: "textarea", label: "Notes" }],
    followUpRecommendation: {
      daysUntilFollowUp: 7,
      reminderSchedule: "Weekly policy status update",
      preferredChannel: "whatsapp",
      suggestedScript: "Provide policy status update and next steps."
    },
    buildCapturedFields() {
      return { outcome: "Policy Submitted" };
    }
  },
  "Thinking About It": {
    label: "Thinking About It",
    targetMilestone: MILESTONES.FOLLOW_UP,
    workflowLabel: "Follow-Up Workflow",
    fields: [
      { key: "followUpDate", type: "date", label: "Follow Up Date", defaultDays: 3 },
      { key: "followUpTime", type: "time", label: "Follow Up Time", defaultValue: "10:00" }
    ],
    followUpRecommendation: {
      daysUntilFollowUp: 3,
      reminderSchedule: "Day 3 and day 7 reminders",
      preferredChannel: "whatsapp",
      suggestedScript: "Gently follow up and offer to answer remaining questions."
    },
    buildCapturedFields(form = {}) {
      return {
        outcome: "Thinking About It",
        followUpDate: form.followUpDate || defaultFollowUpDate(3),
        followUpTime: form.followUpTime || "10:00"
      };
    }
  },
  "Requested More Information": {
    label: "Requested More Information",
    targetMilestone: MILESTONES.QUALIFICATION,
    workflowLabel: "Follow-Up Workflow",
    fields: [{ key: "notes", type: "textarea", label: "Information Requested" }],
    followUpRecommendation: {
      daysUntilFollowUp: 1,
      reminderSchedule: "Same day if possible",
      preferredChannel: "whatsapp",
      suggestedScript: "Send requested information and confirm they received it."
    },
    buildCapturedFields(form = {}) {
      return {
        outcome: "Requested More Information",
        interactionNotes: form.notes || null
      };
    }
  },
  "Wants to Talk to Spouse": {
    label: "Wants to Talk to Spouse",
    targetMilestone: MILESTONES.FOLLOW_UP,
    workflowLabel: "Follow-Up Workflow",
    fields: [
      { key: "followUpDate", type: "date", label: "Follow Up Date", defaultDays: 7 },
      { key: "followUpTime", type: "time", label: "Follow Up Time", defaultValue: "10:00" }
    ],
    followUpRecommendation: {
      daysUntilFollowUp: 7,
      reminderSchedule: "Day 5 reminder, day 7 follow-up",
      preferredChannel: "whatsapp",
      suggestedScript: "Ask if they had a chance to discuss with their spouse."
    },
    buildCapturedFields(form = {}) {
      return {
        outcome: "Wants to Talk to Spouse",
        followUpDate: form.followUpDate || defaultFollowUpDate(7),
        followUpTime: form.followUpTime || "10:00"
      };
    }
  },
  "Call Back Later": {
    label: "Call Back Later",
    targetMilestone: MILESTONES.FOLLOW_UP,
    workflowLabel: "Follow-Up Workflow",
    fields: [
      { key: "followUpDate", type: "date", label: "Call Back Date", defaultDays: 2 },
      { key: "followUpTime", type: "time", label: "Call Back Time", defaultValue: "10:00" }
    ],
    followUpRecommendation: {
      daysUntilFollowUp: 2,
      reminderSchedule: "Morning of callback",
      preferredChannel: "phone",
      suggestedScript: "Call at the agreed time and reference prior conversation."
    },
    buildCapturedFields(form = {}) {
      return {
        outcome: "Call Back Later",
        followUpDate: form.followUpDate || defaultFollowUpDate(2),
        followUpTime: form.followUpTime || "10:00"
      };
    }
  },
  "Reschedule Interview": {
    label: "Reschedule Interview",
    targetMilestone: MILESTONES.INTERVIEW_SCHEDULED,
    workflowLabel: "Recovery Workflow",
    fields: [
      { key: "rescheduleDate", type: "date", label: "New Interview Date" },
      { key: "rescheduleTime", type: "time", label: "New Interview Time" },
      {
        key: "rescheduleInterviewType",
        type: "select",
        label: "Interview Type",
        options: ["Zoom", "Office"],
        defaultValue: "Zoom"
      }
    ],
    followUpRecommendation: {
      daysUntilFollowUp: 0,
      reminderSchedule: "1 day before interview",
      preferredChannel: "whatsapp",
      suggestedScript: "Confirm the rescheduled interview time and send calendar details."
    },
    buildCapturedFields(form = {}) {
      return {
        interviewDateTime: buildInterviewDateTime(form.rescheduleDate, form.rescheduleTime),
        interviewType: form.rescheduleInterviewType || "Zoom",
        confirmed: true
      };
    }
  },
  "No Show": {
    label: "No Show",
    targetMilestone: MILESTONES.FOLLOW_UP,
    workflowLabel: "Recovery Workflow",
    fields: [
      { key: "followUpDate", type: "date", label: "Follow Up Date", defaultDays: 7 },
      { key: "followUpTime", type: "time", label: "Follow Up Time", defaultValue: "10:00" }
    ],
    followUpRecommendation: {
      daysUntilFollowUp: 7,
      reminderSchedule: "Day 3 and day 7 outreach",
      preferredChannel: "whatsapp",
      suggestedScript: "Check in after the missed interview and offer to reschedule."
    },
    buildCapturedFields(form = {}) {
      return {
        outcome: "No Show",
        followUpDate: form.followUpDate || defaultFollowUpDate(7),
        followUpTime: form.followUpTime || "10:00"
      };
    }
  },
  "Not Interested": {
    label: "Not Interested",
    targetMilestone: MILESTONES.CLOSED,
    workflowLabel: "Closed Workflow",
    fields: [
      { key: "notInterestedReason", type: "textarea", label: "Reason" },
      { key: "futureReminder", type: "date", label: "Optional Future Reminder" }
    ],
    followUpRecommendation: {
      daysUntilFollowUp: null,
      reminderSchedule: "Optional future reminder only",
      preferredChannel: "whatsapp",
      suggestedScript: "Thank them for their time and leave the door open."
    },
    buildCapturedFields(form = {}) {
      return {
        outcome: "Not Interested",
        closureReason: form.notInterestedReason || null,
        futureReminder: form.futureReminder || null
      };
    }
  },
  "Not Qualified": {
    label: "Not Qualified",
    targetMilestone: MILESTONES.CLOSED,
    workflowLabel: "Closed Workflow",
    fields: [{ key: "notInterestedReason", type: "textarea", label: "Reason" }],
    followUpRecommendation: {
      daysUntilFollowUp: null,
      reminderSchedule: "None",
      preferredChannel: "whatsapp",
      suggestedScript: "Document disqualification reason for records."
    },
    buildCapturedFields(form = {}) {
      return {
        outcome: "Not Qualified",
        closureReason: form.notInterestedReason || "Not Qualified"
      };
    }
  },
  "Already Working with Another Company": {
    label: "Already Working with Another Company",
    targetMilestone: MILESTONES.CLOSED,
    workflowLabel: "Closed Workflow",
    fields: [{ key: "notInterestedReason", type: "textarea", label: "Notes" }],
    followUpRecommendation: {
      daysUntilFollowUp: 90,
      reminderSchedule: "Optional 90-day check-in",
      preferredChannel: "whatsapp",
      suggestedScript: "Stay friendly and offer to reconnect if circumstances change."
    },
    buildCapturedFields(form = {}) {
      return {
        outcome: "Already Working with Another Company",
        closureReason: form.notInterestedReason || "Already Working with Another Company"
      };
    }
  },
  "Unable to Contact": {
    label: "Unable to Contact",
    targetMilestone: MILESTONES.CLOSED,
    workflowLabel: "Closed Workflow",
    fields: [{ key: "notInterestedReason", type: "textarea", label: "Contact Attempt Notes" }],
    followUpRecommendation: {
      daysUntilFollowUp: 14,
      reminderSchedule: "Retry in 14 days if policy allows",
      preferredChannel: "phone",
      suggestedScript: "Try alternate contact methods before closing the record."
    },
    buildCapturedFields(form = {}) {
      return {
        outcome: "Unable to Contact",
        closureReason: form.notInterestedReason || "Unable to Contact"
      };
    }
  }
});

function resolveOutcomeId(outcomeId) {
  return LEGACY_OUTCOME_ALIASES[outcomeId] || outcomeId;
}

function getInterviewOutcomeConfig(outcomeId) {
  const resolved = resolveOutcomeId(outcomeId);
  return INTERVIEW_OUTCOME_CONFIG[resolved] || null;
}

function isOrientationEligibleOutcome(outcome) {
  return ORIENTATION_ELIGIBLE_OUTCOMES.has(outcome);
}

function listInterviewOutcomeIds() {
  return INTERVIEW_OUTCOME_CATEGORIES.flatMap((category) => category.outcomes);
}

function buildFollowUpRecommendation(outcomeId, prospect = {}) {
  const config = getInterviewOutcomeConfig(outcomeId);

  if (!config?.followUpRecommendation) {
    return null;
  }

  const recommendation = config.followUpRecommendation;
  const days = recommendation.daysUntilFollowUp;

  return {
    outcome: config.label,
    workflowLabel: config.workflowLabel,
    recommendedFollowUpDate: days === null ? null : defaultFollowUpDate(days),
    reminderSchedule: recommendation.reminderSchedule,
    preferredChannel:
      prospect?.preferred_communication_channel?.toLowerCase() === "phone"
        ? "phone"
        : recommendation.preferredChannel,
    suggestedScript: recommendation.suggestedScript.replace(
      "{name}",
      prospect?.first_name || prospect?.name || "there"
    )
  };
}

function buildInterviewOutcomeReadModel(prospect = null) {
  const categories = INTERVIEW_OUTCOME_CATEGORIES.map((category) => ({
    id: category.id,
    label: category.label,
    outcomes: category.outcomes.map((outcomeId) => {
      const config = getInterviewOutcomeConfig(outcomeId);

      return {
        id: outcomeId,
        label: config?.label || outcomeId,
        workflowLabel: config?.workflowLabel || null,
        fields: config?.fields || [],
        followUpRecommendation: buildFollowUpRecommendation(outcomeId, prospect)
      };
    })
  }));

  return {
    categories,
    legacyAliases: { ...LEGACY_OUTCOME_ALIASES }
  };
}

function resolveInterviewAdvancePayload(outcomeId, formState = {}) {
  const config = getInterviewOutcomeConfig(outcomeId);

  if (!config) {
    throw new Error(`Unsupported interview outcome: ${outcomeId}`);
  }

  const capturedFields = config.buildCapturedFields(formState);

  Object.keys(capturedFields).forEach((key) => {
    if (capturedFields[key] === undefined) {
      delete capturedFields[key];
    }
  });

  if (formState.notes && !capturedFields.interactionNotes) {
    capturedFields.interactionNotes = formState.notes;
  }

  return {
    targetMilestone: config.targetMilestone,
    workflowLabel: config.workflowLabel,
    capturedFields,
    interactionNotes:
      capturedFields.interactionNotes ||
      `Interview completed. Outcome: ${config.label}.`
  };
}

module.exports = {
  INTERVIEW_OUTCOME_CATEGORIES,
  INTERVIEW_OUTCOME_CONFIG,
  LEGACY_OUTCOME_ALIASES,
  resolveOutcomeId,
  getInterviewOutcomeConfig,
  isOrientationEligibleOutcome,
  listInterviewOutcomeIds,
  buildFollowUpRecommendation,
  buildInterviewOutcomeReadModel,
  resolveInterviewAdvancePayload,
  defaultFollowUpDate
};
