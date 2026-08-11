/**
 * Sprint 9.0 — Executive Dashboard read model.
 * Aggregates existing workflow engines only — no new business rules.
 */

const { supabase } = require("../services/supabaseService");
const { filterProductionProspects } = require("./productionProspectFilter");
const {
  filterOutOperationalTestProspects
} = require("./missionControlOperationalTestFilter");
const {
  buildPrioritizedWorkflowQueue
} = require("./missionControlPriorityEngine");
const { parseInterviewDatetime } = require("./parseInterviewDatetime");
const { loadAgentState } = require("./agentActionState");
const { listRecentWorkflowEvents } = require("../services/workflowEventService");
const { computeAgencyPulseScore } = require("./agencyPulseEngine");
const { MILESTONES, PRIORITY_TIERS } = require("./workflowConstants");
const {
  RELATIVE_PERIODS,
  getOrganizationDateWindow,
  isTimestampInWindow
} = require("./organizationDateWindow");

const EXECUTIVE_FILTERS = Object.freeze({
  INTERVIEWS_TODAY: "interviews-today",
  PENDING_OUTCOMES: "pending-outcomes",
  HIGH_PRIORITY: "high-priority",
  ORIENTATION_READY: "orientation-ready",
  STALLED: "stalled"
});

/** @deprecated Prefer organization date windows (BR-079). Kept for test compatibility. */
function isSameLocalDay(timestampMs, reference = new Date(), organizationId = null) {
  if (!timestampMs) {
    return false;
  }

  const window = getOrganizationDateWindow({
    organizationId,
    relativePeriod: RELATIVE_PERIODS.TODAY,
    reference
  });

  return isTimestampInWindow(timestampMs, window);
}

function isThisLocalWeek(timestampMs, reference = new Date(), organizationId = null) {
  if (!timestampMs) {
    return false;
  }

  const window = getOrganizationDateWindow({
    organizationId,
    relativePeriod: RELATIVE_PERIODS.THIS_WEEK,
    reference
  });

  return isTimestampInWindow(timestampMs, window);
}

async function loadProductionProspects(organizationId) {
  if (!organizationId) {
    throw new Error("organizationId is required to load production prospects");
  }

  const { data, error } = await supabase
    .from("prospects")
    .select("*")
    .eq("organization_id", organizationId);

  if (error) {
    throw error;
  }

  return filterOutOperationalTestProspects(
    filterProductionProspects(data || [])
  );
}

function findProspectByPhone(prospects, phone) {
  return prospects.find((row) => row.phone === phone) || null;
}

function buildTodayFocus(prospects, queue, context = {}) {
  const todayWindow =
    context.todayWindow ||
    getOrganizationDateWindow({
      organizationId: context.organizationId || null,
      relativePeriod: RELATIVE_PERIODS.TODAY,
      reference: context.reference || new Date()
    });

  const interviewsToday = queue.filter((summary) => {
    const prospect = findProspectByPhone(prospects, summary.phone);
    const at = parseInterviewDatetime(prospect);
    return Boolean(at && isTimestampInWindow(at, todayWindow));
  });

  const pendingOutcomes = queue.filter(
    (summary) =>
      summary.missionControlPriorityTier === "PENDING_INTERVIEW_RESULTS" ||
      summary.canonicalMilestone === MILESTONES.INTERVIEW_RESULT_PENDING
  );

  const highPriority = queue.filter(
    (summary) => summary.missionControlPriority <= PRIORITY_TIERS.HUMAN_ESCALATION
  );

  const orientationReady = queue.filter((summary) => {
    if (summary.canonicalMilestone !== MILESTONES.ORIENTATION) {
      return false;
    }

    const agentState = loadAgentState(summary.phone);
    return agentState.outcome === "Recruited" && !agentState.orientationScheduled;
  });

  const stalled = queue.filter((summary) => Boolean(summary.stalledAt));

  return {
    interviewsToday: {
      count: interviewsToday.length,
      filter: EXECUTIVE_FILTERS.INTERVIEWS_TODAY,
      phones: interviewsToday.map((row) => row.phone)
    },
    pendingInterviewOutcomes: {
      count: pendingOutcomes.length,
      filter: EXECUTIVE_FILTERS.PENDING_OUTCOMES,
      phones: pendingOutcomes.map((row) => row.phone)
    },
    highPriorityProspects: {
      count: highPriority.length,
      filter: EXECUTIVE_FILTERS.HIGH_PRIORITY,
      phones: highPriority.map((row) => row.phone)
    },
    recruitsReadyForOrientation: {
      count: orientationReady.length,
      filter: EXECUTIVE_FILTERS.ORIENTATION_READY,
      phones: orientationReady.map((row) => row.phone)
    },
    stalledProspects: {
      count: stalled.length,
      filter: EXECUTIVE_FILTERS.STALLED,
      phones: stalled.map((row) => row.phone)
    }
  };
}

function buildProductionSnapshot(prospects, queue, context = {}) {
  const todayWindow =
    context.todayWindow ||
    getOrganizationDateWindow({
      organizationId: context.organizationId || null,
      relativePeriod: RELATIVE_PERIODS.TODAY,
      reference: context.reference || new Date()
    });
  const weekWindow =
    context.weekWindow ||
    getOrganizationDateWindow({
      organizationId: context.organizationId || null,
      relativePeriod: RELATIVE_PERIODS.THIS_WEEK,
      reference: context.reference || new Date()
    });

  const interviewsToday = queue.filter((summary) => {
    const prospect = findProspectByPhone(prospects, summary.phone);
    const at = parseInterviewDatetime(prospect);
    return Boolean(at && isTimestampInWindow(at, todayWindow));
  }).length;

  const interviewsThisWeek = queue.filter((summary) => {
    const prospect = findProspectByPhone(prospects, summary.phone);
    const at = parseInterviewDatetime(prospect);
    return Boolean(at && isTimestampInWindow(at, weekWindow));
  }).length;

  const recruitCount = queue.filter(
    (summary) =>
      summary.canonicalMilestone === MILESTONES.ORIENTATION ||
      summary.canonicalMilestone === MILESTONES.LICENSING ||
      summary.canonicalMilestone === MILESTONES.FAST_START
  ).length;

  return {
    workflow: {
      source: "workflow",
      todaysAppointments: interviewsToday,
      thisWeekInterviews: interviewsThisWeek,
      recruitCount
    },
    placeholder: {
      source: "placeholder",
      submittedPremium: null,
      applicationsPending: null,
      note: "Premium and application metrics require production integration."
    }
  };
}

function buildTodayCalendar(prospects, queue, context = {}) {
  const todayWindow =
    context.todayWindow ||
    getOrganizationDateWindow({
      organizationId: context.organizationId || null,
      relativePeriod: RELATIVE_PERIODS.TODAY,
      reference: context.reference || new Date()
    });

  const interviews = [];
  const orientations = [];
  const training = [];
  const appointments = [];

  queue.forEach((summary) => {
    const prospect = findProspectByPhone(prospects, summary.phone);
    const at = parseInterviewDatetime(prospect);

    if (!at || !isTimestampInWindow(at, todayWindow)) {
      return;
    }

    const entry = {
      phone: summary.phone,
      name: summary.name || summary.phone,
      time: new Date(at).toISOString(),
      type:
        summary.canonicalMilestone === MILESTONES.ORIENTATION
          ? "orientation"
          : "interview",
      interviewType: prospect?.interview_type || null
    };

    if (summary.canonicalMilestone === MILESTONES.ORIENTATION) {
      orientations.push(entry);
      appointments.push({ ...entry, category: "orientation" });
      return;
    }

    interviews.push(entry);
    appointments.push({ ...entry, category: "interview" });
  });

  return {
    interviews,
    orientations,
    training,
    appointments: appointments.sort(
      (left, right) => Date.parse(left.time) - Date.parse(right.time)
    )
  };
}

function formatRecommendationTitle(summary, prospect) {
  const tier = summary.missionControlPriorityTier;

  if (tier === "PENDING_INTERVIEW_RESULTS") {
    return "Interview Outcome Required";
  }

  if (summary.stalledAt) {
    const hours = Math.max(
      1,
      Math.round((Date.now() - Date.parse(summary.stalledAt)) / 3600000)
    );
    return `Prospect waiting ${hours} hour${hours === 1 ? "" : "s"}`;
  }

  if (summary.canonicalMilestone === MILESTONES.ORIENTATION) {
    const agentState = loadAgentState(summary.phone);
    if (agentState.outcome === "Recruited" && !agentState.orientationScheduled) {
      return "Orientation overdue";
    }
  }

  if (tier === "FOLLOW_UP_DUE") {
    return "Hot lead needs follow-up";
  }

  if (tier === "HUMAN_ESCALATION") {
    return "Human escalation required";
  }

  if (tier === "INTERVIEW_IMMEDIATE") {
    return "Interview imminent";
  }

  if (summary.canonicalMilestone === MILESTONES.NEW_LEAD) {
    return "New lead needs outreach";
  }

  return `Priority action — ${summary.canonicalMilestone.replace(/_/g, " ").toLowerCase()}`;
}

function buildRecommendations(queue, prospects, limit = 5) {
  return queue.slice(0, limit).map((summary, index) => {
    const prospect = findProspectByPhone(prospects, summary.phone);

    return {
      rank: index + 1,
      phone: summary.phone,
      name: summary.name || summary.phone,
      title: formatRecommendationTitle(summary, prospect),
      canonicalMilestone: summary.canonicalMilestone,
      missionControlPriority: summary.missionControlPriority,
      missionControlPriorityTier: summary.missionControlPriorityTier,
      stalledAt: summary.stalledAt,
      filter: resolveRecommendationFilter(summary),
      missionControlPath: `/mission-control?phone=${encodeURIComponent(summary.phone)}`
    };
  });
}

function resolveRecommendationFilter(summary) {
  if (
    summary.missionControlPriorityTier === "PENDING_INTERVIEW_RESULTS" ||
    summary.canonicalMilestone === MILESTONES.INTERVIEW_RESULT_PENDING
  ) {
    return EXECUTIVE_FILTERS.PENDING_OUTCOMES;
  }

  if (summary.stalledAt) {
    return EXECUTIVE_FILTERS.STALLED;
  }

  if (summary.canonicalMilestone === MILESTONES.ORIENTATION) {
    return EXECUTIVE_FILTERS.ORIENTATION_READY;
  }

  if (summary.missionControlPriority <= PRIORITY_TIERS.HUMAN_ESCALATION) {
    return EXECUTIVE_FILTERS.HIGH_PRIORITY;
  }

  return null;
}

function formatActivitySummary(event) {
  const type = event.event_type || event.eventType || "Event";
  const payload = event.payload || {};

  switch (type) {
    case "InterviewCompleted":
      return "Interview completed";
    case "InterviewScheduled":
      return "Appointment scheduled";
    case "InterviewRescheduled":
      return "Interview rescheduled";
    case "ProspectAdvanced":
      return payload.reason === "time_based_reconciliation"
        ? "Workflow progressed (timing)"
        : "Recruit advanced";
    case "ReminderScheduled":
    case "ReminderSent":
      return "Reminder sent";
    case "FollowUpScheduled":
      return "Follow-up scheduled";
    case "ConversationStalled":
      return "Conversation stalled";
    case "WorkflowOwnershipChanged":
      return "Ownership changed";
    case "InterviewResultRecorded":
      return "Interview outcome recorded";
    default:
      return type.replace(/([A-Z])/g, " $1").trim();
  }
}

async function buildRecentActivity(productionPhones, limit = 20) {
  const events = await listRecentWorkflowEvents(limit * 3);
  const phoneSet = new Set(productionPhones);

  return events
    .filter((row) => phoneSet.has(row.prospect_phone))
    .slice(0, limit)
    .map((row) => ({
      id: row.id,
      phone: row.prospect_phone,
      eventType: row.event_type,
      summary: formatActivitySummary(row),
      actor: row.actor,
      milestoneBefore: row.milestone_before,
      milestoneAfter: row.milestone_after,
      timestamp: row.created_at
    }));
}

function buildAgencyPulse(prospects, queue, todayFocus) {
  const followUpBacklog = queue.filter(
    (summary) => summary.missionControlPriorityTier === "FOLLOW_UP_DUE"
  ).length;

  const activeProspects = queue.filter(
    (summary) =>
      summary.canonicalMilestone !== MILESTONES.CLOSED &&
      summary.canonicalMilestone !== MILESTONES.DO_NOT_CONTACT
  ).length;

  return computeAgencyPulseScore({
    pendingInterviewOutcomes: todayFocus.pendingInterviewOutcomes.count,
    stalledProspects: todayFocus.stalledProspects.count,
    followUpBacklog,
    interviewsToday: todayFocus.interviewsToday.count,
    activeProspects
  });
}

async function buildExecutiveDashboard(organizationId, options = {}) {
  if (!organizationId) {
    throw new Error("organizationId is required to build executive dashboard");
  }

  const reference = options.reference ? new Date(options.reference) : new Date();
  const todayWindow = getOrganizationDateWindow({
    organizationId,
    relativePeriod: RELATIVE_PERIODS.TODAY,
    reference
  });
  const weekWindow = getOrganizationDateWindow({
    organizationId,
    relativePeriod: RELATIVE_PERIODS.THIS_WEEK,
    reference
  });
  const context = { organizationId, reference, todayWindow, weekWindow };

  const prospects = await loadProductionProspects(organizationId);
  const queue = await buildPrioritizedWorkflowQueue(prospects);
  const todayFocus = buildTodayFocus(prospects, queue, context);
  const productionSnapshot = buildProductionSnapshot(prospects, queue, context);
  const agencyPulse = buildAgencyPulse(prospects, queue, todayFocus);
  const recommendations = buildRecommendations(queue, prospects);
  const calendar = buildTodayCalendar(prospects, queue, context);
  const activity = await buildRecentActivity(
    prospects.map((row) => row.phone)
  );

  return {
    generatedAt: new Date().toISOString(),
    timeZone: todayWindow.timeZone,
    period: {
      timeZone: todayWindow.timeZone,
      period: RELATIVE_PERIODS.TODAY,
      localStart: todayWindow.localStart,
      localEnd: todayWindow.localEnd
    },
    prospectCount: prospects.length,
    todayFocus,
    productionSnapshot,
    agencyPulse,
    recommendations,
    calendar,
    activity,
    prioritizedWorkflowQueue: queue
  };
}

module.exports = {
  buildExecutiveDashboard,
  buildRecommendations,
  buildRecentActivity,
  buildTodayFocus,
  buildProductionSnapshot,
  buildTodayCalendar,
  buildAgencyPulse,
  loadProductionProspects,
  EXECUTIVE_FILTERS,
  isSameLocalDay
};
