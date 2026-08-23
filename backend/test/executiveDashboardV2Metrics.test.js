const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildKpiMetrics,
  buildRecruitmentFunnel,
  buildConversationOwnership,
  buildSevenDayAppointmentTrend,
  buildExecutiveDashboardV2Metrics
} = require("../core/executiveDashboardV2Metrics");
const { MILESTONES } = require("../core/workflowConstants");
const { getOrganizationDateWindow, RELATIVE_PERIODS } = require("../core/organizationDateWindow");

const ORG = "00000000-0000-4000-8000-000000000001";

function prospect(overrides = {}) {
  return {
    phone: "+15550001111",
    name: "Test",
    created_at: "2026-08-23T12:00:00.000Z",
    current_step: "NEW",
    interview_time: "2026-08-23T15:00:00.000Z",
    ...overrides
  };
}

function summary(overrides = {}) {
  return {
    phone: "+15550001111",
    canonicalMilestone: MILESTONES.NEW_LEAD,
    workflowOwnership: "ATLAS",
    needsHumanAttention: false,
    ...overrides
  };
}

test("buildConversationOwnership uses ATLAS / HUMAN / NEEDS_ATTENTION semantics", () => {
  const result = buildConversationOwnership([
    summary({ workflowOwnership: "ATLAS" }),
    summary({ phone: "+15550002222", workflowOwnership: "HUMAN" }),
    summary({ phone: "+15550003333", needsHumanAttention: true })
  ]);

  assert.equal(result.atlas, 1);
  assert.equal(result.human, 1);
  assert.equal(result.needsAttention, 1);
  assert.equal(result.total, 3);
  assert.equal(result.averageResponseTimeMs, null);
});

test("buildRecruitmentFunnel returns stage conversion without fabricating totals", () => {
  const funnel = buildRecruitmentFunnel([
    summary({ canonicalMilestone: MILESTONES.NEW_LEAD }),
    summary({ phone: "+15550002222", canonicalMilestone: MILESTONES.QUALIFICATION }),
    summary({ phone: "+15550003333", canonicalMilestone: MILESTONES.INTERVIEW_SCHEDULED }),
    summary({ phone: "+15550004444", canonicalMilestone: MILESTONES.INTERVIEW_COMPLETED }),
    summary({ phone: "+15550005555", canonicalMilestone: MILESTONES.ORIENTATION })
  ]);

  assert.equal(funnel.stages[0].count, 1);
  assert.equal(funnel.stages[funnel.stages.length - 1].count, 1);
  assert.equal(funnel.totalConversionPct, 100);
});

test("buildSevenDayAppointmentTrend returns seven buckets", () => {
  const reference = new Date("2026-08-23T16:00:00.000Z");
  const todayWindow = getOrganizationDateWindow({
    organizationId: ORG,
    relativePeriod: RELATIVE_PERIODS.TODAY,
    reference
  });
  const yesterdayWindow = getOrganizationDateWindow({
    organizationId: ORG,
    relativePeriod: RELATIVE_PERIODS.YESTERDAY,
    reference
  });

  const prospects = [prospect()];
  const queue = [summary({ canonicalMilestone: MILESTONES.INTERVIEW_SCHEDULED })];

  const trend = buildSevenDayAppointmentTrend(prospects, queue, {
    organizationId: ORG,
    reference,
    todayWindow,
    yesterdayWindow
  });

  assert.equal(trend.length, 7);
  assert.ok(trend.some((day) => day.scheduled >= 0));
});

test("buildExecutiveDashboardV2Metrics packages kpi funnel ownership trend", () => {
  const reference = new Date("2026-08-23T16:00:00.000Z");
  const metrics = buildExecutiveDashboardV2Metrics([prospect()], [summary()], {
    organizationId: ORG,
    reference,
    todayWindow: getOrganizationDateWindow({
      organizationId: ORG,
      relativePeriod: RELATIVE_PERIODS.TODAY,
      reference
    }),
    yesterdayWindow: getOrganizationDateWindow({
      organizationId: ORG,
      relativePeriod: RELATIVE_PERIODS.YESTERDAY,
      reference
    })
  });

  assert.ok(metrics.kpi);
  assert.ok(metrics.funnel);
  assert.ok(metrics.conversationOwnership);
  assert.equal(metrics.trend7Day.length, 7);
});

test("buildKpiMetrics compares new prospects today vs yesterday", () => {
  const reference = new Date("2026-08-23T16:00:00.000Z");
  const todayWindow = getOrganizationDateWindow({
    organizationId: ORG,
    relativePeriod: RELATIVE_PERIODS.TODAY,
    reference
  });
  const yesterdayWindow = getOrganizationDateWindow({
    organizationId: ORG,
    relativePeriod: RELATIVE_PERIODS.YESTERDAY,
    reference
  });

  const prospects = [
    prospect({ created_at: todayWindow.localStart }),
    prospect({
      phone: "+15550002222",
      created_at: yesterdayWindow.localStart
    })
  ];

  const kpi = buildKpiMetrics(prospects, [summary(), summary({ phone: "+15550002222" })], {
    todayWindow,
    yesterdayWindow
  });

  assert.equal(kpi.newProspects, 1);
  assert.equal(kpi.comparison.newProspects, 0);
});
