const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildKpiMetrics,
  buildRecruitmentFunnel,
  buildConversationOwnership,
  buildSevenDayAppointmentTrend,
  buildExecutiveDashboardV2Metrics,
  countCompletedAppointments,
  countPipelineMetrics
} = require("../core/executiveDashboardV2Metrics");
const { MILESTONES } = require("../core/workflowConstants");
const { getOrganizationDateWindow, RELATIVE_PERIODS } = require("../core/organizationDateWindow");

const ORG = "00000000-0000-4000-8000-000000000001";
const OTHER_ORG = "00000000-0000-4000-8000-000000000099";

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

function appointment(overrides = {}) {
  return {
    id: "appt-1",
    organizationId: ORG,
    prospectPhone: "+15550001111",
    status: "scheduled",
    outcome: null,
    startDateTime: "2026-08-23T15:00:00.000Z",
    metadata: {},
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

test("buildRecruitmentFunnel counts confirmed from prospect current_step", () => {
  const prospects = [
    prospect({ phone: "+15550003333", current_step: "CONFIRMED" })
  ];
  const funnel = buildRecruitmentFunnel(
    [
      summary({ canonicalMilestone: MILESTONES.NEW_LEAD }),
      summary({ phone: "+15550003333", canonicalMilestone: MILESTONES.INTERVIEW_SCHEDULED })
    ],
    prospects,
    []
  );

  const confirmedStage = funnel.stages.find((stage) => stage.key === "confirmed");
  assert.equal(confirmedStage.count, 1);
});

test("buildRecruitmentFunnel completed uses appointment completion not INTERVIEW_COMPLETED", () => {
  const funnel = buildRecruitmentFunnel(
    [
      summary({ canonicalMilestone: MILESTONES.NEW_LEAD }),
      summary({ phone: "+15550002222", canonicalMilestone: MILESTONES.QUALIFICATION }),
      summary({ phone: "+15550003333", canonicalMilestone: MILESTONES.INTERVIEW_SCHEDULED }),
      summary({ phone: "+15550004444", canonicalMilestone: MILESTONES.INTERVIEW_COMPLETED }),
      summary({ phone: "+15550005555", canonicalMilestone: MILESTONES.ORIENTATION })
    ],
    [],
    [
      appointment({
        id: "c1",
        prospectPhone: "+15550004444",
        status: "completed",
        outcome: "follow_up"
      })
    ]
  );

  const completedStage = funnel.stages.find((stage) => stage.key === "completed");
  const recruitedStage = funnel.stages.find((stage) => stage.key === "recruited");
  assert.equal(completedStage.count, 1);
  assert.equal(recruitedStage.count, 1);
  // totalConversionPct is recruited / newLeads (first→last stage), not completed.
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
    yesterdayWindow,
    appointments: [
      appointment({
        status: "completed",
        outcome: "not_interested",
        startDateTime: "2026-08-23T15:00:00.000Z"
      })
    ]
  });

  assert.equal(trend.length, 7);
  assert.ok(trend.some((day) => day.scheduled >= 0));
  assert.ok(trend.some((day) => day.completed >= 1));
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
    }),
    appointments: []
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
    yesterdayWindow,
    appointments: []
  });

  assert.equal(kpi.newProspects, 1);
  assert.equal(kpi.comparison.newProspects, 0);
});

test("completed KPI counts RECRUITED outcome appointment", () => {
  const appointments = [
    appointment({
      status: "completed",
      outcome: "recruited",
      metadata: { lifecycleState: "recruited" }
    })
  ];
  const queue = [
    summary({ canonicalMilestone: MILESTONES.ORIENTATION })
  ];

  const pipeline = countPipelineMetrics([prospect()], queue, appointments);
  assert.equal(pipeline.completed, 1);
  assert.equal(pipeline.recruited, 1);
  assert.equal(countCompletedAppointments(appointments), 1);
});

test("completed KPI counts BECAME_CLIENT / client outcome appointment", () => {
  const appointments = [
    appointment({
      status: "completed",
      outcome: "client",
      metadata: { lifecycleState: "became_client" }
    })
  ];

  assert.equal(countCompletedAppointments(appointments), 1);
  assert.equal(
    countPipelineMetrics([prospect()], [summary({ canonicalMilestone: MILESTONES.CLOSED })], appointments)
      .completed,
    1
  );
});

test("completed KPI counts FOLLOW_UP_NEEDED / follow_up outcome", () => {
  const appointments = [
    appointment({ status: "completed", outcome: "follow_up" })
  ];
  assert.equal(countCompletedAppointments(appointments), 1);
});

test("completed KPI counts NOT_INTERESTED outcome", () => {
  const appointments = [
    appointment({ status: "completed", outcome: "not_interested" })
  ];
  assert.equal(countCompletedAppointments(appointments), 1);
});

test("completed KPI counts no_show as completed appointment", () => {
  const appointments = [
    appointment({
      status: "no_show",
      outcome: "no_show",
      metadata: { lifecycleState: "no_show" }
    })
  ];
  assert.equal(countCompletedAppointments(appointments), 1);
});

test("scheduled but not completed appointment does not count", () => {
  const appointments = [
    appointment({ status: "scheduled", outcome: null })
  ];
  assert.equal(countCompletedAppointments(appointments), 0);

  const kpi = buildKpiMetrics(
    [prospect()],
    [summary({ canonicalMilestone: MILESTONES.INTERVIEW_SCHEDULED })],
    { appointments, todayWindow: { localStart: "x" }, yesterdayWindow: { localStart: "y" } }
  );
  assert.equal(kpi.completed, 0);
});

test("cancelled appointment does not count as completed", () => {
  const appointments = [
    appointment({
      status: "cancelled",
      outcome: "cancelled",
      metadata: { lifecycleState: "cancelled" }
    })
  ];
  assert.equal(countCompletedAppointments(appointments), 0);
});

test("INTERVIEW_COMPLETED milestone alone does not inflate Completed without appointment", () => {
  const pipeline = countPipelineMetrics(
    [prospect()],
    [summary({ canonicalMilestone: MILESTONES.INTERVIEW_COMPLETED })],
    []
  );
  assert.equal(pipeline.completed, 0);
});

test("Recruited KPI remains separate from Completed", () => {
  const appointments = [
    appointment({
      id: "a1",
      status: "completed",
      outcome: "recruited",
      metadata: { lifecycleState: "recruited" }
    }),
    appointment({
      id: "a2",
      prospectPhone: "+15550002222",
      status: "completed",
      outcome: "not_interested"
    })
  ];
  const queue = [
    summary({ canonicalMilestone: MILESTONES.ORIENTATION }),
    summary({ phone: "+15550002222", canonicalMilestone: MILESTONES.CLOSED })
  ];

  const pipeline = countPipelineMetrics(
    [prospect(), prospect({ phone: "+15550002222" })],
    queue,
    appointments
  );

  assert.equal(pipeline.completed, 2);
  assert.equal(pipeline.recruited, 1);
});

test("tenant isolation: appointments from other orgs are not mixed by metrics (caller scopes list)", () => {
  const scopedToOrg = [
    appointment({ organizationId: ORG, status: "completed", outcome: "follow_up" })
  ];
  const otherOrgOnly = [
    appointment({
      organizationId: OTHER_ORG,
      prospectPhone: "+19999999999",
      status: "completed",
      outcome: "recruited"
    })
  ];

  assert.equal(countCompletedAppointments(scopedToOrg), 1);
  assert.equal(countCompletedAppointments([]), 0);
  // Metrics trust the pre-scoped appointment list; empty scope => 0.
  assert.equal(
    buildKpiMetrics([prospect()], [summary()], {
      appointments: otherOrgOnly.filter((row) => row.organizationId === ORG),
      todayWindow: { localStart: "x" },
      yesterdayWindow: { localStart: "y" }
    }).completed,
    0
  );
});

test("dashboard refetch returns updated completed count after completion", () => {
  const reference = new Date("2026-08-23T16:00:00.000Z");
  const contextBase = {
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
  };

  const before = buildExecutiveDashboardV2Metrics([prospect()], [summary()], {
    ...contextBase,
    appointments: [appointment({ status: "scheduled" })]
  });
  assert.equal(before.kpi.completed, 0);

  const after = buildExecutiveDashboardV2Metrics([prospect()], [summary()], {
    ...contextBase,
    appointments: [
      appointment({
        status: "completed",
        outcome: "not_interested",
        metadata: { lifecycleState: "completed" }
      })
    ]
  });
  assert.equal(after.kpi.completed, 1);
  assert.equal(
    after.funnel.stages.find((stage) => stage.key === "completed").count,
    1
  );
});
