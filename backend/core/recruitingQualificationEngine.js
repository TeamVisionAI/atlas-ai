/**
 * Sprint 16.1 — AI qualification assessment from conversation profile state.
 */

const {
  buildProfileFromProspect,
  getMissingFields,
  isScheduleComplete,
  emailRequired
} = require("./informationModel");

function assessQualificationFromProfile(profile) {
  const missingFields = getMissingFields(profile || {});
  const preScheduleFields = missingFields.filter(
    (field) => field !== "schedule" && field !== "email"
  );
  const isQualified = preScheduleFields.length === 0 && Boolean(profile?.interviewType);
  const readyForScheduling =
    isQualified &&
    (missingFields.includes("schedule") || isScheduleComplete(profile || {}));
  const isInterviewScheduled = Boolean(
    profile?.confirmed || profile?.calendarEventId || isScheduleComplete(profile || {})
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
    nextFocus: preScheduleFields[0] || (missingFields.includes("schedule") ? "schedule" : null)
  };
}

function assessQualificationFromProspect(prospect, channel = "whatsapp") {
  const profile = buildProfileFromProspect(prospect, channel);
  const assessment = assessQualificationFromProfile(profile);

  if (emailRequired(profile) && !profile.email && assessment.isQualified) {
    return {
      ...assessment,
      readyForScheduling: false,
      nextFocus: "email"
    };
  }

  return assessment;
}

module.exports = {
  assessQualificationFromProfile,
  assessQualificationFromProspect
};
