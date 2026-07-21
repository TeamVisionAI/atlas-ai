/**
 * Sprint 13.1 — Team Vision recruiting workflow states.
 */

const RecruitingState = Object.freeze({
  NEW_LEAD: "NEW_LEAD",
  GREETING: "GREETING",
  LOCATION_COLLECTED: "LOCATION_COLLECTED",
  WORK_AUTHORIZATION_VERIFIED: "WORK_AUTHORIZATION_VERIFIED",
  OPPORTUNITY_EXPLAINED: "OPPORTUNITY_EXPLAINED",
  CONTACT_INFORMATION_COLLECTED: "CONTACT_INFORMATION_COLLECTED",
  INTERVIEW_TYPE_SELECTED: "INTERVIEW_TYPE_SELECTED",
  INTERVIEW_SCHEDULED: "INTERVIEW_SCHEDULED",
  REMINDER_SEQUENCE: "REMINDER_SEQUENCE",
  INTERVIEW_COMPLETED: "INTERVIEW_COMPLETED"
});

const RECRUITING_STATE_ORDER = Object.freeze([
  RecruitingState.NEW_LEAD,
  RecruitingState.GREETING,
  RecruitingState.LOCATION_COLLECTED,
  RecruitingState.WORK_AUTHORIZATION_VERIFIED,
  RecruitingState.OPPORTUNITY_EXPLAINED,
  RecruitingState.CONTACT_INFORMATION_COLLECTED,
  RecruitingState.INTERVIEW_TYPE_SELECTED,
  RecruitingState.INTERVIEW_SCHEDULED,
  RecruitingState.REMINDER_SEQUENCE,
  RecruitingState.INTERVIEW_COMPLETED
]);

const TEAM_VISION_RECRUITING_WORKFLOW = Object.freeze({
  name: "TeamVisionRecruitingWorkflow",
  version: "1.0.0",
  description: "Guides a prospect from first contact through interview scheduling.",
  supportedChannels: Object.freeze(["messenger", "instagram", "atlas-chat"]),
  futureChannels: Object.freeze(["whatsapp", "sms", "email"])
});

module.exports = {
  RecruitingState,
  RECRUITING_STATE_ORDER,
  TEAM_VISION_RECRUITING_WORKFLOW
};
