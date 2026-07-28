/**
 * Sprint 17.0 — Operations Center service layer.
 * Thin wrappers around existing dev tooling — no duplicated business logic.
 */

const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const { supabase } = require("../services/supabaseService");
const { evaluateProductionReadiness } = require("../core/productionReadiness");
const { intakeFacebookLead } = require("../core/facebookLeadIntakeService");
const { createQuickCaptureProspect } = require("../core/quickCaptureEngine");
const { replayProjections } = require("./environment/replayProjections");
const {
  assertSafeEnvironment,
  assertAtlasCoreTablesReady,
  deleteAllRows
} = require("./environment/databaseReset");
const { createEnvironmentModules } = require("./environment/environmentModules");
const { DEV_TABLES } = require("./environment/constants");
const {
  createSimulatorProspect,
  simulateMessage,
  advanceSimulatorWorkflow,
  getSimulatorState,
  getSimulatorEvents,
  getSimulatorTimeline,
  cleanupSimulatorProspect
} = require("./workflowSimulatorService");
const { runAllGoldenScenarios, GOLDEN_SCENARIOS } = require("./goldenScenarios");
const { runCompleteValidation } = require("./autonomousValidationEngine");

const BACKEND_VERSION = "0.4.0";
const SPRINT_LABEL = "Sprint 17.1";

const SMOKE_TESTS = Object.freeze({
  autonomous_recruiting: {
    id: "autonomous_recruiting",
    label: "Autonomous Recruiting Workflow",
    script: "verifyAutonomousRecruitingWorkflow.js"
  },
  mission_control: {
    id: "mission_control",
    label: "Mission Control Verification",
    script: "verifyMissionControlProjection.js"
  },
  timeline: {
    id: "timeline",
    label: "Timeline Verification",
    script: "verifyTimelineEngine.js"
  },
  projection: {
    id: "projection",
    label: "Projection Verification",
    script: "verifyProjectionFramework.js"
  },
  dashboard: {
    id: "dashboard",
    label: "Dashboard Verification",
    script: "verifyExecutiveDashboardProjection.js"
  }
});

const activityLog = [];
const MAX_ACTIVITY_LOG = 200;

function recordActivity(entry) {
  activityLog.unshift({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ...entry
  });

  if (activityLog.length > MAX_ACTIVITY_LOG) {
    activityLog.length = MAX_ACTIVITY_LOG;
  }
}

function runVerifyScript(scriptName) {
  const startedAt = Date.now();
  const scriptPath = path.join(__dirname, scriptName);

  const result = spawnSync(process.execPath, [scriptPath], {
    encoding: "utf8",
    env: process.env
  });

  const durationMs = Date.now() - startedAt;
  const passed = result.status === 0;
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();

  return {
    passed,
    durationMs,
    exitCode: result.status ?? 1,
    output,
    failureDetails: passed ? null : output || `Exit code ${result.status ?? "unknown"}`
  };
}

async function probeTable(tableName) {
  const startedAt = Date.now();
  const { error } = await supabase.from(tableName).select("*").limit(1);
  const responseTimeMs = Date.now() - startedAt;

  if (error) {
    return {
      ok: false,
      detail: error.message,
      responseTimeMs
    };
  }

  return {
    ok: true,
    detail: "reachable",
    responseTimeMs
  };
}

function resolveCardStatus({ ok, critical = true }) {
  if (ok) {
    return "healthy";
  }

  return critical ? "failure" : "warning";
}

function statusFromCheck(ok, detail, options = {}) {
  return {
    status: resolveCardStatus({ ok, critical: options.critical !== false }),
    detail: detail || (ok ? "ok" : "unavailable")
  };
}

function startOfTodayIso() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start.toISOString();
}

function eventTimestamp(event) {
  return event.timestamp || event.created_at || event.createdAt || null;
}

function eventType(event) {
  return event.event_type || event.eventType || "";
}

function eventCorrelation(event) {
  return String(event.correlation_id || event.correlationId || "").toLowerCase();
}

function eventPayload(event) {
  return event.payload || {};
}

function mapEventActivityTitle(event) {
  const type = eventType(event);
  const correlation = eventCorrelation(event);
  const payload = eventPayload(event);
  const sourceDetail = String(
    payload.leadSource?.sourceDetail || payload.sourceDetail || payload.source || ""
  ).toLowerCase();

  if (correlation.includes("facebook-lead") || sourceDetail.includes("facebook")) {
    if (type === "prospect_created" || type === "message_received") {
      return "Facebook Lead Received";
    }
  }

  if (correlation.includes("quick-capture") || sourceDetail.includes("website")) {
    if (type === "prospect_created") {
      return "Website Lead Received";
    }
  }

  const titles = {
    prospect_created: "Prospect Created",
    prospect_updated: "Prospect Updated",
    message_sent: "WhatsApp Sent",
    message_received: "WhatsApp Received",
    appointment_created: "Interview Scheduled",
    error_logged: "Error Logged"
  };

  if (payload.qualificationStatus || payload.qualified === true) {
    return "Prospect Qualified";
  }

  return titles[type] || type.replace(/_/g, " ");
}

async function fetchRecentBusinessEvents(limit = 40) {
  const { data, error } = await supabase
    .from(DEV_TABLES.businessEvents)
    .select("id, event_type, timestamp, created_at, prospect_id, correlation_id, payload")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return [];
  }

  return data || [];
}

async function fetchTodayBusinessEvents() {
  const { data, error } = await supabase
    .from(DEV_TABLES.businessEvents)
    .select("id, event_type, timestamp, created_at, prospect_id, correlation_id, payload")
    .gte("created_at", startOfTodayIso())
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) {
    return [];
  }

  return data || [];
}

function countTodayActivity(events) {
  let facebookLeads = 0;
  let websiteLeads = 0;
  let whatsappConversations = 0;
  let interviewsScheduled = 0;
  let errors = 0;

  for (const event of events) {
    const type = eventType(event);
    const correlation = eventCorrelation(event);
    const payload = eventPayload(event);
    const sourceDetail = String(
      payload.leadSource?.sourceDetail || payload.sourceDetail || payload.source || ""
    ).toLowerCase();

    if (correlation.includes("facebook-lead") || sourceDetail.includes("facebook")) {
      if (type === "prospect_created" || type === "message_received") {
        facebookLeads += 1;
      }
    }

    if (correlation.includes("quick-capture") || sourceDetail.includes("website")) {
      if (type === "prospect_created") {
        websiteLeads += 1;
      }
    }

    if (type === "message_received" || type === "message_sent") {
      whatsappConversations += 1;
    }

    if (type === "appointment_created") {
      interviewsScheduled += 1;
    }

    if (type === "error_logged") {
      errors += 1;
    }
  }

  const projectionReplays = activityLog.filter((entry) => {
    const sameDay = entry.timestamp >= startOfTodayIso();
    return sameDay && entry.category === "projection_replay";
  }).length;

  const opsErrors = activityLog.filter((entry) => {
    const sameDay = entry.timestamp >= startOfTodayIso();
    return sameDay && entry.level === "error";
  }).length;

  return {
    facebookLeads,
    websiteLeads,
    whatsappConversations,
    interviewsScheduled,
    businessEventsProcessed: events.length,
    projectionReplays,
    errors: errors + opsErrors
  };
}

function computeWorkflowMetrics(events) {
  const byProspect = new Map();

  for (const event of events) {
    const prospectId = event.prospect_id || event.prospectId;
    if (!prospectId) {
      continue;
    }

    if (!byProspect.has(prospectId)) {
      byProspect.set(prospectId, []);
    }

    byProspect.get(prospectId).push(event);
  }

  const workflowDurations = [];
  const qualificationDurations = [];
  const schedulingDurations = [];
  let completedWorkflows = 0;
  let failedWorkflows = 0;

  for (const prospectEvents of byProspect.values()) {
    prospectEvents.sort(
      (a, b) => new Date(eventTimestamp(a)).getTime() - new Date(eventTimestamp(b)).getTime()
    );

    const created = prospectEvents.find((row) => eventType(row) === "prospect_created");
    const appointment = prospectEvents.find((row) => eventType(row) === "appointment_created");
    const qualified = prospectEvents.find((row) => {
      const payload = eventPayload(row);
      return (
        eventType(row) === "prospect_updated" &&
        (payload.qualificationStatus || payload.qualified === true)
      );
    });
    const errorEvent = prospectEvents.find((row) => eventType(row) === "error_logged");

    if (created && appointment) {
      completedWorkflows += 1;
      workflowDurations.push(
        new Date(eventTimestamp(appointment)).getTime() - new Date(eventTimestamp(created)).getTime()
      );
      schedulingDurations.push(
        new Date(eventTimestamp(appointment)).getTime() - new Date(eventTimestamp(created)).getTime()
      );
    }

    if (created && qualified) {
      qualificationDurations.push(
        new Date(eventTimestamp(qualified)).getTime() - new Date(eventTimestamp(created)).getTime()
      );
    }

    if (errorEvent) {
      failedWorkflows += 1;
    }
  }

  const average = (values) =>
    values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;

  const smokeRuns = activityLog.filter((entry) => entry.category === "smoke_test");
  const smokePassed = smokeRuns.filter((entry) => !String(entry.message || "").includes("FAIL")).length;
  const successRate =
    smokeRuns.length > 0 ? Math.round((smokePassed / smokeRuns.length) * 100) : completedWorkflows > 0 ? 100 : 0;

  return {
    averageWorkflowDurationMs: average(workflowDurations),
    successRate,
    failedWorkflows,
    averageQualificationTimeMs: average(qualificationDurations),
    averageInterviewSchedulingTimeMs: average(schedulingDurations)
  };
}

function buildRecentActivityFeed(events) {
  const businessFeed = events.map((event) => ({
    id: event.id,
    timestamp: eventTimestamp(event),
    title: mapEventActivityTitle(event),
    detail: event.prospect_id || event.prospectId || null,
    source: "business_event"
  }));

  const opsFeed = activityLog.slice(0, 20).map((entry) => ({
    id: entry.id,
    timestamp: entry.timestamp,
    title: entry.message,
    detail: entry.detail || entry.category,
    source: "operations"
  }));

  return [...businessFeed, ...opsFeed]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 25);
}

function buildProductionReadinessWidget(readiness) {
  const byId = Object.fromEntries((readiness.checks || []).map((check) => [check.id, check]));

  function requirement(id, label, options = {}) {
    const check = byId[id];

    if (!check) {
      return { id, label, state: "disabled", detail: "Not evaluated" };
    }

    if (check.ok) {
      return { id, label, state: "healthy", detail: check.detail };
    }

    if (options.warningOnly || !check.blocker) {
      return { id, label, state: "warning", detail: check.detail };
    }

    return { id, label, state: "failure", detail: check.detail };
  }

  const whatsappReady = byId.whatsapp_webhook?.ok && byId.whatsapp_send?.ok;
  const whatsappState = whatsappReady
    ? "healthy"
    : byId.whatsapp_webhook?.ok || byId.whatsapp_send?.ok
      ? "warning"
      : "failure";

  const requirements = [
    requirement("meta_embedded_signup", "Meta", { warningOnly: true }),
    {
      id: "whatsapp",
      label: "WhatsApp",
      state: whatsappState,
      detail: [byId.whatsapp_webhook?.detail, byId.whatsapp_send?.detail].filter(Boolean).join("; ")
    },
    requirement("google_calendar", "Google Calendar"),
    requirement("supabase", "Supabase"),
    requirement("contact_form", "Resend", { warningOnly: true }),
    requirement("whatsapp_webhook", "Webhook Verification"),
    {
      id: "environment_variables",
      label: "Environment Variables",
      state: readiness.blockers?.length ? "failure" : readiness.checks?.some((check) => !check.ok) ? "warning" : "healthy",
      detail: readiness.blockers?.length
        ? `Missing blockers: ${readiness.blockers.join(", ")}`
        : "Core variables configured"
    }
  ];

  return {
    productionReady: Boolean(readiness.mvpReady),
    requirements
  };
}

async function getOperationsDashboard() {
  const healthStartedAt = Date.now();
  const [health, todayEvents, recentEvents] = await Promise.all([
    getSystemHealth(),
    fetchTodayBusinessEvents(),
    fetchRecentBusinessEvents(30)
  ]);

  return {
    sprint: SPRINT_LABEL,
    generatedAt: new Date().toISOString(),
    responseTimeMs: Date.now() - healthStartedAt,
    platformStatus: health.cards,
    todaysActivity: countTodayActivity(todayEvents),
    recentActivity: buildRecentActivityFeed(recentEvents),
    metrics: computeWorkflowMetrics(todayEvents),
    productionReadiness: buildProductionReadinessWidget(health.readiness)
  };
}

async function getSystemHealth() {
  const { evaluateGuardrailHealthCards } = require("../core/engineeringGuardrails");
  const lastCheck = new Date().toISOString();
  const readinessStartedAt = Date.now();
  const readiness = await evaluateProductionReadiness();
  const cards = await evaluateGuardrailHealthCards();

  return {
    sprint: SPRINT_LABEL,
    lastCheck,
    cards: cards.map((card) => ({
      ...card,
      responseTimeMs: card.id === "backend" ? Date.now() - readinessStartedAt : card.responseTimeMs
    })),
    readiness
  };
}

function listSmokeTests() {
  return Object.values(SMOKE_TESTS);
}

async function runSmokeTest(testId) {
  const definition = SMOKE_TESTS[testId];

  if (!definition) {
    const error = new Error(`Unknown smoke test: ${testId}`);
    error.statusCode = 404;
    throw error;
  }

  recordActivity({
    level: "info",
    category: "smoke_test",
    message: `Running ${definition.label}`
  });

  const result = runVerifyScript(definition.script);

  recordActivity({
    level: result.passed ? "info" : "error",
    category: "smoke_test",
    message: `${definition.label}: ${result.passed ? "PASS" : "FAIL"}`,
    detail: result.failureDetails
  });

  return {
    testId: definition.id,
    label: definition.label,
    result: result.passed ? "PASS" : "FAIL",
    durationMs: result.durationMs,
    exitCode: result.exitCode,
    failureDetails: result.failureDetails,
    output: result.output
  };
}

async function replayAllProjections() {
  assertSafeEnvironment();
  const startedAt = Date.now();

  const summary = await replayProjections();

  recordActivity({
    level: "info",
    category: "projection_replay",
    message: `Replayed ${summary.eventsRead} events`,
    detail: `Duration ${Date.now() - startedAt}ms`
  });

  return {
    success: true,
    eventsReplayed: summary.eventsRead,
    durationMs: Date.now() - startedAt,
    summary
  };
}

async function replaySingleProspect(prospectId) {
  assertSafeEnvironment();

  if (!prospectId) {
    const error = new Error("prospectId is required.");
    error.statusCode = 400;
    throw error;
  }

  const startedAt = Date.now();
  const summary = await replayProjections({ prospectId });

  return {
    success: true,
    prospectId,
    eventsReplayed: summary.eventsRead,
    durationMs: Date.now() - startedAt,
    summary
  };
}

async function resetProjectionState() {
  assertSafeEnvironment();
  await assertAtlasCoreTablesReady();

  const startedAt = Date.now();
  const cleared = {};

  cleared[DEV_TABLES.timelineEntries] = await deleteAllRows(DEV_TABLES.timelineEntries);
  cleared[DEV_TABLES.missionControlProspects] = await deleteAllRows(
    DEV_TABLES.missionControlProspects,
    "prospect_id"
  );
  cleared[DEV_TABLES.missionControlState] = await deleteAllRows(DEV_TABLES.missionControlState);
  cleared[DEV_TABLES.executiveState] = await deleteAllRows(DEV_TABLES.executiveState);

  recordActivity({
    level: "warning",
    category: "projection_replay",
    message: "Projection state reset",
    detail: JSON.stringify(cleared)
  });

  return {
    success: true,
    durationMs: Date.now() - startedAt,
    cleared
  };
}

async function loadEventsChronologically(projectionEngine, filters = {}) {
  return projectionEngine.loadEventsChronologically(filters);
}

async function rebuildMissionControlProjection(options = {}) {
  assertSafeEnvironment();
  await assertAtlasCoreTablesReady();

  const startedAt = Date.now();
  const modules = await createEnvironmentModules({ startProjections: false });
  const filters = {
    prospectId: options.prospectId || null,
    organizationId: options.organizationId || null
  };

  const events = await loadEventsChronologically(modules.projectionModule.engine, filters);
  const summary = await modules.missionControlModule.missionControlProjection.replay(events, {
    rebuild: true
  });

  if (summary.failures?.length) {
    throw new Error(`Mission Control rebuild failed (${summary.failures.length} failure(s)).`);
  }

  return {
    success: true,
    eventsReplayed: events.length,
    durationMs: Date.now() - startedAt,
    summary
  };
}

async function rebuildExecutiveDashboardProjection(options = {}) {
  assertSafeEnvironment();
  await assertAtlasCoreTablesReady();

  const startedAt = Date.now();
  const modules = await createEnvironmentModules({ startProjections: false });
  const filters = {
    prospectId: options.prospectId || null,
    organizationId: options.organizationId || null
  };

  const events = await loadEventsChronologically(modules.projectionModule.engine, filters);
  const summary = await modules.executiveDashboardModule.executiveDashboardProjection.replay(
    events,
    { rebuild: true }
  );

  if (summary.failures?.length) {
    throw new Error(
      `Executive Dashboard rebuild failed (${summary.failures.length} failure(s)).`
    );
  }

  return {
    success: true,
    eventsReplayed: events.length,
    durationMs: Date.now() - startedAt,
    summary
  };
}

async function listBusinessEvents(filters = {}, businessEventService) {
  return businessEventService.list(filters);
}

async function getBusinessEventById(id, businessEventService) {
  const event = await businessEventService.getById(id);
  return { event };
}

async function getProspectTimeline(prospectId, businessEventService) {
  const timeline = await businessEventService.listByProspect(prospectId, { limit: 200 });
  return timeline;
}

async function getDiagnostics() {
  const readiness = await evaluateProductionReadiness();
  const errors = [];
  const warnings = [];
  const integrationFailures = [];

  for (const check of readiness.checks) {
    if (!check.ok && check.blocker) {
      errors.push({
        source: check.id,
        message: check.label,
        detail: check.detail
      });
    } else if (!check.ok) {
      warnings.push({
        source: check.id,
        message: check.label,
        detail: check.detail
      });
    }
  }

  if (readiness.blockers.length) {
    integrationFailures.push({
      source: "production_readiness",
      blockers: readiness.blockers,
      evaluatedAt: readiness.evaluatedAt
    });
  }

  let workflowActivity = [];

  const { data: workflowRows, error: workflowError } = await supabase
    .from(DEV_TABLES.workflowEvents)
    .select("id, event_type, prospect_id, created_at, payload")
    .order("created_at", { ascending: false })
    .limit(50);

  if (!workflowError && workflowRows) {
    workflowActivity = workflowRows;
  }

  return {
    errors,
    warnings,
    workflowActivity,
    integrationFailures,
    operationsActivity: activityLog.slice(0, 50),
    evaluatedAt: new Date().toISOString()
  };
}

function listSimulatorScenarios() {
  return GOLDEN_SCENARIOS.map((scenario) => ({
    id: scenario.id,
    name: scenario.name,
    preset: scenario.preset || "NEW_LEAD"
  }));
}

async function simulateFacebookLead(payload = {}) {
  const phone =
    payload.phone ||
    `787555${String(Math.floor(Math.random() * 9000) + 1000)}`;

  const body = {
    first_name: payload.first_name || payload.firstName || "Ops",
    last_name: payload.last_name || payload.lastName || "Facebook Lead",
    phone,
    email: payload.email || `ops.facebook.${Date.now()}@example.com`,
    leadgen_id: payload.leadgen_id || payload.leadgenId || `ops-${Date.now()}`
  };

  const result = await intakeFacebookLead(body);

  recordActivity({
    level: result.success ? "info" : "error",
    category: "workflow_simulator",
    message: "Generated Facebook Lead",
    detail: phone
  });

  return { ...result, phone, payload: body };
}

async function simulateWebsiteLead(payload = {}, atlasUser) {
  const phone =
    payload.phone ||
    `787556${String(Math.floor(Math.random() * 9000) + 1000)}`;

  const body = {
    first_name: payload.first_name || payload.firstName || "Ops",
    last_name: payload.last_name || payload.lastName || "Website Lead",
    phone,
    communication_language: payload.language || "es",
    source: payload.source || "WEBSITE",
    notes: payload.notes || "Operations Center website lead simulation"
  };

  const result = await createQuickCaptureProspect(body, atlasUser);

  recordActivity({
    level: result.ok ? "info" : "error",
    category: "workflow_simulator",
    message: "Generated Website Lead",
    detail: phone
  });

  return {
    success: result.ok,
    status: result.status,
    body: result.body,
    phone
  };
}

async function simulateWhatsAppConversation(payload = {}) {
  const phone =
    payload.phone ||
    `sim-ops-${crypto.randomUUID().slice(0, 8)}`;

  if (payload.cleanup !== false) {
    await cleanupSimulatorProspect(phone).catch(() => {});
  }

  const created = await createSimulatorProspect({
    phone,
    name: payload.name || "Ops WhatsApp Lead",
    preset: payload.preset || "NEW_LEAD",
    seedFields: payload.seedFields
  });

  let messageResult = null;

  if (payload.message) {
    messageResult = await simulateMessage({
      phone,
      direction: payload.direction || "incoming",
      body: payload.message
    });
  }

  recordActivity({
    level: "info",
    category: "workflow_simulator",
    message: "Generated WhatsApp Conversation",
    detail: phone
  });

  return {
    success: true,
    phone,
    prospect: created.prospect,
    workflow: created.workflow,
    messageResult
  };
}

async function runWorkflowScenario(scenarioId) {
  const scenario = GOLDEN_SCENARIOS.find((row) => row.id === scenarioId);

  if (!scenario) {
    const error = new Error(`Unknown scenario: ${scenarioId}`);
    error.statusCode = 404;
    throw error;
  }

  const { runScenario } = require("./goldenScenarios");
  const report = await runScenario(scenario);

  recordActivity({
    level: report.pass ? "info" : "error",
    category: "workflow_simulator",
    message: `Scenario ${scenario.name}: ${report.pass ? "PASS" : "FAIL"}`
  });

  return report;
}

async function runAllWorkflowScenarios() {
  const report = await runAllGoldenScenarios();

  recordActivity({
    level: "info",
    category: "workflow_simulator",
    message: `Golden scenarios: ${report.passed}/${report.total} passed`
  });

  return report;
}

async function getWorkflowSimulatorState(phone) {
  const state = await getSimulatorState(phone);

  if (!state) {
    const error = new Error("Simulator prospect not found.");
    error.statusCode = 404;
    throw error;
  }

  return state;
}

async function advanceWorkflowSimulator(phone, body = {}) {
  return advanceSimulatorWorkflow(phone, body);
}

async function getWorkflowSimulatorEvents(phone, query = {}) {
  return getSimulatorEvents(phone, query);
}

async function getWorkflowSimulatorTimeline(phone) {
  return getSimulatorTimeline(phone);
}


async function runCompleteWorkflowValidation() {
  const startedAt = Date.now();

  recordActivity({
    level: "info",
    category: "validation",
    message: "Running Sprint 11.5 complete validation"
  });

  const report = await runCompleteValidation();

  recordActivity({
    level: report.overall === "PASS" ? "info" : "error",
    category: "validation",
    message: `Sprint 11.5 validation: ${report.overall} (${report.passRate}%)`,
    detail: report.remainingIssues.length
      ? report.remainingIssues.map((row) => `${row.section}: ${row.step}`).join("; ")
      : null
  });

  return {
    success: report.overall === "PASS",
    durationMs: Date.now() - startedAt,
    ...report
  };
}


async function getAlphaAcceptanceChecklist(options = {}) {
  const { evaluateAlphaAcceptance } = require("../core/alphaAcceptanceService");
  return evaluateAlphaAcceptance(options);
}

async function getGoldenPathTrace(phone, options = {}) {
  const { buildGoldenPathTrace } = require("../core/alphaGoldenPathTraceService");
  const { DEFAULT_ORGANIZATION_ID } = require("../modules/prospects/domain/constants");

  return buildGoldenPathTrace(phone, {
    organizationId: options.organizationId || DEFAULT_ORGANIZATION_ID
  });
}

module.exports = {
  BACKEND_VERSION,
  SPRINT_LABEL,
  SMOKE_TESTS,
  recordActivity,
  getSystemHealth,
  getOperationsDashboard,
  listSmokeTests,
  runSmokeTest,
  replayAllProjections,
  replaySingleProspect,
  resetProjectionState,
  rebuildMissionControlProjection,
  rebuildExecutiveDashboardProjection,
  listBusinessEvents,
  getBusinessEventById,
  getProspectTimeline,
  getDiagnostics,
  listSimulatorScenarios,
  simulateFacebookLead,
  simulateWebsiteLead,
  simulateWhatsAppConversation,
  runWorkflowScenario,
  runAllWorkflowScenarios,
  getWorkflowSimulatorState,
  advanceWorkflowSimulator,
  getWorkflowSimulatorEvents,
  getWorkflowSimulatorTimeline,
  runCompleteWorkflowValidation,
  getAlphaAcceptanceChecklist,
  getGoldenPathTrace
};
