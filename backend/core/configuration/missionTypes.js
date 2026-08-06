/**
 * Sprint 18.3 — Generic mission types for Mission Engine.
 * Extensible registry — no interview-specific engine logic here.
 */

const MISSION_TYPES = Object.freeze({
  SCHEDULE_INTERVIEW: "ScheduleInterview",
  ENTER_INTERVIEW_OUTCOME: "EnterInterviewOutcome",
  COMPLETE_QUALIFICATION: "CompleteQualification",
  FOLLOW_UP: "FollowUp",
  RECRUIT_PROSPECT: "RecruitProspect",
  BEGIN_ONBOARDING: "BeginOnboarding",
  CALL_PROSPECT: "CallProspect",
  REVIEW_PROSPECT: "ReviewProspect",
  RESCHEDULE_INTERVIEW: "RescheduleInterview",
  SEND_LICENSING_PACKET: "SendLicensingPacket",
  COMPLETE_ORIENTATION: "CompleteOrientation",
  REVIEW_FNA: "ReviewFNA",
  POLICY_DELIVERY: "PolicyDelivery",
  // Implements BR-080 — durable new-lead / unassigned / unacknowledged attention.
  NEW_LEAD_ATTENTION: "NewLeadAttention"
});

const MISSION_TYPE_VALUES = Object.freeze(Object.values(MISSION_TYPES));

const MISSION_STATUS = Object.freeze({
  PENDING: "pending",
  COMPLETED: "completed",
  BLOCKED: "blocked"
});

function isValidMissionType(type) {
  return MISSION_TYPE_VALUES.includes(type);
}

function parseMissionId(missionId) {
  if (!missionId || typeof missionId !== "string") {
    return null;
  }

  const separatorIndex = missionId.indexOf(":");

  if (separatorIndex <= 0) {
    return null;
  }

  const prospectId = missionId.slice(0, separatorIndex);
  const missionType = missionId.slice(separatorIndex + 1);

  if (!isValidMissionType(missionType)) {
    return null;
  }

  return { prospectId, missionType };
}

function buildMissionId(prospectId, missionType) {
  return `${prospectId}:${missionType}`;
}

module.exports = {
  MISSION_TYPES,
  MISSION_TYPE_VALUES,
  MISSION_STATUS,
  isValidMissionType,
  parseMissionId,
  buildMissionId
};
