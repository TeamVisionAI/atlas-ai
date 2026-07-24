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

const BACKEND_VERSION = "0.4.0";
const SPRINT_LABEL = "Sprint 17.0";

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
  const { error } = await supabase.from(tableName).select("*").limit(1);

  if (error) {
    return {
      ok: false,
      detail: error.message
    };
  }

  return {
    ok: true,
    detail: "reachable"
  };
}

function statusFromCheck(ok, detail) {
  return {
    status: ok ? "healthy" : "degraded",
    detail: detail || (ok ? "ok" : "unavailable")
  };
}

async function getSystemHealth() {
  const lastCheck = new Date().toISOString();
  const readiness = await evaluateProductionReadiness();

  const supabaseCheck = readiness.checks.find((check) => check.id === "supabase");
  const whatsappWebhook = readiness.checks.find((check) => check.id === "whatsapp_webhook");
  const whatsappSend = readiness.checks.find((check) => check.id === "whatsapp_send");
  const googleCalendar = readiness.checks.find((check) => check.id === "google_calendar");
  const metaEmbedded = readiness.checks.find((check) => check.id === "meta_embedded_signup");

  const businessEventsProbe = await probeTable(DEV_TABLES.businessEvents);
  const timelineProbe = await probeTable(DEV_TABLES.timelineEntries);
  const missionControlProbe = await probeTable(DEV_TABLES.missionControlState);
  const executiveProbe = await probeTable(DEV_TABLES.executiveState);

  const projectionOk =
    businessEventsProbe.ok && timelineProbe.ok && missionControlProbe.ok && executiveProbe.ok;

  return {
    sprint: SPRINT_LABEL,
    lastCheck,
    cards: [
      {
        id: "backend",
        label: "Backend",
        status: "healthy",
        version: BACKEND_VERSION,
        lastCheck,
        detail: "Atlas API responding"
      },
      {
        id: "database",
        label: "Database",
        ...statusFromCheck(supabaseCheck?.ok, supabaseCheck?.detail),
        version: "Supabase",
        lastCheck
      },
      {
        id: "business_events",
        label: "Business Events",
        ...statusFromCheck(businessEventsProbe.ok, businessEventsProbe.detail),
        version: "Atlas Core",
        lastCheck
      },
      {
        id: "projection_engine",
        label: "Projection Engine",
        ...statusFromCheck(projectionOk, projectionOk ? "projections registered" : "projection tables unavailable"),
        version: "v1",
        lastCheck
      },
      {
        id: "mission_control",
        label: "Mission Control",
        ...statusFromCheck(missionControlProbe.ok, missionControlProbe.detail),
        version: "live",
        lastCheck
      },
      {
        id: "executive_dashboard",
        label: "Executive Dashboard",
        ...statusFromCheck(executiveProbe.ok, executiveProbe.detail),
        version: "live",
        lastCheck
      },
      {
        id: "whatsapp",
        label: "WhatsApp",
        ...statusFromCheck(
          Boolean(whatsappWebhook?.ok && whatsappSend?.ok),
          [whatsappWebhook?.detail, whatsappSend?.detail].filter(Boolean).join("; ")
        ),
        version: whatsappSend?.ok ? "configured" : "missing credentials",
        lastCheck
      },
      {
        id: "meta",
        label: "Meta",
        ...statusFromCheck(metaEmbedded?.ok, metaEmbedded?.detail),
        version: metaEmbedded?.ok ? "Embedded Signup" : "not configured",
        lastCheck
      },
      {
        id: "google_calendar",
        label: "Google Calendar",
        ...statusFromCheck(googleCalendar?.ok, googleCalendar?.detail),
        version: googleCalendar?.ok ? "OAuth configured" : "missing vars",
        lastCheck
      }
    ],
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

module.exports = {
  BACKEND_VERSION,
  SPRINT_LABEL,
  SMOKE_TESTS,
  recordActivity,
  getSystemHealth,
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
  getWorkflowSimulatorTimeline
};
