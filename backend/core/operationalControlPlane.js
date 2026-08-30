/**
 * BR-160 — Global Super Admin control plane empty operational responses.
 * Never loads prospects / appointments / conversations against the Super Admin home org.
 */

const {
  isControlPlaneRequest,
  isGlobalSuperAdminControlPlane
} = require("./effectiveOrganizationContext");
const { FOLLOW_UP_FILTERS } = require("./followUpsQueueEngine");

function emptyFocusBucket(filter) {
  return { count: 0, filter, phones: [] };
}

function emptyExecutiveDashboard() {
  return {
    generatedAt: new Date().toISOString(),
    controlPlane: true,
    organizationId: null,
    prospectCount: 0,
    todayFocus: {
      interviewsToday: emptyFocusBucket("interviews_today"),
      pendingInterviewOutcomes: emptyFocusBucket("pending_outcomes"),
      highPriorityProspects: emptyFocusBucket("high_priority"),
      recruitsReadyForOrientation: emptyFocusBucket("orientation_ready"),
      stalledProspects: emptyFocusBucket("stalled")
    },
    productionSnapshot: {},
    agencyPulse: { score: 0 },
    recommendations: [],
    calendar: { items: [] },
    activity: [],
    prioritizedWorkflowQueue: [],
    v2Metrics: {
      pipeline: {
        newProspects: 0,
        qualified: 0,
        appointmentsScheduled: 0,
        confirmed: 0,
        recruited: 0,
        completed: 0
      },
      todaysPriorities: {
        followUpsOverdue: 0,
        newUnacknowledgedLeads: 0,
        interviewsToday: 0
      }
    }
  };
}

function emptyDashboard() {
  return {
    controlPlane: true,
    organizationId: null,
    totalProspects: 0,
    activeConversations: 0,
    confirmed: 0,
    hotProspects: 0,
    newProspects: 0,
    followUps: 0,
    followUpsDue: 0,
    followUpsOverdue: 0,
    nextFollowUps: [],
    myClientsCount: 0,
    clientFollowUpsDue: 0,
    appointments: 0,
    prospects: [],
    prioritizedWorkflowQueue: []
  };
}

function emptyProspectCenter() {
  return {
    generatedAt: new Date().toISOString(),
    controlPlane: true,
    organizationId: null,
    totalCount: 0,
    filteredCount: 0,
    activeFilter: "all",
    search: "",
    filters: {},
    items: []
  };
}

function emptyProspectReport() {
  return {
    generatedAt: new Date().toISOString(),
    controlPlane: true,
    organizationId: null,
    emptyReason: "SUPER_ADMIN_CONTROL_PLANE",
    totalCount: 0,
    filteredCount: 0,
    items: [],
    offset: 0,
    limit: 100
  };
}

function emptyFollowUps() {
  return {
    generatedAt: new Date().toISOString(),
    controlPlane: true,
    organizationId: null,
    scope: "mine",
    teamAvailable: false,
    totalCount: 0,
    filteredCount: 0,
    activeFilter: FOLLOW_UP_FILTERS.ALL,
    search: "",
    sort: "due-date",
    filters: [
      { id: FOLLOW_UP_FILTERS.ALL, count: 0 },
      { id: FOLLOW_UP_FILTERS.NEEDS_DATE, count: 0 },
      { id: FOLLOW_UP_FILTERS.DUE_TODAY, count: 0 },
      { id: FOLLOW_UP_FILTERS.OVERDUE, count: 0 },
      { id: FOLLOW_UP_FILTERS.UPCOMING, count: 0 },
      { id: FOLLOW_UP_FILTERS.COMPLETED, count: 0 }
    ],
    items: []
  };
}

function emptyMissionControlSummary() {
  return {
    controlPlane: true,
    organizationId: null,
    activeProspectIds: [],
    metrics: {},
    items: []
  };
}

function emptyMissionControlReadModel() {
  return {
    controlPlane: true,
    organizationId: null,
    items: [],
    queue: [],
    metrics: emptyMissionControlSummary().metrics
  };
}

function emptyConversations() {
  return {
    generatedAt: new Date().toISOString(),
    controlPlane: true,
    organizationId: null,
    filter: "active",
    search: null,
    view: "full",
    counts: {
      active: 0,
      needs_attention: 0,
      atlas: 0,
      human: 0,
      archived: 0,
      test: 0
    },
    needsAttentionCount: 0,
    items: []
  };
}

function emptyAppointments() {
  return {
    controlPlane: true,
    organizationId: null,
    items: [],
    appointments: [],
    total: 0
  };
}

function emptyAgenda() {
  return {
    controlPlane: true,
    organizationId: null,
    items: [],
    contacts: [],
    contact: null,
    appointment: null,
    total: 0
  };
}

function emptyToday() {
  const { emptyToday: buildEmptyToday } = require("./today/todayConstants");
  return buildEmptyToday({
    controlPlane: true,
    organizationId: null,
    teamAvailable: false,
    caughtUp: true
  });
}

function emptyClients() {
  return {
    generatedAt: new Date().toISOString(),
    controlPlane: true,
    organizationId: null,
    scope: "mine",
    teamAvailable: false,
    totalCount: 0,
    filteredCount: 0,
    search: "",
    items: []
  };
}

function emptyClientDetail() {
  return {
    controlPlane: true,
    organizationId: null,
    client: null,
    contact: null,
    appointments: [],
    followUps: []
  };
}

function emptyProduction() {
  return {
    generatedAt: new Date().toISOString(),
    controlPlane: true,
    organizationId: null,
    scope: "mine",
    teamAvailable: false,
    search: "",
    totalCount: 0,
    filteredCount: 0,
    counts: { submitted: 0, pending: 0, issued: 0, paid: 0 },
    amounts: { submitted: null, pending: null, issued: null, paid: null },
    items: []
  };
}

function emptyProductionDetail() {
  return {
    controlPlane: true,
    organizationId: null,
    id: null,
    clientId: null,
    history: []
  };
}

function emptyIulWorklist() {
  return {
    controlPlane: true,
    organizationId: null,
    items: [],
    totalCount: 0
  };
}

function emptyMissions() {
  return {
    generatedAt: new Date().toISOString(),
    controlPlane: true,
    organizationId: null,
    total: 0,
    primaryMission: null,
    missions: []
  };
}

function emptyProspectList() {
  return {
    controlPlane: true,
    organizationId: null,
    items: [],
    total: 0
  };
}

function emptyAppointmentProfile() {
  return {
    profile: null,
    calendarConnection: { connected: false, status: "disconnected" },
    calendarSources: {
      google: { connected: false, available: true, ownership: "personal" },
      icloud: { connected: false, available: false, ownership: "personal" }
    },
    zoomStatus: { connected: false, source: null },
    organizationOffice: { address: null, configured: false }
  };
}

function operationalControlPlaneEmpty(buildEmpty) {
  return function operationalControlPlaneEmptyMiddleware(req, res, next) {
    if (!isControlPlaneRequest(req) && !isGlobalSuperAdminControlPlane(req.authContext, req.supportContext)) {
      return next();
    }

    const payload = typeof buildEmpty === "function" ? buildEmpty(req) : buildEmpty;
    return res.json({
      ...payload,
      controlPlane: true,
      organizationId: null
    });
  };
}

module.exports = {
  emptyDashboard,
  emptyExecutiveDashboard,
  emptyProspectCenter,
  emptyProspectReport,
  emptyFollowUps,
  emptyClients,
  emptyToday,
  emptyClientDetail,
  emptyProduction,
  emptyProductionDetail,
  emptyMissionControlSummary,
  emptyMissionControlReadModel,
  emptyConversations,
  emptyAppointments,
  emptyAgenda,
  emptyIulWorklist,
  emptyMissions,
  emptyProspectList,
  emptyAppointmentProfile,
  operationalControlPlaneEmpty
};
