/**
 * Executive Dashboard v2 presentation view model.
 * Derives layout sections from existing API payloads only.
 */

import {
  EXECUTIVE_FILTERS,
  buildMissionControlPath
} from "./executiveFilterEngine.js";
import {
  buildExecutiveDashboardViewModel,
  getTimeGreetingKey
} from "./executiveDashboardViewModel.js";

const AGENDA_LIMIT = 5;
const ACTIVITY_LIMIT = 5;

const MILESTONES = {
  INTERVIEW_READY: "INTERVIEW_READY",
  INTERVIEW_SCHEDULED: "INTERVIEW_SCHEDULED",
  INTERVIEW_DUE: "INTERVIEW_DUE",
  INTERVIEW_COMPLETED: "INTERVIEW_COMPLETED",
  INTERVIEW_RESULT_PENDING: "INTERVIEW_RESULT_PENDING",
  FOLLOW_UP: "FOLLOW_UP"
};

function formatComparison(delta) {
  if (delta == null || Number.isNaN(delta)) {
    return null;
  }

  if (delta === 0) {
    return { direction: "flat", value: 0 };
  }

  return {
    direction: delta > 0 ? "up" : "down",
    value: Math.abs(delta)
  };
}

function buildKpiCards(v2Metrics, translate) {
  const kpi = v2Metrics?.kpi || {};
  const comparison = kpi.comparison || {};
  const periodToday = translate("executiveV2KpiPeriodToday");
  const periodPipeline = translate("executiveV2KpiPeriodPipeline");

  const defs = [
    {
      key: "newProspects",
      labelKey: "executiveV2KpiNewProspects",
      icon: "users",
      periodLabel: periodToday
    },
    { key: "qualified", labelKey: "executiveV2KpiQualified", icon: "check", periodLabel: periodPipeline },
    {
      key: "appointments",
      labelKey: "executiveV2KpiAppointments",
      icon: "calendar",
      periodLabel: periodPipeline
    },
    { key: "confirmed", labelKey: "executiveV2KpiConfirmed", icon: "badge", periodLabel: periodPipeline },
    { key: "completed", labelKey: "executiveV2KpiCompleted", icon: "flag", periodLabel: periodPipeline },
    { key: "recruited", labelKey: "executiveV2KpiRecruited", icon: "star", periodLabel: periodPipeline }
  ];

  return defs.map((def) => ({
    key: def.key,
    icon: def.icon,
    label: translate(def.labelKey),
    value: kpi[def.key] ?? 0,
    comparison: formatComparison(comparison[def.key])
  }));
}

function resolveAgendaStatus(summary, prospectStep) {
  if (
    summary?.canonicalMilestone === MILESTONES.INTERVIEW_RESULT_PENDING ||
    summary?.missionControlPriorityTier === "PENDING_INTERVIEW_RESULTS"
  ) {
    return "outcome_pending";
  }

  if (prospectStep === "CONFIRMED") {
    return "confirmed";
  }

  if (
    summary?.canonicalMilestone === MILESTONES.INTERVIEW_SCHEDULED ||
    summary?.canonicalMilestone === MILESTONES.INTERVIEW_DUE
  ) {
    return "confirmed";
  }

  if (
    summary?.canonicalMilestone === MILESTONES.INTERVIEW_READY ||
    prospectStep === "SCHEDULE" ||
    prospectStep === "EMAIL"
  ) {
    return "waiting_confirmation";
  }

  if (summary?.canonicalMilestone === MILESTONES.FOLLOW_UP) {
    return "rescheduled";
  }

  return "scheduled";
}

function formatInterviewLocation(interviewType, translate) {
  const value = String(interviewType || "").toLowerCase();

  if (value.includes("zoom") || value.includes("virtual")) {
    return translate("executiveV2LocationZoom");
  }

  if (value.includes("phone")) {
    return translate("executiveV2LocationPhone");
  }

  if (value.includes("in_person") || value.includes("in-person") || value === "in person") {
    return translate("executiveV2LocationInPerson");
  }

  if (value) {
    return interviewType;
  }

  return translate("executiveV2LocationUnspecified");
}

function buildTodayAgenda(executive, prospectsByPhone, translate, timeZone) {
  const appointments = executive?.calendar?.appointments || [];
  const queue = executive?.prioritizedWorkflowQueue || [];

  return appointments.slice(0, AGENDA_LIMIT).map((entry) => {
    const summary = queue.find((row) => row.phone === entry.phone) || null;
    const prospect = prospectsByPhone?.get(entry.phone) || null;
    const status = resolveAgendaStatus(summary, prospect?.current_step);

    return {
      id: `${entry.phone}-${entry.time}`,
      time: entry.time,
      timeLabel: formatAgendaTime(entry.time, timeZone),
      name: entry.name || entry.phone,
      type:
        entry.type === "orientation"
          ? translate("executiveV2AgendaOrientation")
          : translate("executiveV2AgendaInterview"),
      locationLabel: formatInterviewLocation(
        entry.interviewType || prospect?.interview_type,
        translate
      ),
      status,
      statusLabel: translate(`executiveV2AgendaStatus_${status}`),
      phone: entry.phone,
      to: buildMissionControlPath({ phone: entry.phone })
    };
  });
}

function formatAgendaTime(iso, timeZone) {
  if (!iso) {
    return "—";
  }

  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      timeZone: timeZone || undefined
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
}

function buildMorningSummary(alphaBrief, translate) {
  const yesterday = alphaBrief?.yesterday || {};

  return {
    items: [
      { key: "newProspects", value: yesterday.newProspects ?? 0, labelKey: "executiveBriefNewProspects" },
      { key: "qualified", value: yesterday.qualified ?? 0, labelKey: "executiveBriefQualified" },
      { key: "appointments", value: yesterday.appointments ?? 0, labelKey: "executiveBriefAppointments" },
      { key: "confirmed", value: yesterday.confirmed ?? 0, labelKey: "executiveBriefConfirmed" },
      { key: "completed", value: yesterday.completed ?? 0, labelKey: "executiveBriefCompleted" },
      { key: "recruited", value: yesterday.recruited ?? 0, labelKey: "executiveBriefRecruited" }
    ].map((item) => ({
      ...item,
      label: translate(item.labelKey)
    })),
    to: buildMissionControlPath({ filter: EXECUTIVE_FILTERS.HIGH_PRIORITY })
  };
}

function buildFunnelCards(v2Metrics, translate) {
  const funnel = v2Metrics?.funnel;
  if (!funnel?.stages?.length) {
    return {
      stages: [],
      totalConversionPct: null,
      totalConversionLabel: "—"
    };
  }

  const labelKeys = {
    newLeads: "executiveV2FunnelNewLeads",
    qualified: "executiveV2FunnelQualified",
    scheduled: "executiveV2FunnelScheduled",
    confirmed: "executiveV2FunnelConfirmed",
    completed: "executiveV2FunnelCompleted",
    recruited: "executiveV2FunnelRecruited"
  };

  return {
    stages: funnel.stages.map((stage) => ({
      key: stage.key,
      label: translate(labelKeys[stage.key] || stage.key),
      count: stage.count,
      conversionPct:
        stage.conversionPct == null ? null : `${stage.conversionPct}%`
    })),
    totalConversionPct: funnel.totalConversionPct,
    totalConversionLabel:
      funnel.totalConversionPct == null
        ? "—"
        : translate("executiveV2FunnelTotalConversion", {
            value: funnel.totalConversionPct
          })
  };
}

function buildConversationPerformance(v2Metrics, translate) {
  const ownership = v2Metrics?.conversationOwnership || {
    atlas: 0,
    human: 0,
    needsAttention: 0,
    total: 0,
    averageResponseTimeMs: null
  };

  const segments = [
    {
      key: "atlas",
      label: translate("executiveV2ConversationAtlas"),
      value: ownership.atlas,
      color: "#1e3a5f"
    },
    {
      key: "human",
      label: translate("executiveV2ConversationHuman"),
      value: ownership.human,
      color: "#0f766e"
    },
    {
      key: "needsAttention",
      label: translate("executiveV2ConversationNeedsAttention"),
      value: ownership.needsAttention,
      color: "#b45309"
    }
  ];

  const total = Math.max(
    ownership.total,
    segments.reduce((sum, row) => sum + row.value, 0)
  );

  return {
    segments,
    total,
    totalLabel: translate("executiveV2ConversationTotal", { count: total }),
    averageResponseTimeLabel:
      ownership.averageResponseTimeMs == null
        ? "—"
        : translate("executiveV2ConversationAvgResponse", {
            minutes: Math.round(ownership.averageResponseTimeMs / 60000)
          })
  };
}

function buildPriorities(executive, alphaBrief, translate) {
  const todayFocus = executive?.todayFocus || {};
  const priorities = alphaBrief?.todaysPriorities || {};

  const items = [
    {
      key: "followUps",
      count: priorities.followUpsOverdue ?? 0,
      label: translate("executiveV2PriorityFollowUps"),
      filter: EXECUTIVE_FILTERS.HIGH_PRIORITY,
      to: buildMissionControlPath({ filter: EXECUTIVE_FILTERS.HIGH_PRIORITY })
    },
    {
      key: "pendingConfirmation",
      count: todayFocus?.interviewsToday?.count ?? priorities.interviewsToday ?? 0,
      label: translate("executiveV2PriorityPendingConfirmation"),
      filter: EXECUTIVE_FILTERS.INTERVIEWS_TODAY,
      to: buildMissionControlPath({ filter: EXECUTIVE_FILTERS.INTERVIEWS_TODAY })
    },
    {
      key: "newUncontacted",
      count: priorities.newUnacknowledgedLeads ?? 0,
      label: translate("executiveV2PriorityNewUncontacted"),
      filter: EXECUTIVE_FILTERS.HIGH_PRIORITY,
      to: buildMissionControlPath({ filter: EXECUTIVE_FILTERS.HIGH_PRIORITY })
    },
    {
      key: "outcomes",
      count: todayFocus?.pendingInterviewOutcomes?.count ?? 0,
      label: translate("executiveV2PriorityOutcomePending"),
      filter: EXECUTIVE_FILTERS.PENDING_OUTCOMES,
      to: buildMissionControlPath({ filter: EXECUTIVE_FILTERS.PENDING_OUTCOMES })
    },
    {
      key: "stalled",
      count: todayFocus?.stalledProspects?.count ?? 0,
      label: translate("executiveV2PriorityStalled"),
      filter: EXECUTIVE_FILTERS.STALLED,
      to: buildMissionControlPath({ filter: EXECUTIVE_FILTERS.STALLED })
    }
  ];

  return items.filter((item) => item.count > 0);
}

function buildRecentActivityItems(activity, translate, limit = ACTIVITY_LIMIT) {
  return (activity || []).slice(0, limit).map((row) => ({
    id: row.id,
    summary: row.summary || row.eventType,
    timestamp: row.timestamp,
    phone: row.phone,
    to: buildMissionControlPath({ phone: row.phone })
  }));
}

function buildTrendSeries(v2Metrics) {
  return (v2Metrics?.trend7Day || []).map((day) => ({
    date: day.date,
    label: day.label,
    scheduled: day.scheduled,
    confirmed: day.confirmed,
    completed: day.completed
  }));
}

function resolveFirstName(user) {
  return (
    String(user?.first_name || user?.firstName || "")
      .trim()
      .split(/\s+/)[0] || null
  );
}

export function buildExecutiveDashboardV2ViewModel({
  executive,
  alphaBrief,
  prospects = [],
  user,
  organizationName,
  translate
}) {
  const legacy = buildExecutiveDashboardViewModel(
    executive,
    { prospects },
    translate
  );
  const v2Metrics = executive?.v2Metrics || null;
  const prospectsByPhone = new Map((prospects || []).map((row) => [row.phone, row]));
  const greetingKey = getTimeGreetingKey();
  const firstName = resolveFirstName(user);
  const greeting = firstName
    ? translate(greetingKey).replace(/\.\s*$/, `, ${firstName}.`)
    : translate(greetingKey);

  return {
    header: {
      greeting,
      subtitle: translate("executiveV2Subtitle", {
        organizationName: organizationName || translate("teamDashOrganizationFallback")
      }),
      generatedAt: executive?.generatedAt || alphaBrief?.generatedAt || null,
      timeZone: executive?.timeZone || alphaBrief?.timeZone || null,
      missionControlPath: buildMissionControlPath({ filter: EXECUTIVE_FILTERS.INTERVIEWS_TODAY })
    },
    kpiCards: v2Metrics ? buildKpiCards(v2Metrics, translate) : [],
    interviewsToday: {
      total: legacy.hero.total,
      mine: legacy.hero.mine,
      team: legacy.hero.team,
      confirmed: legacy.hero.confirmed,
      waitingConfirmation: legacy.hero.waitingConfirmation,
      outcomePending: legacy.hero.outcomePending,
      rescheduled: legacy.hero.rescheduled,
      to: legacy.hero.to
    },
    agenda: buildTodayAgenda(
      executive,
      prospectsByPhone,
      translate,
      executive?.timeZone
    ),
    morningSummary: alphaBrief ? buildMorningSummary(alphaBrief, translate) : null,
    funnel: v2Metrics ? buildFunnelCards(v2Metrics, translate) : null,
    conversationPerformance: v2Metrics
      ? buildConversationPerformance(v2Metrics, translate)
      : null,
    priorities: buildPriorities(executive, alphaBrief, translate),
    trend: buildTrendSeries(v2Metrics),
    recentActivity: buildRecentActivityItems(executive?.activity || [], translate),
    hasExecutiveData: Boolean(executive),
    hasAlphaBrief: Boolean(alphaBrief),
    hasV2Metrics: Boolean(v2Metrics)
  };
}

export {
  AGENDA_LIMIT,
  ACTIVITY_LIMIT,
  buildKpiCards,
  buildTodayAgenda,
  buildPriorities,
  buildConversationPerformance
};
