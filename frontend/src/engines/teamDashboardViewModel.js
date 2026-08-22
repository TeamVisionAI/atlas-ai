/**
 * Team Dashboard — action-first presentation view model.
 * Derives UI from scoped dashboard API payloads only (no new business rules).
 * Implements BR-149 scope contract: data is already hierarchy-filtered server-side.
 */

import { appPath } from "../config/appRoutes.js";
import { EXECUTIVE_FILTERS, buildMissionControlPath } from "./executiveFilterEngine.js";

function buildProspectWorkspacePathFromPhone(phone) {
  if (!phone) {
    return appPath("prospect-workspace");
  }

  return appPath(`prospect-workspace/${encodeURIComponent(phone)}`);
}

function getTeamGreetingKey() {
  const hour = new Date().getHours();

  if (hour < 12) {
    return "teamDashGreetingMorning";
  }

  if (hour < 17) {
    return "teamDashGreetingAfternoon";
  }

  return "teamDashGreetingEvening";
}

const MILESTONES = Object.freeze({
  NEW_LEAD: "NEW_LEAD",
  GREETING_SENT: "GREETING_SENT",
  QUALIFICATION: "QUALIFICATION",
  INTERVIEW_READY: "INTERVIEW_READY",
  INTERVIEW_SCHEDULED: "INTERVIEW_SCHEDULED",
  INTERVIEW_DUE: "INTERVIEW_DUE",
  INTERVIEW_COMPLETED: "INTERVIEW_COMPLETED",
  INTERVIEW_RESULT_PENDING: "INTERVIEW_RESULT_PENDING",
  FOLLOW_UP: "FOLLOW_UP",
  ORIENTATION: "ORIENTATION",
  LICENSING: "LICENSING",
  FAST_START: "FAST_START"
});

const PIPELINE_STAGES = Object.freeze([
  {
    key: "new",
    labelKey: "teamDashPipelineNew",
    milestones: [MILESTONES.NEW_LEAD, MILESTONES.GREETING_SENT],
    filter: EXECUTIVE_FILTERS.NEW_UNACKNOWLEDGED
  },
  {
    key: "qualified",
    labelKey: "teamDashPipelineQualified",
    milestones: [MILESTONES.QUALIFICATION, MILESTONES.INTERVIEW_READY],
    filter: EXECUTIVE_FILTERS.HIGH_PRIORITY
  },
  {
    key: "scheduled",
    labelKey: "teamDashPipelineScheduled",
    milestones: [MILESTONES.INTERVIEW_SCHEDULED, MILESTONES.INTERVIEW_DUE],
    filter: EXECUTIVE_FILTERS.INTERVIEWS_TODAY
  },
  {
    key: "interviewed",
    labelKey: "teamDashPipelineInterviewed",
    milestones: [MILESTONES.INTERVIEW_COMPLETED, MILESTONES.INTERVIEW_RESULT_PENDING],
    filter: EXECUTIVE_FILTERS.PENDING_OUTCOMES
  },
  {
    key: "recruited",
    labelKey: "teamDashPipelineRecruited",
    milestones: [MILESTONES.ORIENTATION, MILESTONES.LICENSING, MILESTONES.FAST_START],
    filter: EXECUTIVE_FILTERS.ORIENTATION_READY
  }
]);

function parseInterviewTimestamp(prospect) {
  if (!prospect) {
    return null;
  }

  const interviewTime = Date.parse(prospect.interview_time || "");
  if (!Number.isNaN(interviewTime)) {
    return interviewTime;
  }

  const appointmentDate = Date.parse(prospect.appointment_date || "");
  if (!Number.isNaN(appointmentDate)) {
    return appointmentDate;
  }

  return null;
}

function isSameLocalDay(timestampMs, reference = new Date()) {
  if (!timestampMs) {
    return false;
  }

  const target = new Date(timestampMs);
  const ref = new Date(reference);
  return (
    target.getFullYear() === ref.getFullYear() &&
    target.getMonth() === ref.getMonth() &&
    target.getDate() === ref.getDate()
  );
}

function isTomorrow(timestampMs, reference = new Date()) {
  if (!timestampMs) {
    return false;
  }

  const tomorrow = new Date(reference);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return isSameLocalDay(timestampMs, tomorrow);
}

function findProspect(prospects, phone) {
  return prospects.find((row) => row.phone === phone) || null;
}

export function resolveUserFirstName(user) {
  if (!user) {
    return "";
  }

  if (user.first_name) {
    return String(user.first_name).trim();
  }

  const display = String(user.display_name || "").trim();
  if (display) {
    return display.split(/\s+/)[0] || display;
  }

  return "";
}

/** True when scoped prospects include owners other than the signed-in user. */
export function resolveHasTeamScope(prospects, userId) {
  if (!userId || !Array.isArray(prospects)) {
    return false;
  }

  const self = String(userId);
  return prospects.some((prospect) => {
    const owner = String(prospect.owner_user_id || prospect.ownerUserId || "");
    return owner && owner !== self;
  });
}

function countNewProspectsToday(prospects, reference = new Date()) {
  return prospects.filter((prospect) => isSameLocalDay(Date.parse(prospect.created_at || ""), reference))
    .length;
}

function countFollowUpsToday(queue) {
  return queue.filter(
    (summary) =>
      summary.canonicalMilestone === MILESTONES.FOLLOW_UP ||
      summary.missionControlPriorityTier === "FOLLOW_UP_DUE"
  ).length;
}

function countAppointmentsToday(queue, prospects, reference = new Date()) {
  return queue.filter((summary) => {
    const prospect = findProspect(prospects, summary.phone);
    return isSameLocalDay(parseInterviewTimestamp(prospect), reference);
  }).length;
}

export function buildTeamDashboardKpis({ queue = [], prospects = [], todayFocus = {}, reference = new Date() } = {}) {
  const newProspects = countNewProspectsToday(prospects, reference);
  const followUpsToday = countFollowUpsToday(queue);
  const appointmentsToday =
    todayFocus?.interviewsToday?.count ?? countAppointmentsToday(queue, prospects, reference);
  const hotProspects = todayFocus?.highPriorityProspects?.count ?? 0;

  return [
    {
      key: "newProspects",
      labelKey: "teamDashKpiNewProspects",
      count: newProspects,
      to: buildMissionControlPath({ filter: EXECUTIVE_FILTERS.NEW_UNACKNOWLEDGED })
    },
    {
      key: "followUps",
      labelKey: "teamDashKpiFollowUpsToday",
      count: followUpsToday,
      to: appPath("follow-ups")
    },
    {
      key: "appointments",
      labelKey: "teamDashKpiAppointmentsToday",
      count: appointmentsToday,
      to: `${appPath("appointments")}?view=today`
    },
    {
      key: "hot",
      labelKey: "teamDashKpiHotProspects",
      count: hotProspects,
      to: buildMissionControlPath({ filter: EXECUTIVE_FILTERS.HIGH_PRIORITY })
    }
  ];
}

function resolvePriorityActionLabelKey(summary) {
  const tier = summary.missionControlPriorityTier;
  const milestone = summary.canonicalMilestone;

  if (milestone === MILESTONES.NEW_LEAD || tier === "NEW_LEAD") {
    return "teamDashActionCallProspect";
  }

  if (milestone === MILESTONES.QUALIFICATION) {
    return "teamDashActionCompleteQualification";
  }

  if (tier === "FOLLOW_UP_DUE" || milestone === MILESTONES.FOLLOW_UP) {
    return "teamDashActionFollowUp";
  }

  if (milestone === MILESTONES.INTERVIEW_READY) {
    return "teamDashActionScheduleAppointment";
  }

  if (milestone === MILESTONES.INTERVIEW_SCHEDULED || milestone === MILESTONES.INTERVIEW_DUE) {
    return "teamDashActionConfirmInterview";
  }

  if (tier === "HUMAN_ESCALATION" || summary.missionControlPriority <= 2) {
    return "teamDashActionReviewHot";
  }

  return "teamDashActionOpenProspect";
}

export function buildTeamDashboardPriorities({ queue = [], prospects = [], translate, limit = 8 } = {}) {
  if (!translate) {
    return [];
  }

  return queue.slice(0, limit).map((summary) => {
    const prospect = findProspect(prospects, summary.phone);
    const actionLabelKey = resolvePriorityActionLabelKey(summary);

    return {
      phone: summary.phone,
      name: summary.name || prospect?.name || summary.phone,
      actionLabel: translate(actionLabelKey),
      openPath: buildProspectWorkspacePathFromPhone(summary.phone),
      missionControlPath: buildMissionControlPath({ phone: summary.phone }),
      callHref: summary.phone ? `tel:${summary.phone}` : null,
      messagePath: buildProspectWorkspacePathFromPhone(summary.phone),
      schedulePath: buildMissionControlPath({ phone: summary.phone })
    };
  });
}

export function buildTeamDashboardPipeline(queue = []) {
  return PIPELINE_STAGES.map((stage) => ({
    key: stage.key,
    labelKey: stage.labelKey,
    count: queue.filter((summary) => stage.milestones.includes(summary.canonicalMilestone)).length,
    to: buildMissionControlPath({ filter: stage.filter })
  }));
}

export function buildTeamDashboardAppointments({
  queue = [],
  prospects = [],
  hasTeamScope = false,
  reference = new Date()
} = {}) {
  const todayEntries = queue
    .map((summary) => {
      const prospect = findProspect(prospects, summary.phone);
      const at = parseInterviewTimestamp(prospect);
      return { summary, prospect, at };
    })
    .filter((row) => row.at);

  const today = todayEntries.filter((row) => isSameLocalDay(row.at, reference)).length;
  const tomorrow = todayEntries.filter((row) => isTomorrow(row.at, reference)).length;

  const needsConfirmation = todayEntries.filter(
    (row) =>
      isSameLocalDay(row.at, reference) &&
      (row.summary.canonicalMilestone === MILESTONES.INTERVIEW_READY ||
        row.prospect?.current_step === "SCHEDULE" ||
        row.prospect?.current_step === "EMAIL")
  ).length;

  const completed = todayEntries.filter(
    (row) =>
      isSameLocalDay(row.at, reference) &&
      (row.summary.canonicalMilestone === MILESTONES.INTERVIEW_COMPLETED ||
        row.summary.canonicalMilestone === MILESTONES.INTERVIEW_RESULT_PENDING ||
        row.summary.canonicalMilestone === MILESTONES.ORIENTATION)
  ).length;

  return {
    titleKey: hasTeamScope ? "teamDashAppointmentsTeam" : "teamDashAppointmentsMine",
    rows: [
      {
        key: "today",
        labelKey: "teamDashAppointmentsToday",
        count: today,
        to: `${appPath("appointments")}?view=today`
      },
      {
        key: "tomorrow",
        labelKey: "teamDashAppointmentsTomorrow",
        count: tomorrow,
        to: `${appPath("appointments")}?view=upcoming`
      },
      {
        key: "needsConfirmation",
        labelKey: "teamDashAppointmentsNeedsConfirmation",
        count: needsConfirmation,
        to: `${appPath("appointments")}?view=pending_confirmation`
      },
      {
        key: "completed",
        labelKey: "teamDashAppointmentsCompleted",
        count: completed,
        to: `${appPath("appointments")}?view=completed`
      }
    ]
  };
}

export function buildTeamDashboardRecruiting({ queue = [], todayFocus = {}, productionSnapshot = null } = {}) {
  const workflow = productionSnapshot?.workflow || {};
  const interviewsToday = workflow.todaysAppointments ?? todayFocus?.interviewsToday?.count ?? 0;
  const interviewsWeek = workflow.thisWeekInterviews ?? 0;
  const recruited =
    workflow.recruitCount ??
    queue.filter((summary) =>
      [MILESTONES.ORIENTATION, MILESTONES.LICENSING, MILESTONES.FAST_START].includes(
        summary.canonicalMilestone
      )
    ).length;
  const licensing = queue.filter((summary) => summary.canonicalMilestone === MILESTONES.LICENSING).length;
  const orientation =
    todayFocus?.recruitsReadyForOrientation?.count ??
    queue.filter((summary) => summary.canonicalMilestone === MILESTONES.ORIENTATION).length;

  return {
    interviewsToday,
    interviewsWeek,
    recruited,
    licensing,
    orientation,
    to: appPath("recruiting")
  };
}

export function buildTeamDashboardProduction(productionSnapshot = null) {
  const workflow = productionSnapshot?.workflow;
  const placeholder = productionSnapshot?.placeholder;

  if (!workflow && !placeholder) {
    return {
      available: false,
      noteKey: "teamDashProductionComingSoon"
    };
  }

  const hasMetrics =
    typeof workflow?.todaysAppointments === "number" ||
    typeof workflow?.thisWeekInterviews === "number";

  if (!hasMetrics) {
    return {
      available: false,
      noteKey: "teamDashProductionComingSoon"
    };
  }

  return {
    available: true,
    clientAppointments: workflow.todaysAppointments ?? 0,
    weekInterviews: workflow.thisWeekInterviews ?? 0,
    applicationsPending: placeholder?.applicationsPending,
    submittedPremium: placeholder?.submittedPremium,
    noteKey: placeholder?.submittedPremium == null ? "teamDashProductionPartial" : null,
    to: appPath("production")
  };
}

export function buildTeamDashboardRecommendation(recommendations = [], translate) {
  const top = recommendations[0];

  if (!top || !translate) {
    return null;
  }

  return {
    name: top.name || top.phone,
    phone: top.phone,
    headline: translate("teamDashRecommendHeadline", { name: top.name || top.phone }),
    detail: translate("teamDashRecommendDetail"),
    callHref: top.phone ? `tel:${top.phone}` : null,
    openPath: buildProspectWorkspacePathFromPhone(top.phone),
    missionControlPath: buildMissionControlPath({ phone: top.phone })
  };
}

export function buildTeamDashboardActivity(activity = [], limit = 6) {
  return activity.slice(0, limit);
}

export function buildTeamDashboardViewModel(executive, dashboard, user, translate) {
  const queue = executive?.prioritizedWorkflowQueue || dashboard?.prioritizedWorkflowQueue || [];
  const prospects = dashboard?.prospects || [];
  const todayFocus = executive?.todayFocus || {};
  const productionSnapshot = executive?.productionSnapshot || null;
  const recommendations = executive?.recommendations || [];
  const activity = executive?.activity || [];
  const userId = user?.id;
  const hasTeamScope = resolveHasTeamScope(prospects, userId);
  const greetingKey = getTeamGreetingKey();

  const priorities = buildTeamDashboardPriorities({ queue, prospects, translate });
  const kpis = buildTeamDashboardKpis({ queue, prospects, todayFocus });
  const pipeline = buildTeamDashboardPipeline(queue);
  const appointments = buildTeamDashboardAppointments({ queue, prospects, hasTeamScope });
  const recruiting = buildTeamDashboardRecruiting({ queue, todayFocus, productionSnapshot });
  const production = buildTeamDashboardProduction(productionSnapshot);
  const recommendation = buildTeamDashboardRecommendation(recommendations, translate);

  return {
    greetingKey,
    firstName: resolveUserFirstName(user),
    hasTeamScope,
    kpis,
    priorities,
    pipeline,
    appointments,
    recruiting,
    production,
    recommendation,
    activity: buildTeamDashboardActivity(activity),
    prospectCount: prospects.length
  };
}

export { PIPELINE_STAGES, MILESTONES };
