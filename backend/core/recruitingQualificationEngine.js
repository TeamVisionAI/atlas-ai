/**
 * Sprint 16.1 — AI qualification assessment from conversation profile state.
 */

const {
  buildProfileFromProspect,
  getMissingFields,
  getNextMissingField,
  isScheduleComplete,
  emailRequired,
  getEffectiveInterviewType
} = require("./informationModel");

const WORKFLOW_REQUIREMENT_FIELDS = new Set(["schedule", "email", "interviewType"]);

function profileWithEffectiveInterviewType(profile) {
  if (!profile) {
    return profile;
  }

  if (profile.interviewType) {
    return profile;
  }

  const effectiveType = getEffectiveInterviewType(profile);

  if (!effectiveType) {
    return profile;
  }

  return {
    ...profile,
    interviewType: effectiveType
  };
}

function assessQualificationFromProfile(profile) {
  const normalizedProfile = profileWithEffectiveInterviewType(profile || {});
  const missingFields = getMissingFields(normalizedProfile);
  const preScheduleFields = missingFields.filter(
    (field) => !WORKFLOW_REQUIREMENT_FIELDS.has(field)
  );
  const resolvedInterviewType = getEffectiveInterviewType(normalizedProfile);
  const isQualified =
    preScheduleFields.length === 0 && Boolean(resolvedInterviewType);
  const readyForScheduling =
    isQualified &&
    (missingFields.includes("schedule") || isScheduleComplete(normalizedProfile));
  const isInterviewScheduled = Boolean(
    normalizedProfile?.confirmed ||
      normalizedProfile?.calendarEventId ||
      isScheduleComplete(normalizedProfile || {})
  );

  let confidence = 0.62;

  if (isInterviewScheduled) {
    confidence = 0.96;
  } else if (readyForScheduling) {
    confidence = 0.9;
  } else if (isQualified) {
    confidence = 0.86;
  } else if (preScheduleFields.length <= 2) {
    confidence = 0.74;
  }

  return {
    isQualified,
    readyForScheduling,
    isInterviewScheduled,
    missingFields,
    preScheduleFields,
    confidence,
    nextFocus: getNextMissingField(normalizedProfile) || (missingFields.includes("email") ? "email" : null),
    nextField: getNextMissingField(normalizedProfile)
  };
}

function assessQualificationFromProspect(prospect, channel = "whatsapp") {
  const profile = buildProfileFromProspect(prospect, channel);
  const assessment = assessQualificationFromProfile(profile);

  return assessment;
}

module.exports = {
  assessQualificationFromProfile,
  assessQualificationFromProspect,
  profileWithEffectiveInterviewType,
  WORKFLOW_REQUIREMENT_FIELDS
};
