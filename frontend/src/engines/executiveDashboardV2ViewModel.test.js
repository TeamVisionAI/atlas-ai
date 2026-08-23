import assert from "node:assert/strict";
import test from "node:test";
import {
  buildExecutiveDashboardV2ViewModel,
  buildKpiCards,
  buildPriorities,
  AGENDA_LIMIT,
  ACTIVITY_LIMIT
} from "../engines/executiveDashboardV2ViewModel.js";

function translate(key, params = {}) {
  const dictionary = {
    executiveBriefGreetingMorning: "Buenos días.",
    executiveV2Subtitle: "Aquí tienes el panorama operativo de {organizationName}.",
    executiveV2AgendaInterview: "Entrevista",
    executiveV2LocationZoom: "Zoom",
    executiveV2LocationInPerson: "Presencial",
    executiveV2AgendaStatus_confirmed: "Confirmada",
    executiveV2AgendaStatus_waiting_confirmation: "Esperando confirmación",
    executiveV2KpiNewProspects: "Prospectos nuevos",
    executiveV2KpiQualified: "Calificados",
    executiveV2KpiAppointments: "Citas agendadas",
    executiveV2KpiConfirmed: "Confirmadas",
    executiveV2KpiCompleted: "Completadas",
    executiveV2KpiRecruited: "Reclutados",
    executiveV2FunnelNewLeads: "Nuevos leads",
    executiveV2FunnelQualified: "Calificados",
    executiveV2FunnelTotalConversion: "Conversión total: {value}%",
    executiveV2ConversationAtlas: "Atlas",
    executiveV2ConversationHuman: "Humano",
    executiveV2ConversationNeedsAttention: "Requiere atención",
    executiveV2ConversationTotal: "{count} conversaciones",
    executiveV2PriorityFollowUps: "Seguimientos urgentes",
    executiveV2PriorityPendingConfirmation: "Citas pendientes de confirmación",
    executiveV2PriorityNewUncontacted: "Prospectos nuevos sin contacto",
    executiveV2PriorityOutcomePending: "Resultado pendiente",
    executiveV2PriorityStalled: "Prospectos estancados"
  };

  let value = dictionary[key] || key;
  for (const [name, replacement] of Object.entries(params)) {
    value = value.replace(`{${name}}`, String(replacement));
  }
  return value;
}

const executiveFixture = {
  generatedAt: "2026-08-23T16:00:00.000Z",
  timeZone: "America/New_York",
  todayFocus: {
    interviewsToday: { count: 2 },
    pendingInterviewOutcomes: { count: 1 },
    stalledProspects: { count: 3 }
  },
  calendar: {
    appointments: [
      {
        phone: "+15550001111",
        name: "Ana",
        time: "2026-08-23T15:00:00.000Z",
        type: "interview",
        interviewType: "zoom"
      },
      {
        phone: "+15550002222",
        name: "Luis",
        time: "2026-08-23T17:00:00.000Z",
        type: "interview",
        interviewType: "in_person"
      }
    ]
  },
  activity: Array.from({ length: 8 }).map((_, index) => ({
    id: `evt-${index}`,
    phone: "+15550001111",
    summary: `Event ${index}`,
    timestamp: `2026-08-23T1${index}:00:00.000Z`
  })),
  prioritizedWorkflowQueue: [
    {
      phone: "+15550001111",
      canonicalMilestone: "INTERVIEW_SCHEDULED",
      workflowOwnership: "ATLAS",
      needsHumanAttention: false
    },
    {
      phone: "+15550002222",
      canonicalMilestone: "INTERVIEW_READY",
      workflowOwnership: "HUMAN",
      needsHumanAttention: false
    }
  ],
  v2Metrics: {
    kpi: {
      newProspects: 2,
      qualified: 4,
      appointments: 3,
      confirmed: 2,
      completed: 1,
      recruited: 1,
      comparison: { newProspects: 1 }
    },
    funnel: {
      stages: [
        { key: "newLeads", count: 5, conversionPct: null },
        { key: "qualified", count: 4, conversionPct: 80 }
      ],
      totalConversionPct: 20
    },
    conversationOwnership: {
      atlas: 3,
      human: 2,
      needsAttention: 1,
      total: 6,
      averageResponseTimeMs: null
    },
    trend7Day: [{ date: "2026-08-23", label: "2026-08-23", scheduled: 1, confirmed: 1, completed: 0 }]
  }
};

test("buildExecutiveDashboardV2ViewModel maps KPI cards and header", () => {
  const model = buildExecutiveDashboardV2ViewModel({
    executive: executiveFixture,
    alphaBrief: {
      yesterday: {
        newProspects: 1,
        qualified: 2,
        appointments: 1,
        confirmed: 1,
        completed: 0,
        recruited: 0
      },
      todaysPriorities: {
        followUpsOverdue: 2,
        newUnacknowledgedLeads: 1
      }
    },
    prospects: [
      { phone: "+15550001111", current_step: "CONFIRMED", interview_type: "zoom" },
      { phone: "+15550002222", current_step: "SCHEDULE", interview_type: "in_person" }
    ],
    user: { first_name: "Niovel" },
    organizationName: "Team Vision",
    translate
  });

  assert.equal(model.kpiCards.length, 6);
  assert.match(model.header.greeting, /Niovel/);
  assert.match(model.header.subtitle, /Team Vision/);
  assert.equal(model.agenda.length, 2);
  assert.ok(model.agenda.length <= AGENDA_LIMIT);
  assert.equal(model.recentActivity.length, ACTIVITY_LIMIT);
});

test("buildPriorities only includes non-zero scoped items", () => {
  const priorities = buildPriorities(
    executiveFixture,
    { todaysPriorities: { followUpsOverdue: 0, newUnacknowledgedLeads: 2 } },
    translate
  );

  assert.ok(priorities.every((item) => item.count > 0));
  assert.ok(priorities.every((item) => item.to.includes("/app/mission-control")));
});

test("buildKpiCards handles missing comparison gracefully", () => {
  const cards = buildKpiCards(
    {
      kpi: {
        newProspects: 1,
        qualified: 2,
        appointments: 3,
        confirmed: 4,
        completed: 5,
        recruited: 6,
        comparison: {}
      }
    },
    translate
  );

  assert.equal(cards.length, 6);
  assert.equal(cards[0].value, 1);
});

test("conversation performance shows em dash for unsupported avg response time", () => {
  const model = buildExecutiveDashboardV2ViewModel({
    executive: executiveFixture,
    alphaBrief: null,
    prospects: [],
    user: null,
    organizationName: "Team Vision",
    translate
  });

  assert.equal(model.conversationPerformance.averageResponseTimeLabel, "—");
});

test("zero-state agenda and activity render empty-safe models", () => {
  const model = buildExecutiveDashboardV2ViewModel({
    executive: {
      ...executiveFixture,
      calendar: { appointments: [] },
      activity: [],
      v2Metrics: {
        ...executiveFixture.v2Metrics,
        trend7Day: []
      }
    },
    alphaBrief: null,
    prospects: [],
    user: null,
    organizationName: "Team Vision",
    translate
  });

  assert.equal(model.agenda.length, 0);
  assert.equal(model.recentActivity.length, 0);
  assert.equal(model.trend.length, 0);
});
