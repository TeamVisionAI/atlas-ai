/**
 * Sprint 8A.3 — BR-037 Milestone Validation.
 * Required fields and allowed transitions live in the Workflow Engine (not frontend).
 */

const {
  MILESTONES,
  OWNERSHIP
} = require("./workflowConstants");
const {
  buildProfileFromProspect,
  mergeProfile,
  getMissingFields,
  getEffectiveInterviewType,
  emailRequired,
  isScheduleComplete
} = require("./informationModel");

/**
 * Fields that must be satisfied (directly or via capturedFields merge) to enter a milestone.
 * Keys use capturedFields / profile vocabulary.
 */
const MILESTONE_REQUIRED_FIELDS = Object.freeze({
  [MILESTONES.NEW_LEAD]: ["phone"],
  [MILESTONES.GREETING_SENT]: ["phone"],
  [MILESTONES.QUALIFICATION]: ["phone", "city"],
  [MILESTONES.INTERVIEW_READY]: [
    "city",
    "state",
    "authorization",
    "occupation"
  ],
  [MILESTONES.INTERVIEW_SCHEDULED]: [
    "city",
    "state",
    "authorization",
    "occupation",
    "interviewDateTime"
  ],
  [MILESTONES.INTERVIEW_DUE]: [
    "city",
    "state",
    "authorization",
    "occupation",
    "interviewDateTime",
    "confirmed"
  ],
  [MILESTONES.INTERVIEW_COMPLETED]: ["interviewDateTime"],
  [MILESTONES.INTERVIEW_RESULT_PENDING]: ["interviewDateTime", "outcome"],
  [MILESTONES.FOLLOW_UP]: ["followUpDate"],
  [MILESTONES.ORIENTATION]: [],
  [MILESTONES.LICENSING]: ["outcome"],
  [MILESTONES.FAST_START]: ["outcome"],
  [MILESTONES.CLOSED]: [],
  [MILESTONES.DO_NOT_CONTACT]: []
});

/**
 * Documented allowed-next milestones (MILESTONE_DEFINITIONS.md).
 * BR-035 permits human jump to any non-terminal target when BR-037 validation passes.
 */
const ALLOWED_TRANSITIONS = Object.freeze({
  [MILESTONES.NEW_LEAD]: [
    MILESTONES.GREETING_SENT,
    MILESTONES.QUALIFICATION,
    MILESTONES.DO_NOT_CONTACT,
    MILESTONES.CLOSED
  ],
  [MILESTONES.GREETING_SENT]: [
    MILESTONES.QUALIFICATION,
    MILESTONES.INTERVIEW_READY,
    MILESTONES.CLOSED,
    MILESTONES.DO_NOT_CONTACT
  ],
  [MILESTONES.QUALIFICATION]: [
    MILESTONES.INTERVIEW_READY,
    MILESTONES.INTERVIEW_SCHEDULED,
    MILESTONES.FOLLOW_UP,
    MILESTONES.CLOSED,
    MILESTONES.DO_NOT_CONTACT
  ],
  [MILESTONES.INTERVIEW_READY]: [
    MILESTONES.INTERVIEW_SCHEDULED,
    MILESTONES.FOLLOW_UP,
    MILESTONES.CLOSED,
    MILESTONES.DO_NOT_CONTACT
  ],
  [MILESTONES.INTERVIEW_SCHEDULED]: [
    MILESTONES.INTERVIEW_DUE,
    MILESTONES.FOLLOW_UP,
    MILESTONES.CLOSED,
    MILESTONES.DO_NOT_CONTACT
  ],
  [MILESTONES.INTERVIEW_DUE]: [
    MILESTONES.INTERVIEW_COMPLETED,
    MILESTONES.FOLLOW_UP
  ],
  [MILESTONES.INTERVIEW_COMPLETED]: [
    MILESTONES.INTERVIEW_RESULT_PENDING
  ],
  [MILESTONES.INTERVIEW_RESULT_PENDING]: [
    MILESTONES.FOLLOW_UP,
    MILESTONES.ORIENTATION,
    MILESTONES.CLOSED,
    MILESTONES.QUALIFICATION
  ],
  [MILESTONES.FOLLOW_UP]: [
    MILESTONES.QUALIFICATION,
    MILESTONES.INTERVIEW_SCHEDULED,
    MILESTONES.CLOSED
  ],
  [MILESTONES.ORIENTATION]: [
    MILESTONES.LICENSING,
    MILESTONES.FAST_START,
    MILESTONES.CLOSED
  ],
  [MILESTONES.LICENSING]: [MILESTONES.FAST_START, MILESTONES.CLOSED],
  [MILESTONES.FAST_START]: [MILESTONES.CLOSED],
  [MILESTONES.CLOSED]: [],
  [MILESTONES.DO_NOT_CONTACT]: []
});

const TERMINAL_MILESTONES = new Set([
  MILESTONES.CLOSED,
  MILESTONES.DO_NOT_CONTACT
]);

function normalizeCapturedFields(raw = {}) {
  const fields = { ...raw };

  if (fields.workAuthorized !== undefined && fields.authorization === undefined) {
    fields.authorization = fields.workAuthorized;
  }

  if (fields.interviewTime && !fields.interviewDateTime) {
    fields.interviewDateTime = fields.interviewTime;
  }

  if (fields.appointmentDate && fields.preferredTime && !fields.interviewDateTime) {
    fields.interviewDateTime = fields.preferredTime;
  }

  return fields;
}

function capturedFieldsToProfilePatch(capturedFields = {}) {
  const fields = normalizeCapturedFields(capturedFields);
  const patch = {};

  if (fields.city !== undefined) patch.city = fields.city;
  if (fields.state !== undefined) patch.state = fields.state;
  if (fields.authorization !== undefined) patch.authorization = fields.authorization;
  if (fields.occupation !== undefined) patch.occupation = fields.occupation;
  if (fields.interviewType !== undefined) patch.interviewType = fields.interviewType;
  if (fields.email !== undefined) patch.email = fields.email;

  if (fields.interviewDateTime) {
    const parsed = Date.parse(fields.interviewDateTime);

    if (!Number.isNaN(parsed)) {
      patch.preferredTime = fields.interviewDateTime;
      patch.appointmentDate = fields.appointmentDate || fields.interviewDateTime.slice(0, 10);
      patch.confirmed = fields.confirmed !== false;
    }
  } else if (fields.appointmentDate && fields.preferredTime) {
    patch.appointmentDate = fields.appointmentDate;
    patch.preferredTime = fields.preferredTime;
    patch.confirmed = fields.confirmed !== false;
  }

  return patch;
}

function buildMergedContext(prospect, capturedFields = {}) {
  const profile = buildProfileFromProspect(prospect);
  const patch = capturedFieldsToProfilePatch(capturedFields);
  const mergedProfile = mergeProfile(profile, patch);

  return {
    profile: mergedProfile,
    patch,
    fields: {
      phone: prospect?.phone || capturedFields.phone || null,
      city: mergedProfile.city,
      state: mergedProfile.state,
      authorization: mergedProfile.authorization,
      occupation: mergedProfile.occupation,
      interviewType: mergedProfile.interviewType || getEffectiveInterviewType(mergedProfile),
      email: mergedProfile.email,
      interviewDateTime: mergedProfile.preferredTime || capturedFields.interviewDateTime || null,
      appointmentDate: mergedProfile.appointmentDate,
      confirmed: mergedProfile.confirmed || mergedProfile.calendarEventId,
      outcome: capturedFields.outcome || null,
      followUpDate: capturedFields.followUpDate || null,
      followUpTime: capturedFields.followUpTime || null,
      closureReason:
        capturedFields.closureReason || capturedFields.notInterestedReason || null
    }
  };
}

function isTransitionAllowed(currentMilestone, targetMilestone) {
  if (!Object.values(MILESTONES).includes(targetMilestone)) {
    return false;
  }

  if (targetMilestone === MILESTONES.NEW_LEAD) {
    return false;
  }

  if (TERMINAL_MILESTONES.has(currentMilestone)) {
    return false;
  }

  if (currentMilestone === targetMilestone) {
    return true;
  }

  const documented = ALLOWED_TRANSITIONS[currentMilestone] || [];

  if (documented.includes(targetMilestone)) {
    return true;
  }

  // BR-035 — human may jump forward/back within active workflow when validation passes.
  if (!TERMINAL_MILESTONES.has(targetMilestone)) {
    return true;
  }

  return documented.includes(targetMilestone);
}

function validateRequiredFields(targetMilestone, context) {
  const errors = [];
  const missingFields = [];
  const { fields, profile } = context;

  const required = MILESTONE_REQUIRED_FIELDS[targetMilestone] || [];

  for (const field of required) {
    const value = fields[field];

    if (value === null || value === undefined || value === "") {
      missingFields.push(field);
      errors.push({
        code: "REQUIRED_FIELD_MISSING",
        field,
        message: `Required field "${field}" is missing for milestone ${targetMilestone}.`
      });
    }
  }

  if (
    targetMilestone === MILESTONES.INTERVIEW_READY ||
    targetMilestone === MILESTONES.INTERVIEW_SCHEDULED ||
    targetMilestone === MILESTONES.INTERVIEW_DUE
  ) {
    const qualMissing = getMissingFields(profile);

    for (const field of qualMissing) {
      if (!missingFields.includes(field)) {
        missingFields.push(field);
        errors.push({
          code: "QUALIFICATION_INCOMPLETE",
          field,
          message: `Qualification field "${field}" is required before ${targetMilestone}.`
        });
      }
    }
  }

  if (
    [MILESTONES.INTERVIEW_SCHEDULED, MILESTONES.INTERVIEW_DUE].includes(
      targetMilestone
    ) &&
    emailRequired(profile) &&
    !fields.email
  ) {
    if (!missingFields.includes("email")) {
      missingFields.push("email");
      errors.push({
        code: "EMAIL_REQUIRED",
        field: "email",
        message: "Email is required for Zoom interviews."
      });
    }
  }

  if (
    targetMilestone === MILESTONES.INTERVIEW_SCHEDULED &&
    !isScheduleComplete(profile) &&
    !fields.interviewDateTime
  ) {
    if (!missingFields.includes("interviewDateTime")) {
      missingFields.push("interviewDateTime");
    }
  }

  if (targetMilestone === MILESTONES.ORIENTATION && fields.outcome && fields.outcome !== "Recruited") {
    errors.push({
      code: "INVALID_OUTCOME",
      field: "outcome",
      message: 'Outcome must be "Recruited" for ORIENTATION milestone.'
    });
  }

  if (
    targetMilestone === MILESTONES.INTERVIEW_RESULT_PENDING &&
    !fields.outcome
  ) {
    missingFields.push("outcome");
    errors.push({
      code: "REQUIRED_FIELD_MISSING",
      field: "outcome",
      message: "Interview outcome is required for INTERVIEW_RESULT_PENDING."
    });
  }

  return { errors, missingFields };
}

/**
 * Validates a human advancement request (BR-035 + BR-037).
 */
function validateMilestoneAdvancement({
  currentMilestone,
  targetMilestone,
  prospect,
  capturedFields = {}
}) {
  if (!targetMilestone) {
    return {
      valid: false,
      invalidTransition: false,
      errors: [
        {
          code: "TARGET_MILESTONE_REQUIRED",
          field: "targetMilestone",
          message: "targetMilestone is required."
        }
      ],
      missingFields: []
    };
  }

  if (!Object.values(MILESTONES).includes(targetMilestone)) {
    return {
      valid: false,
      invalidTransition: false,
      errors: [
        {
          code: "UNKNOWN_MILESTONE",
          field: "targetMilestone",
          message: `Unknown milestone "${targetMilestone}".`
        }
      ],
      missingFields: []
    };
  }

  const transitionAllowed = isTransitionAllowed(currentMilestone, targetMilestone);

  if (!transitionAllowed) {
    return {
      valid: false,
      invalidTransition: true,
      errors: [
        {
          code: "INVALID_TRANSITION",
          field: "targetMilestone",
          message: `Transition from ${currentMilestone} to ${targetMilestone} is not allowed.`
        }
      ],
      missingFields: []
    };
  }

  const context = buildMergedContext(prospect, capturedFields);
  const { errors, missingFields } = validateRequiredFields(targetMilestone, context);

  return {
    valid: errors.length === 0,
    invalidTransition: false,
    errors,
    missingFields,
    mergedProfile: context.profile,
    mergedFields: context.fields
  };
}

module.exports = {
  MILESTONE_REQUIRED_FIELDS,
  ALLOWED_TRANSITIONS,
  normalizeCapturedFields,
  capturedFieldsToProfilePatch,
  buildMergedContext,
  isTransitionAllowed,
  validateRequiredFields,
  validateMilestoneAdvancement
};
