/**
 * Sprint 12 — Executive morning brief (Alpha format).
 * Implements BR-079 — organization-local calendar windows for Yesterday/Today metrics.
 */

const { DEFAULT_ORGANIZATION_ID } = require("../modules/prospects/domain/constants");
const { buildExecutiveDashboard, loadProductionProspects } = require("./executiveDashboardReadModel");
const { MILESTONES } = require("./workflowConstants");
const { parseInterviewDatetime } = require("./parseInterviewDatetime");
const {
  RELATIVE_PERIODS,
  getOrganizationDateWindow,
  isTimestampInWindow,
  buildDateWindowCacheKey,
  partsInZone
} = require("./organizationDateWindow");

function greetingForHour(hour) {
  if (hour < 12) {
    return "Good Morning.";
  }

  if (hour < 17) {
    return "Good Afternoon.";
  }

  return "Good Evening.";
}

async function buildAlphaMorningBrief(options = {}) {
  const organizationId = options.organizationId || DEFAULT_ORGANIZATION_ID;
  const reference = options.reference ? new Date(options.reference) : new Date();
  const loadProspects = options.loadProductionProspects || loadProductionProspects;
  const buildExecutive = options.buildExecutiveDashboard || buildExecutiveDashboard;
  const executive = await buildExecutive(organizationId, { reference });
  const prospects = await loadProspects(organizationId);
  const queue = executive.prioritizedWorkflowQueue || [];
  const prospectByPhone = new Map(prospects.map((row) => [row.phone, row]));

  const yesterdayWindow = getOrganizationDateWindow({
    organizationId,
    relativePeriod: RELATIVE_PERIODS.YESTERDAY,
    reference
  });
  const todayWindow = getOrganizationDateWindow({
    organizationId,
    relativePeriod: RELATIVE_PERIODS.TODAY,
    reference
  });

  let newProspects = 0;
  let qualified = 0;
  let appointments = 0;
  let confirmed = 0;
  let completed = 0;
  let recruited = 0;

  for (const summary of queue) {
    const prospect = prospectByPhone.get(summary.phone) || {};
    const createdAt = prospect.created_at;

    // Creation metric is historical — current lifecycle status must not remove the count.
    if (createdAt && isTimestampInWindow(createdAt, yesterdayWindow)) {
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
      appointments += 1;
    }

    if (prospect.current_step === "CONFIRMED") {
      confirmed += 1;
    }

    if (summary.canonicalMilestone === MILESTONES.INTERVIEW_COMPLETED) {
      completed += 1;
    }

    if (
      summary.canonicalMilestone === MILESTONES.ORIENTATION ||
      summary.canonicalMilestone === MILESTONES.LICENSING
    ) {
      recruited += 1;
    }
  }

  const followUpsOverdue = queue.filter(
    (row) => row.canonicalMilestone === MILESTONES.FOLLOW_UP && row.needsHumanAttention
  ).length;

  const interviewsToday = queue.filter((row) => {
    const prospect = prospectByPhone.get(row.phone);
    const at = parseInterviewDatetime(prospect || {});
    return Boolean(at && isTimestampInWindow(at, todayWindow));
  }).length;

  const hotProspects = queue.filter((row) => row.missionControlPriority <= 2).length;
  const topRecommendation = executive.recommendations?.[0] || null;
  const localHour = partsInZone(reference.getTime(), todayWindow.timeZone).hour;

  // Implements BR-080 — attention counts (org-local day for "new today" via created_at window).
  let unassignedLeads = 0;
  let newUnacknowledgedLeads = 0;
  let humanAttentionRequiredLeads = 0;

  for (const summary of queue) {
    const prospect = prospectByPhone.get(summary.phone) || {};
    if (!prospect.owner_user_id) {
      unassignedLeads += 1;
    }

    if (
      !prospect.acknowledged_at &&
      (prospect.attention_status === "new" ||
        prospect.attention_status === "ai_responding" ||
        prospect.attention_status === "waiting_for_prospect" ||
        prospect.attention_status === "human_required" ||
        prospect.new_lead_received_at)
    ) {
      newUnacknowledgedLeads += 1;
    }

    if (
      summary.needsHumanAttention ||
      prospect.attention_status === "human_required"
    ) {
      humanAttentionRequiredLeads += 1;
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    timeZone: todayWindow.timeZone,
    period: {
      yesterday: {
        timeZone: yesterdayWindow.timeZone,
        period: RELATIVE_PERIODS.YESTERDAY,
        localStart: yesterdayWindow.localStart,
        localEnd: yesterdayWindow.localEnd
      },
      today: {
        timeZone: todayWindow.timeZone,
        period: RELATIVE_PERIODS.TODAY,
        localStart: todayWindow.localStart,
        localEnd: todayWindow.localEnd
      }
    },
    cacheKey: buildDateWindowCacheKey({
      organizationId,
      timeZone: yesterdayWindow.timeZone,
      period: RELATIVE_PERIODS.YESTERDAY,
      localStart: yesterdayWindow.localStart,
      localEnd: yesterdayWindow.localEnd
    }),
    greeting: greetingForHour(localHour),
    yesterday: {
      newProspects,
      qualified,
      appointments,
      confirmed,
      completed,
      recruited
    },
    todaysPriorities: {
      followUpsOverdue,
      interviewsToday,
      hotProspects,
      unassignedLeads,
      newUnacknowledgedLeads,
      humanAttentionRequiredLeads
    },
    attention: {
      unassignedLeads,
      newUnacknowledgedLeads,
      humanAttentionRequiredLeads
    },
    aiRecommendation: topRecommendation
      ? {
          label: `Call ${topRecommendation.name || topRecommendation.phone} first.`,
          phone: topRecommendation.phone,
          reason: topRecommendation.reason || topRecommendation.title || null
        }
      : {
          label: "Review the priority queue in Mission Control.",
          phone: null,
          reason: null
        },
    lines: buildBriefLines({
      greeting: greetingForHour(localHour),
      yesterday: { newProspects, qualified, appointments, confirmed, completed, recruited },
      todaysPriorities: { followUpsOverdue, interviewsToday, hotProspects },
      aiRecommendation: topRecommendation
    })
  };
}

function buildBriefLines({ greeting, yesterday, todaysPriorities, aiRecommendation }) {
  const lines = [greeting, "", "Yesterday", ""];

  lines.push(`${yesterday.newProspects} new prospects`);
  lines.push(`${yesterday.qualified} qualified`);
  lines.push(`${yesterday.appointments} appointments`);
  lines.push(`${yesterday.confirmed} confirmed`);
  lines.push(`${yesterday.completed} completed`);
  lines.push(`${yesterday.recruited} recruited`);
  lines.push("", "Today's Priorities", "");
  lines.push(`${todaysPriorities.followUpsOverdue} follow-ups overdue`);
  lines.push(`${todaysPriorities.interviewsToday} interviews today`);
  lines.push(`${todaysPriorities.hotProspects} hot prospects`);
  lines.push("", "AI Recommendation", "");
  lines.push(
    aiRecommendation?.name
      ? `Call ${aiRecommendation.name} first.`
      : "Review Mission Control priority queue."
  );

  return lines;
}

module.exports = {
  buildAlphaMorningBrief
};
