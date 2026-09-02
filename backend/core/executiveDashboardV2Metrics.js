/**
 * Executive Dashboard v2 — derived metrics from existing prospect + queue data.
 * Completed KPI uses canonical atlas_appointments completion (Appointments page SoT).
 * Conversation Performance uses BR-205 (Conversations Active ownership), not the MC queue.
 */

const { MILESTONES } = require("./workflowConstants");
const { parseInterviewDatetime } = require("./parseInterviewDatetime");
const { isCompletedAppointmentForList } = require("./appointmentListQuery");
const {
  RELATIVE_PERIODS,
  getOrganizationDateWindow,
  isTimestampInWindow
} = require("./organizationDateWindow");
const {
  buildConversationPerformanceCounts,
  classifyQueueSummary
} = require("./conversationPerformanceEngine");
const {
  CONVERSATION_OWNERSHIP_STATE
} = require("./conversationsCenter/constants");

function prospectByPhone(prospects) {
  return new Map((prospects || []).map((row) => [row.phone, row]));
}

/**
 * Canonical Completed count — same semantics as Appointments "completed" view:
 * status completed|no_show, or lifecycle recruited|became_client.
 * Does not use transient INTERVIEW_COMPLETED workflow milestone.
 */
function countCompletedAppointments(appointments = []) {
  return (appointments || []).filter(isCompletedAppointmentForList).length;
}

function appointmentStartMs(appointment = {}) {
  const raw = appointment.startDateTime || appointment.start_date_time;
  if (!raw) {
    return null;
  }

  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

function countPipelineMetrics(prospects, queue, appointments = []) {
  const byPhone = prospectByPhone(prospects);
  let newProspects = 0;
  let qualified = 0;
  let appointmentsScheduled = 0;
  let confirmed = 0;
  let recruited = 0;

  for (const summary of queue || []) {
    const prospect = byPhone.get(summary.phone) || {};

    if (summary.canonicalMilestone === MILESTONES.NEW_LEAD) {
      newProspects += 1;
    }

    if (
      summary.canonicalMilestone === MILESTONES.QUALIFICATION ||
      summary.canonicalMilestone === MILESTONES.INTERVIEW_READY
    ) {
      qualified += 1;
    }

    if (
      summary.canonicalMilestone === MILESTONES.INTERVIEW_SCHEDULED ||
      summary.canonicalMilestone === MILESTONES.INTERVIEW_DUE
    ) {
      appointmentsScheduled += 1;
    }

    if (prospect.current_step === "CONFIRMED") {
      confirmed += 1;
    }

    if (
      summary.canonicalMilestone === MILESTONES.ORIENTATION ||
      summary.canonicalMilestone === MILESTONES.LICENSING ||
      summary.canonicalMilestone === MILESTONES.FAST_START
    ) {
      recruited += 1;
    }
  }

  return {
    newProspects,
    qualified,
    appointments: appointmentsScheduled,
    confirmed,
    completed: countCompletedAppointments(appointments),
    recruited
  };
}

function countWindowNewProspects(prospects, window) {
  let count = 0;

  for (const prospect of prospects || []) {
    const createdAt = prospect.created_at;
    if (createdAt && isTimestampInWindow(createdAt, window)) {
      count += 1;
    }
  }

  return count;
}

function buildKpiMetrics(prospects, queue, context) {
  const appointments = context.appointments || [];
  const pipeline = countPipelineMetrics(prospects, queue, appointments);
  const todayNew = countWindowNewProspects(prospects, context.todayWindow);
  const yesterdayNew = countWindowNewProspects(prospects, context.yesterdayWindow);

  return {
    newProspects: todayNew,
    qualified: pipeline.qualified,
    appointments: pipeline.appointments,
    confirmed: pipeline.confirmed,
    completed: pipeline.completed,
    recruited: pipeline.recruited,
    comparison: {
      newProspects: todayNew - yesterdayNew,
      qualified: null,
      appointments: null,
      confirmed: null,
      completed: null,
      recruited: null
    }
  };
}

function buildRecruitmentFunnel(queue, prospects, appointments = []) {
  const byPhone = prospectByPhone(prospects);
  const stages = [
    {
      key: "newLeads",
      count: (queue || []).filter((row) => row.canonicalMilestone === MILESTONES.NEW_LEAD)
        .length
    },
    {
      key: "qualified",
      count: (queue || []).filter(
        (row) =>
          row.canonicalMilestone === MILESTONES.QUALIFICATION ||
          row.canonicalMilestone === MILESTONES.INTERVIEW_READY
      ).length
    },
    {
      key: "scheduled",
      count: (queue || []).filter(
        (row) =>
          row.canonicalMilestone === MILESTONES.INTERVIEW_SCHEDULED ||
          row.canonicalMilestone === MILESTONES.INTERVIEW_DUE
      ).length
    },
    {
      key: "confirmed",
      count: (queue || []).filter((row) => {
        const prospect = byPhone.get(row.phone) || {};
        return prospect.current_step === "CONFIRMED";
      }).length
    },
    {
      key: "completed",
      count: countCompletedAppointments(appointments)
    },
    {
      key: "recruited",
      count: (queue || []).filter(
        (row) =>
          row.canonicalMilestone === MILESTONES.ORIENTATION ||
          row.canonicalMilestone === MILESTONES.LICENSING ||
          row.canonicalMilestone === MILESTONES.FAST_START
      ).length
    }
  ];

  const withConversion = stages.map((stage, index) => {
    const previous = index > 0 ? stages[index - 1].count : null;
    const conversionPct =
      previous && previous > 0
        ? Math.round((stage.count / previous) * 100)
        : null;

    return {
      ...stage,
      conversionPct
    };
  });

  const first = stages[0]?.count || 0;
  const last = stages[stages.length - 1]?.count || 0;
  const totalConversionPct =
    first > 0 ? Math.round((last / first) * 100) : null;

  return {
    stages: withConversion,
    totalConversionPct
  };
}

function buildConversationOwnership(queue, prospects = []) {
  // Implements BR-205 — eligible Active conversations, Conversations ownership states.
  if (Array.isArray(prospects) && prospects.length > 0) {
    const counted = buildConversationPerformanceCounts(prospects);
    return {
      atlas: counted.atlas,
      human: counted.human,
      needsAttention: counted.needsAttention,
      total: counted.total,
      averageResponseTimeMs: null
    };
  }

  let atlas = 0;
  let human = 0;
  let needsAttention = 0;
  const seen = new Set();

  for (const summary of queue || []) {
    const key = String(summary.phone || summary.id || "").trim();
    if (key) {
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
    }

    const status = classifyQueueSummary(summary);
    if (status === CONVERSATION_OWNERSHIP_STATE.HUMAN) {
      human += 1;
    } else if (status === CONVERSATION_OWNERSHIP_STATE.NEEDS_ATTENTION) {
      needsAttention += 1;
    } else {
      atlas += 1;
    }
  }

  return {
    atlas,
    human,
    needsAttention,
    total: atlas + human + needsAttention,
    averageResponseTimeMs: null
  };
}

function buildSevenDayAppointmentTrend(prospects, queue, context) {
  const byPhone = prospectByPhone(prospects);
  const appointments = context.appointments || [];
  const organizationId = context.organizationId;
  const reference = context.reference || new Date();
  const days = [];

  for (let offset = 6; offset >= 0; offset -= 1) {
    const dayReference = new Date(reference);
    dayReference.setDate(dayReference.getDate() - offset);
    const window = getOrganizationDateWindow({
      organizationId,
      relativePeriod: RELATIVE_PERIODS.TODAY,
      reference: dayReference
    });

    let scheduled = 0;
    let confirmed = 0;
    let completed = 0;

    for (const summary of queue || []) {
      const prospect = byPhone.get(summary.phone) || {};
      const at = parseInterviewDatetime(prospect);
      if (!at || !isTimestampInWindow(at, window)) {
        continue;
      }

      scheduled += 1;

      if (prospect.current_step === "CONFIRMED") {
        confirmed += 1;
      }
    }

    for (const appointment of appointments) {
      const at = appointmentStartMs(appointment);
      if (!at || !isTimestampInWindow(at, window)) {
        continue;
      }

      if (isCompletedAppointmentForList(appointment)) {
        completed += 1;
      }
    }

    days.push({
      date: window.localStart,
      label: window.localStart,
      scheduled,
      confirmed,
      completed
    });
  }

  return days;
}

function buildExecutiveDashboardV2Metrics(prospects, queue, context = {}) {
  const organizationId = context.organizationId || null;
  const reference = context.reference || new Date();
  const todayWindow =
    context.todayWindow ||
    getOrganizationDateWindow({
      organizationId,
      relativePeriod: RELATIVE_PERIODS.TODAY,
      reference
    });
  const yesterdayWindow =
    context.yesterdayWindow ||
    getOrganizationDateWindow({
      organizationId,
      relativePeriod: RELATIVE_PERIODS.YESTERDAY,
      reference
    });

  const metricsContext = {
    ...context,
    organizationId,
    reference,
    todayWindow,
    yesterdayWindow,
    appointments: context.appointments || []
  };

  return {
    kpi: buildKpiMetrics(prospects, queue, metricsContext),
    funnel: buildRecruitmentFunnel(queue, prospects, metricsContext.appointments),
    conversationOwnership: buildConversationOwnership(queue, prospects),
    trend7Day: buildSevenDayAppointmentTrend(prospects, queue, metricsContext)
  };
}

module.exports = {
  buildExecutiveDashboardV2Metrics,
  buildKpiMetrics,
  buildRecruitmentFunnel,
  buildConversationOwnership,
  buildSevenDayAppointmentTrend,
  countPipelineMetrics,
  countCompletedAppointments
};
