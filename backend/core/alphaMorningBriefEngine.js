/**
 * Sprint 12 — Executive morning brief (Alpha format).
 */

const { DEFAULT_ORGANIZATION_ID } = require("../modules/prospects/domain/constants");
const { buildExecutiveDashboard, loadProductionProspects } = require("./executiveDashboardReadModel");
const { MILESTONES } = require("./workflowConstants");
const { parseInterviewDatetime } = require("./parseInterviewDatetime");

function startOfYesterday(reference = new Date()) {
  const date = new Date(reference);
  date.setDate(date.getDate() - 1);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfYesterday(reference = new Date()) {
  const date = startOfYesterday(reference);
  date.setHours(23, 59, 59, 999);
  return date;
}

function isBetween(dateValue, start, end) {
  const ms = Date.parse(dateValue);
  return !Number.isNaN(ms) && ms >= start.getTime() && ms <= end.getTime();
}

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
  const executive = await buildExecutiveDashboard(organizationId);
  const prospects = await loadProductionProspects(organizationId);
  const queue = executive.prioritizedWorkflowQueue || [];
  const prospectByPhone = new Map(prospects.map((row) => [row.phone, row]));

  const yesterdayStart = startOfYesterday();
  const yesterdayEnd = endOfYesterday();

  let newProspects = 0;
  let qualified = 0;
  let appointments = 0;
  let confirmed = 0;
  let completed = 0;
  let recruited = 0;

  for (const summary of queue) {
    const prospect = prospectByPhone.get(summary.phone) || {};
    const createdAt = prospect.created_at;

    if (createdAt && isBetween(createdAt, yesterdayStart, yesterdayEnd)) {
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
    if (!at) {
      return false;
    }

    const today = new Date();
    const interviewDate = new Date(at);
    return (
      interviewDate.getFullYear() === today.getFullYear() &&
      interviewDate.getMonth() === today.getMonth() &&
      interviewDate.getDate() === today.getDate()
    );
  }).length;

  const hotProspects = queue.filter((row) => row.missionControlPriority <= 2).length;
  const topRecommendation = executive.recommendations?.[0] || null;

  return {
    generatedAt: new Date().toISOString(),
    greeting: greetingForHour(new Date().getHours()),
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
      hotProspects
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
      greeting: greetingForHour(new Date().getHours()),
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
