/**
 * Sprint 9.0.1 — Executive Dashboard presentation view model.
 * Derives launch UI metrics from existing API payloads only. No business rules.
 */

import { EXECUTIVE_FILTERS } from "./executiveFilterEngine";

const MILESTONES = {
  INTERVIEW_READY: "INTERVIEW_READY",
  INTERVIEW_SCHEDULED: "INTERVIEW_SCHEDULED",
  INTERVIEW_DUE: "INTERVIEW_DUE",
  INTERVIEW_COMPLETED: "INTERVIEW_COMPLETED",
  INTERVIEW_RESULT_PENDING: "INTERVIEW_RESULT_PENDING",
  FOLLOW_UP: "FOLLOW_UP",
  ORIENTATION: "ORIENTATION",
  LICENSING: "LICENSING",
  FAST_START: "FAST_START",
  CLOSED: "CLOSED"
};

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

function priorityLabelKey(priority) {
  if (priority <= 1) {
    return "executivePriorityHigh";
  }

  if (priority <= 2) {
    return "executivePriorityMedium";
  }

  return "executivePriorityLow";
}

function formatRelativeMinutes(timestamp, translate) {
  if (!timestamp || !translate) {
    return null;
  }

  const diffMs = Date.now() - Date.parse(timestamp);
  const minutes = Math.max(1, Math.round(diffMs / 60000));

  if (minutes < 60) {
    return minutes === 1
      ? translate("executiveRelativeMinute", { count: minutes })
      : translate("executiveRelativeMinutes", { count: minutes });
  }

  const hours = Math.round(minutes / 60);
  return hours === 1
    ? translate("executiveRelativeHour", { count: hours })
    : translate("executiveRelativeHours", { count: hours });
}

function mapRecommendationTitle(item, translate) {
  const tier = item.missionControlPriorityTier;
  const title = item.title || "";

  if (
    tier === "PENDING_INTERVIEW_RESULTS" ||
    title.includes("Outcome")
  ) {
    return translate("executiveRecTitleOutcome");
  }

  if (title.includes("follow-up") || title.includes("Follow-up")) {
    return translate("executiveRecTitleFollowUp");
  }

  if (title.includes("Orientation")) {
    return translate("executiveRecTitleOrientation");
  }

  if (title.includes("escalation") || title.includes("Escalation")) {
    return translate("executiveRecTitleEscalation");
  }

  if (title.includes("imminent") || title.includes("Imminent")) {
    return translate("executiveRecTitleImminent");
  }

  if (title.includes("lead") || title.includes("Lead")) {
    return translate("executiveRecTitleNewLead");
  }

  return translate("executiveRecTitleDefault");
}

function buildInterviewHero(queue, prospects, todayFocus) {
  const todayEntries = queue
    .map((summary) => {
      const prospect = findProspect(prospects, summary.phone);
      const at = parseInterviewTimestamp(prospect);
      return { summary, prospect, at };
    })
    .filter((row) => isSameLocalDay(row.at));

  const total = todayEntries.length;
  const mine = todayEntries.filter(
    (row) => row.summary.workflowOwnership === "AGENT"
  ).length;
  const team = Math.max(0, total - mine);

  const confirmed = todayEntries.filter(
    (row) =>
      row.summary.canonicalMilestone === MILESTONES.INTERVIEW_SCHEDULED ||
      row.summary.canonicalMilestone === MILESTONES.INTERVIEW_DUE ||
      row.prospect?.current_step === "CONFIRMED"
  ).length;

  const waitingConfirmation = todayEntries.filter(
    (row) =>
      row.summary.canonicalMilestone === MILESTONES.INTERVIEW_READY ||
      row.prospect?.current_step === "SCHEDULE" ||
      row.prospect?.current_step === "EMAIL"
  ).length;

  const outcomePending = todayEntries.filter(
    (row) =>
      row.summary.canonicalMilestone === MILESTONES.INTERVIEW_RESULT_PENDING ||
      row.summary.missionControlPriorityTier === "PENDING_INTERVIEW_RESULTS"
  ).length;

  const rescheduled = todayEntries.filter(
    (row) => row.summary.canonicalMilestone === MILESTONES.FOLLOW_UP
  ).length;

  return {
    total: total || todayFocus?.interviewsToday?.count || 0,
    mine,
    team,
    confirmed,
    waitingConfirmation,
    outcomePending,
    rescheduled
  };
}

function buildTomorrowInterviews(queue, prospects) {
  return queue.filter((summary) => {
    const prospect = findProspect(prospects, summary.phone);
    return isTomorrow(parseInterviewTimestamp(prospect));
  }).length;
}

function buildMorningBrief({
  greeting,
  hero,
  todayFocus,
  recommendations,
  teamBoard,
  activity = [],
  translate
}) {
  const lines = [];
  lines.push(greeting);

  if (hero.total > 0) {
    lines.push(
      hero.mine === 1
        ? translate("executiveBriefInterviewsMine", { count: hero.mine })
        : translate("executiveBriefInterviewsMinePlural", { count: hero.mine })
    );
    lines.push(translate("executiveBriefInterviewsTeam", { count: hero.team }));
  } else {
    lines.push(translate("executiveBriefNoInterviewsToday"));
  }

  const overnightConfirmed = activity.filter((row) => {
    const type = row.eventType || "";
    if (type !== "InterviewScheduled" && type !== "ProspectAdvanced") {
      return false;
    }

    const at = Date.parse(row.timestamp);
    if (Number.isNaN(at)) {
      return false;
    }

    const hoursAgo = (Date.now() - at) / 3600000;
    return hoursAgo <= 12;
  }).length;

  if (overnightConfirmed > 0) {
    lines.push(
      overnightConfirmed === 1
        ? translate("executiveBriefOvernightConfirmed", { count: overnightConfirmed })
        : translate("executiveBriefOvernightConfirmedPlural", {
            count: overnightConfirmed
          })
    );
  }

  const outcomes = todayFocus?.pendingInterviewOutcomes?.count ?? hero.outcomePending;
  if (outcomes > 0) {
    lines.push(
      outcomes === 1
        ? translate("executiveBriefOutcomesAttention", { count: outcomes })
        : translate("executiveBriefOutcomesAttentionPlural", { count: outcomes })
    );
  }

  const top = recommendations?.[0];
  const coachingLeader = teamBoard.find((row) => row.needsCoaching);

  return {
    lines,
    recommendedAction: top
      ? {
          label: translate("executiveBriefReviewProspect", { name: top.name }),
          phone: top.phone,
          filter: top.filter
        }
      : null,
    coachingLeader: coachingLeader
      ? {
          label:
            coachingLeader.pending === 1
              ? translate("executiveBriefCoaching", {
                  leader: coachingLeader.leader,
                  count: coachingLeader.pending
                })
              : translate("executiveBriefCoachingPlural", {
                  leader: coachingLeader.leader,
                  count: coachingLeader.pending
                }),
          leader: coachingLeader.leader
        }
      : null
  };
}

function buildTeamBoard(queue, prospects, translate) {
  const byLeader = new Map();

  queue.forEach((summary) => {
    const prospect = findProspect(prospects, summary.phone);
    const leader = prospect?.city?.trim() || translate("executiveTeamUnassigned");
    const at = parseInterviewTimestamp(prospect);
    const isToday = isSameLocalDay(at);

    if (!byLeader.has(leader)) {
      byLeader.set(leader, {
        leader,
        todayInterviews: 0,
        completed: 0,
        pending: 0
      });
    }

    const row = byLeader.get(leader);

    if (isToday) {
      row.todayInterviews += 1;

      if (
        summary.canonicalMilestone === MILESTONES.INTERVIEW_COMPLETED ||
        summary.canonicalMilestone === MILESTONES.ORIENTATION ||
        summary.canonicalMilestone === MILESTONES.FOLLOW_UP
      ) {
        row.completed += 1;
      } else {
        row.pending += 1;
      }
    } else if (
      summary.canonicalMilestone === MILESTONES.INTERVIEW_RESULT_PENDING ||
      summary.missionControlPriorityTier === "PENDING_INTERVIEW_RESULTS" ||
      summary.stalledAt
    ) {
      row.pending += 1;
    }
  });

  const rows = Array.from(byLeader.values())
    .filter((row) => row.todayInterviews > 0 || row.pending > 0)
    .sort((left, right) => right.pending - left.pending || right.todayInterviews - left.todayInterviews);

  rows.forEach((row) => {
    row.needsCoaching = false;
  });

  const topPending = rows.reduce(
    (max, row) => Math.max(max, row.pending),
    0
  );

  if (topPending > 0) {
    const coachingRow = rows.find((row) => row.pending === topPending);
    if (coachingRow) {
      coachingRow.needsCoaching = true;
    }
  }

  if (!rows.length) {
    return [
      {
        leader: translate("executiveTeamDefault"),
        todayInterviews: 0,
        completed: 0,
        pending: 0,
        needsCoaching: false
      }
    ];
  }

  return rows;
}

function buildPipelineCounts(queue) {
  return {
    scheduled: queue.filter(
      (row) => row.canonicalMilestone === MILESTONES.INTERVIEW_READY
    ).length,
    confirmed: queue.filter(
      (row) =>
        row.canonicalMilestone === MILESTONES.INTERVIEW_SCHEDULED ||
        row.canonicalMilestone === MILESTONES.INTERVIEW_DUE
    ).length,
    completed: queue.filter(
      (row) =>
        row.canonicalMilestone === MILESTONES.INTERVIEW_COMPLETED ||
        row.canonicalMilestone === MILESTONES.INTERVIEW_RESULT_PENDING
    ).length,
    outcomeRecorded: queue.filter(
      (row) => row.canonicalMilestone === MILESTONES.FOLLOW_UP
    ).length,
    recruit: queue.filter(
      (row) =>
        row.canonicalMilestone === MILESTONES.ORIENTATION ||
        row.canonicalMilestone === MILESTONES.LICENSING ||
        row.canonicalMilestone === MILESTONES.FAST_START
    ).length,
    orientation: queue.filter(
      (row) => row.canonicalMilestone === MILESTONES.ORIENTATION
    ).length
  };
}

function buildFocusCards(todayFocus, queue, prospects, translate) {
  const tomorrowCount = buildTomorrowInterviews(queue, prospects);
  const orientations =
    todayFocus?.recruitsReadyForOrientation?.count ??
    queue.filter((row) => row.canonicalMilestone === MILESTONES.ORIENTATION).length;

  return [
    {
      key: "outcomes",
      title: translate("executiveFocusOutcomes"),
      count: todayFocus?.pendingInterviewOutcomes?.count ?? 0,
      filter: EXECUTIVE_FILTERS.PENDING_OUTCOMES,
      emptyMessage: translate("executiveFocusOutcomesEmpty")
    },
    {
      key: "priority",
      title: translate("executiveFocusHighPriority"),
      count: todayFocus?.highPriorityProspects?.count ?? 0,
      filter: EXECUTIVE_FILTERS.HIGH_PRIORITY,
      emptyMessage: translate("executiveFocusHighPriorityEmpty")
    },
    {
      key: "orientations",
      title: translate("executiveFocusOrientations"),
      count: orientations,
      filter: EXECUTIVE_FILTERS.ORIENTATION_READY,
      emptyMessage: translate("executiveFocusOrientationsEmpty")
    },
    {
      key: "tomorrow",
      title: translate("executiveFocusTomorrow"),
      count: tomorrowCount,
      filter: EXECUTIVE_FILTERS.TOMORROWS_INTERVIEWS,
      emptyMessage: translate("executiveFocusTomorrowEmpty")
    }
  ];
}

function resolveRecommendationAction(item, translate) {
  const title = item.title || "";
  const tier = item.missionControlPriorityTier;

  if (tier === "PENDING_INTERVIEW_RESULTS" || title.includes("Outcome")) {
    return translate("executiveRecommendationRecordOutcome");
  }

  if (title.includes("follow-up") || title.includes("Follow-up")) {
    return translate("executiveRecommendationFollowUp");
  }

  if (title.includes("Orientation")) {
    return translate("executiveRecommendationOrientation");
  }

  if (title.includes("escalation") || title.includes("Escalation")) {
    return translate("executiveRecommendationTakeOwnership");
  }

  return translate("executiveRecommendationReview");
}

function buildRecommendationCards(recommendations = [], activity = [], translate) {
  return recommendations.map((item) => {
    const relatedEvent = activity.find((row) => row.phone === item.phone);
    const localizedTitle = mapRecommendationTitle(item, translate);
    const relative = relatedEvent?.timestamp
      ? formatRelativeMinutes(relatedEvent.timestamp, translate)
      : "";
    const reason = relatedEvent?.summary
      ? `${relatedEvent.summary}${relative ? ` ${relative}` : ""}`.trim()
      : localizedTitle;

    const priorityKey = priorityLabelKey(item.missionControlPriority);

    return {
      ...item,
      reason,
      recommendedAction: resolveRecommendationAction(item, translate),
      priorityLabel: translate(priorityKey)
    };
  });
}

export function buildExecutiveDashboardViewModel(executive, dashboard, translate) {
  const queue = executive?.prioritizedWorkflowQueue || [];
  const prospects = dashboard?.prospects || [];
  const todayFocus = executive?.todayFocus || {};
  const greeting = translate(getTimeGreetingKey());
  const hero = buildInterviewHero(queue, prospects, todayFocus);
  const teamBoard = buildTeamBoard(queue, prospects, translate);
  const recommendations = buildRecommendationCards(
    executive?.recommendations || [],
    executive?.activity || [],
    translate
  );
  const morningBrief = buildMorningBrief({
    greeting,
    hero,
    todayFocus,
    recommendations,
    teamBoard,
    activity: executive?.activity || [],
    translate
  });

  return {
    hero,
    morningBrief,
    focusCards: buildFocusCards(todayFocus, queue, prospects, translate),
    teamBoard,
    pipeline: buildPipelineCounts(queue),
    recommendations,
    activity: executive?.activity || [],
    agencyPulse: executive?.agencyPulse || null,
    generatedAt: executive?.generatedAt || null
  };
}

export function getTimeGreetingKey() {
  const hour = new Date().getHours();

  if (hour < 12) {
    return "executiveBriefGreetingMorning";
  }

  if (hour < 17) {
    return "executiveBriefGreetingAfternoon";
  }

  return "executiveBriefGreetingEvening";
}
