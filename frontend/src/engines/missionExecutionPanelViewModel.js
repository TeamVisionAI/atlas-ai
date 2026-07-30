import { formatAtlasDateTime } from "../utils/dateFormatter";

const MISSION_TYPES = Object.freeze({
  SCHEDULE_INTERVIEW: "ScheduleInterview",
  ENTER_INTERVIEW_OUTCOME: "EnterInterviewOutcome",
  COMPLETE_QUALIFICATION: "CompleteQualification",
  FOLLOW_UP: "FollowUp",
  RECRUIT_PROSPECT: "RecruitProspect",
  BEGIN_ONBOARDING: "BeginOnboarding",
  CALL_PROSPECT: "CallProspect",
  REVIEW_PROSPECT: "ReviewProspect",
  RESCHEDULE_INTERVIEW: "RescheduleInterview"
});

const SKIPPED_QUALIFICATION_FIELDS = new Set(["dayPart", "day_part", "preferredPeriod"]);

function formatWorkAuthorization(value, translate) {
  if (value === true) {
    return translate("missionControlSnapshotWorkAuthYes");
  }

  if (value === false) {
    return translate("missionControlSnapshotWorkAuthNo");
  }

  return null;
}

function formatInterviewSchedule(workspace) {
  const raw =
    workspace?.conversation?.interviewTime ||
    workspace?.conversation?.appointmentDate ||
    workspace?.raw?.prospect?.appointment_date ||
    workspace?.raw?.prospect?.interview_time;

  if (!raw) {
    return null;
  }

  const parsed = Date.parse(raw);

  if (Number.isNaN(parsed)) {
    return null;
  }

  return formatAtlasDateTime(new Date(parsed));
}

function resolveMissionType(primaryMission, workspace) {
  if (primaryMission?.missionType) {
    return primaryMission.missionType;
  }

  if (workspace?.workflowGate?.active) {
    return MISSION_TYPES.ENTER_INTERVIEW_OUTCOME;
  }

  const requiredInputs = workspace?.conversationOutcome?.requiredInputs || [];

  if (requiredInputs.length > 0) {
    return MISSION_TYPES.COMPLETE_QUALIFICATION;
  }

  return MISSION_TYPES.REVIEW_PROSPECT;
}

function buildChecklistItem({ id, label, status, actionId, scrollTarget = null }) {
  return {
    id,
    label,
    status,
    actionId: actionId || null,
    scrollTarget
  };
}

function getRequiredQualificationInputs(workspace) {
  return (workspace?.conversationOutcome?.requiredInputs || []).filter(
    (input) => input?.key && !SKIPPED_QUALIFICATION_FIELDS.has(input.key)
  );
}

function buildInterviewOutcomeChecklist(translate) {
  return [
    buildChecklistItem({
      id: "record-outcome",
      label: translate("missionChecklistRecordOutcome"),
      status: "current",
      actionId: "enter_interview_outcome",
      scrollTarget: "workflow-outcome-gate"
    })
  ];
}

function buildInterviewOutcomeBrief(translate) {
  return [
    translate("missionBriefInterviewOutcomeIntro"),
    translate("missionBriefOutcomeRecruited"),
    translate("missionBriefOutcomeNeedsMoreTime"),
    translate("missionBriefOutcomeNoShow"),
    translate("missionBriefOutcomeNotInterested")
  ];
}

function buildScheduleInterviewChecklist(translate) {
  return [
    buildChecklistItem({
      id: "schedule-interview",
      label: translate("missionChecklistScheduleInterview"),
      status: "current",
      actionId: "schedule"
    })
  ];
}

function buildScheduleInterviewBrief(workspace, translate) {
  const lines = [translate("missionBriefScheduleIntro")];
  const interviewType = workspace?.prospect?.interviewType;

  if (interviewType) {
    lines.push(
      translate("missionBriefScheduleInterviewType", { interviewType })
    );
  }

  return lines;
}

function buildQualificationChecklist(workspace, translate) {
  const requiredInputs = getRequiredQualificationInputs(workspace);

  if (!requiredInputs.length) {
    return [
      buildChecklistItem({
        id: "complete-qualification",
        label: translate("missionChecklistCompleteQualification"),
        status: "current",
        actionId: "qualification",
        scrollTarget: "qualification-form"
      })
    ];
  }

  return requiredInputs.map((input, index) =>
    buildChecklistItem({
      id: `qual-${input.key}`,
      label: input.label || translate(`conversationOutcomeField${capitalizeFieldKey(input.key)}`) || input.key,
      status: index === 0 ? "current" : "pending",
      actionId: "qualification",
      scrollTarget: "qualification-form"
    })
  );
}

function capitalizeFieldKey(key) {
  return String(key || "")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function buildQualificationBrief(workspace, translate) {
  const requiredInputs = getRequiredQualificationInputs(workspace);

  if (!requiredInputs.length) {
    return [translate("missionBriefQualificationIntro")];
  }

  const fieldLabels = requiredInputs
    .map((input) => input.label)
    .filter(Boolean)
    .join(", ");

  return [
    translate("missionBriefQualificationIntro"),
    translate("missionBriefQualificationFields", { fields: fieldLabels })
  ];
}

function buildFollowUpChecklist(primaryMission, translate) {
  const actionId = primaryMission?.primaryAction?.id || "whatsapp";

  return [
    buildChecklistItem({
      id: "follow-up-contact",
      label: translate("missionChecklistFollowUpContact"),
      status: "current",
      actionId
    })
  ];
}

function buildFollowUpBrief(translate) {
  return [
    translate("missionBriefFollowUpIntro"),
    translate("missionBriefFollowUpTip")
  ];
}

function buildRecruitProspectChecklist(primaryMission, translate) {
  const actionId = primaryMission?.primaryAction?.id || "schedule";

  return [
    buildChecklistItem({
      id: "recruit-next-step",
      label: translate("missionChecklistScheduleOrientation"),
      status: "current",
      actionId
    })
  ];
}

function buildRecruitProspectBrief(translate) {
  return [
    translate("missionBriefRecruitedIntro"),
    translate("missionBriefRecruitedOrientation")
  ];
}

function buildBeginOnboardingBrief(translate) {
  return [
    translate("missionBriefOnboardingIntro"),
    translate("missionBriefOnboardingPrepare")
  ];
}

function buildContactProspectChecklist(primaryMission, translate) {
  const actionId = primaryMission?.primaryAction?.id || "whatsapp";

  return [
    buildChecklistItem({
      id: "contact-prospect",
      label: translate("missionChecklistContactProspect"),
      status: "current",
      actionId
    })
  ];
}

function buildContactProspectBrief(translate) {
  return [
    translate("missionBriefContactIntro"),
    translate("missionBriefContactTip")
  ];
}

function buildReviewProspectChecklist(primaryMission, translate) {
  const primaryAction = primaryMission?.primaryAction;

  if (!primaryAction?.id) {
    return [];
  }

  const label =
    primaryAction.id === "send_zoom_link" || primaryAction.id === "send_office_location"
      ? translate("missionChecklistSendInvitation")
      : primaryAction.label || translate("missionChecklistReviewNextStep");

  return [
    buildChecklistItem({
      id: `review-${primaryAction.id}`,
      label,
      status: "current",
      actionId: primaryAction.id
    })
  ];
}

function buildReviewProspectBrief(primaryMission, workspace, translate) {
  const actionId = primaryMission?.primaryAction?.id;
  const interviewTime = formatInterviewSchedule(workspace);

  if (actionId === "send_zoom_link") {
    const lines = [translate("missionBriefSendZoomIntro")];

    if (interviewTime) {
      lines.push(translate("missionBriefInterviewScheduled", { interviewTime }));
    }

    return lines;
  }

  if (actionId === "send_office_location") {
    const lines = [translate("missionBriefSendOfficeIntro")];

    if (interviewTime) {
      lines.push(translate("missionBriefInterviewScheduled", { interviewTime }));
    }

    return lines;
  }

  if (primaryMission?.reason) {
    return [primaryMission.reason];
  }

  return [translate("missionBriefReviewIntro")];
}

function buildMissionPrimaryChecklist(primaryMission, translate) {
  const primaryAction = primaryMission?.primaryAction;

  if (!primaryAction?.id) {
    return [];
  }

  return [
    buildChecklistItem({
      id: `mission-${primaryAction.id}`,
      label: primaryAction.label || primaryMission.title,
      status: "current",
      actionId: primaryAction.id
    })
  ];
}

function buildMissionPrimaryBrief(primaryMission, translate) {
  if (primaryMission?.reason) {
    return [primaryMission.reason];
  }

  return [translate("missionBriefDefault")];
}

/**
 * Stage-specific checklist — only tasks for the active mission.
 */
export function buildStageChecklistItems(workspace, primaryMission, translate) {
  const missionType = resolveMissionType(primaryMission, workspace);

  switch (missionType) {
    case MISSION_TYPES.ENTER_INTERVIEW_OUTCOME:
      return buildInterviewOutcomeChecklist(translate);

    case MISSION_TYPES.SCHEDULE_INTERVIEW:
      return buildScheduleInterviewChecklist(translate);

    case MISSION_TYPES.COMPLETE_QUALIFICATION:
      return buildQualificationChecklist(workspace, translate);

    case MISSION_TYPES.FOLLOW_UP:
      return buildFollowUpChecklist(primaryMission, translate);

    case MISSION_TYPES.RECRUIT_PROSPECT:
      return buildRecruitProspectChecklist(primaryMission, translate);

    case MISSION_TYPES.BEGIN_ONBOARDING:
      return [
        buildChecklistItem({
          id: "prepare-onboarding",
          label: translate("missionChecklistPrepareOnboarding"),
          status: "current",
          actionId: primaryMission?.primaryAction?.id || "notes"
        })
      ];

    case MISSION_TYPES.CALL_PROSPECT:
      return buildContactProspectChecklist(primaryMission, translate);

    case MISSION_TYPES.REVIEW_PROSPECT:
      return buildReviewProspectChecklist(primaryMission, translate);

    default:
      return buildMissionPrimaryChecklist(primaryMission, translate);
  }
}

/**
 * Stage-specific recruiter brief — coaching aligned to the active mission only.
 */
export function buildStageRecruiterBrief(workspace, primaryMission, translate) {
  const missionType = resolveMissionType(primaryMission, workspace);

  switch (missionType) {
    case MISSION_TYPES.ENTER_INTERVIEW_OUTCOME:
      return buildInterviewOutcomeBrief(translate);

    case MISSION_TYPES.SCHEDULE_INTERVIEW:
      return buildScheduleInterviewBrief(workspace, translate);

    case MISSION_TYPES.COMPLETE_QUALIFICATION:
      return buildQualificationBrief(workspace, translate);

    case MISSION_TYPES.FOLLOW_UP:
      return buildFollowUpBrief(translate);

    case MISSION_TYPES.RECRUIT_PROSPECT:
      return buildRecruitProspectBrief(translate);

    case MISSION_TYPES.BEGIN_ONBOARDING:
      return buildBeginOnboardingBrief(translate);

    case MISSION_TYPES.CALL_PROSPECT:
      return buildContactProspectBrief(translate);

    case MISSION_TYPES.REVIEW_PROSPECT:
      return buildReviewProspectBrief(primaryMission, workspace, translate);

    default:
      return buildMissionPrimaryBrief(primaryMission, translate);
  }
}

/**
 * Key prospect facts for Mission Control execution context — not message history.
 */
export function buildProspectSnapshotFields(workspace, translate) {
  if (!workspace) {
    return [];
  }

  const fields = [
    {
      id: "location",
      label: translate("missionControlSnapshotLocation"),
      value: workspace.prospect?.location
    },
    {
      id: "language",
      label: translate("conversationOutcomeFieldLanguage"),
      value: workspace.prospect?.language
    },
    {
      id: "interviewType",
      label: translate("missionControlSnapshotInterviewType"),
      value: workspace.prospect?.interviewType
    },
    {
      id: "interviewTime",
      label: translate("missionControlSnapshotInterviewTime"),
      value: formatInterviewSchedule(workspace)
    },
    {
      id: "workAuthorization",
      label: translate("conversationOutcomeFieldWorkAuthorization"),
      value: formatWorkAuthorization(workspace.businessRules?.workAuthorization, translate)
    },
    {
      id: "milestone",
      label: translate("missionControlSnapshotStage"),
      value: workspace.prospect?.milestone
    }
  ];

  return fields.filter((field) => field.value && field.value !== "—");
}

export { MISSION_TYPES };
