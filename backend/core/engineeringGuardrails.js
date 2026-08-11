/**
 * Sprint 11.6 — Engineering guardrails.
 * Fail fast at startup and in validation when dependencies, contracts, or services break.
 */

const path = require("path");
const { DEFAULT_ORGANIZATION_ID } = require("../modules/prospects/domain/constants");
const { evaluateProductionReadiness } = require("./productionReadiness");

const GUARDRAIL_SPRINT = "11.6";

const REQUIRED_ENV_VARS = Object.freeze([
  { key: "SUPABASE_URL", critical: true },
  { key: "SUPABASE_ANON_KEY", critical: true }
]);

const CRITICAL_MODULE_CONTRACTS = Object.freeze([
  {
    id: "organization_settings_engine",
    modulePath: "./organizationSettingsEngine",
    exports: ["getOrganizationSettings"]
  },
  {
    id: "agent_action_application_service",
    modulePath: "../application/agentActionApplicationService",
    exports: ["getMissionControlWithActions", "executeAgentAction", "syncAgentWorkflow"]
  },
  {
    id: "meeting_management_service",
    modulePath: "../services/meetingManagementService",
    exports: [
      "getMeetingManagement",
      "resolveVirtualMeetingUrl",
      "resolveInterviewLocation"
    ]
  },
  {
    id: "prospect_center_read_model",
    modulePath: "./prospectCenterReadModel",
    exports: ["buildProspectCenterReadModel"]
  },
  {
    id: "mission_control_read_model",
    modulePath: "./missionControlReadModel",
    exports: ["getMissionControlState"]
  }
]);

const API_CONTRACTS = Object.freeze({
  dashboard: {
    label: "/api/dashboard",
    requiredFields: ["totalProspects", "prospects", "prioritizedWorkflowQueue"],
    load: async (organizationId) => {
      const { supabase } = require("../services/supabaseService");
      const { filterProductionProspects } = require("./productionProspectFilter");
      const {
        filterOutOperationalTestProspects
      } = require("./missionControlOperationalTestFilter");
      const { buildPrioritizedWorkflowQueue } = require("./missionControlPriorityEngine");

      const { data, error } = await supabase
        .from("prospects")
        .select("*")
        .eq("organization_id", organizationId);

      if (error) {
        throw error;
      }

      const prospects = filterOutOperationalTestProspects(
        filterProductionProspects(data || [])
      );

      return {
        totalProspects: prospects.length,
        activeConversations: prospects.filter((row) => row.current_step !== "CONFIRMED").length,
        confirmed: prospects.filter((row) => row.current_step === "CONFIRMED").length,
        prospects,
        prioritizedWorkflowQueue: await buildPrioritizedWorkflowQueue(prospects)
      };
    }
  },
  missionControl: {
    label: "/api/mission-control/:phone",
    requiredFields: [
      "prospect",
      "brain",
      "businessRules",
      "atlasBrief",
      "workflow",
      "latestConversation",
      "availableActions",
      "conversationMessages",
      "aiActionCenter",
      "workflowGate"
    ],
    load: async (organizationId) => {
      const { getMissionControlWithActions } = require("../application/agentActionApplicationService");
      return getMissionControlWithActions("latest", {
        organizationId,
        tenantScoped: true
      });
    },
    allowNull: true
  },
  prospectCenter: {
    label: "/api/prospect-center",
    requiredFields: ["generatedAt", "totalCount", "filteredCount", "filters", "items"],
    load: async (organizationId) => {
      const { buildProspectCenterReadModel } = require("./prospectCenterReadModel");
      return buildProspectCenterReadModel({ organizationId });
    }
  },
  organizationSettings: {
    label: "/api/organization/settings",
    requiredFields: ["office"],
    nestedRequired: {
      office: ["name", "fullAddress"]
    },
    load: async () => {
      const { getOrganizationSettings } = require("./organizationSettingsEngine");
      return getOrganizationSettings();
    }
  },
  meetingManagement: {
    label: "/api/configuration/organization/meeting-management",
    requiredFields: ["personalMeetingUrl", "officeAddress", "meetingPreferences", "configured"],
    load: async (organizationId) => {
      const meetingManagementService = require("../services/meetingManagementService");
      return meetingManagementService.getMeetingManagement(organizationId);
    }
  },
  operations: {
    label: "/api/operations",
    requiredFields: ["success", "routesAvailable"],
    load: async () => {
      const createOperationsRoutes = require("../dev/operationsRoutes");
      return {
        success: typeof createOperationsRoutes === "function",
        routesAvailable: true
      };
    }
  }
});

function isPresent(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function resolveModulePath(relativePath) {
  return path.join(__dirname, relativePath);
}

function getNestedValue(source, fieldPath) {
  return fieldPath.split(".").reduce((current, key) => {
    if (current == null) {
      return undefined;
    }

    return current[key];
  }, source);
}

function findMissingFields(payload, contract) {
  const missing = [];

  for (const field of contract.requiredFields || []) {
    if (getNestedValue(payload, field) === undefined) {
      missing.push(field);
    }
  }

  for (const [parent, children] of Object.entries(contract.nestedRequired || {})) {
    const parentValue = payload?.[parent];

    for (const child of children) {
      if (!parentValue || parentValue[child] === undefined) {
        missing.push(`${parent}.${child}`);
      }
    }
  }

  return missing;
}

function formatDiagnostics(title, issues) {
  const lines = [`Atlas engineering guardrails blocked startup (${GUARDRAIL_SPRINT}).`, "", title];

  for (const issue of issues) {
    lines.push(`- [${issue.severity}] ${issue.code}: ${issue.message}`);

    if (issue.location) {
      lines.push(`    location: ${issue.location}`);
    }

    if (issue.suggestedFix) {
      lines.push(`    fix: ${issue.suggestedFix}`);
    }
  }

  return lines.join("\n");
}

function validateCriticalModuleExports() {
  const issues = [];

  for (const contract of CRITICAL_MODULE_CONTRACTS) {
    const absolutePath = resolveModulePath(contract.modulePath);

    try {
      // eslint-disable-next-line import/no-dynamic-require, global-require
      const loaded = require(absolutePath);
      const missingExports = (contract.exports || []).filter(
        (exportName) => loaded[exportName] === undefined
      );

      if (missingExports.length) {
        issues.push({
          severity: "ERROR",
          code: "MISSING_EXPORT",
          message: `Missing exports: ${missingExports.join(", ")}`,
          location: contract.modulePath,
          suggestedFix: `Export required symbols from ${contract.modulePath}.`
        });
      }
    } catch (error) {
      issues.push({
        severity: "ERROR",
        code: "MODULE_LOAD_FAILED",
        message: error.message,
        location: contract.modulePath,
        suggestedFix: "Fix module syntax, imports, or missing dependencies."
      });
    }
  }

  return issues;
}

async function probeCriticalRuntimeDependencies(organizationId = DEFAULT_ORGANIZATION_ID) {
  const issues = [];

  try {
    const { getOrganizationSettings } = require("./organizationSettingsEngine");
    const settings = getOrganizationSettings();

    if (!settings?.office?.fullAddress) {
      issues.push({
        severity: "ERROR",
        code: "ORG_SETTINGS_INCOMPLETE",
        message: "Organization settings missing office.fullAddress.",
        location: "organizationSettingsEngine.js",
        suggestedFix: "Verify BR-018 office location configuration."
      });
    }
  } catch (error) {
    issues.push({
      severity: "ERROR",
      code: "ORG_SETTINGS_PROBE_FAILED",
      message: error.message,
      location: "organizationSettingsEngine.js",
      suggestedFix: "Ensure getOrganizationSettings is imported wherever used."
    });
  }

  try {
    const { getMissionControlWithActions } = require("../application/agentActionApplicationService");
    await getMissionControlWithActions("latest", {
      organizationId,
      tenantScoped: true
    });
  } catch (error) {
    issues.push({
      severity: "ERROR",
      code: "MISSION_CONTROL_PROBE_FAILED",
      message: error.message,
      location: "agentActionApplicationService.js",
      suggestedFix: "Fix Mission Control service dependencies before serving UI routes."
    });
  }

  return issues;
}

function validateStartupEnvironment() {
  const issues = [];

  for (const entry of REQUIRED_ENV_VARS) {
    if (!isPresent(process.env[entry.key])) {
      issues.push({
        severity: entry.critical ? "ERROR" : "WARNING",
        code: "ENV_MISSING",
        message: `Missing environment variable ${entry.key}.`,
        location: ".env",
        suggestedFix: `Set ${entry.key} in environment configuration.`
      });
    }
  }

  return issues;
}

async function validateApiContracts(organizationId = DEFAULT_ORGANIZATION_ID) {
  const issues = [];

  for (const [contractId, contract] of Object.entries(API_CONTRACTS)) {
    const startedAt = Date.now();

    try {
      const payload = await contract.load(organizationId);

      if (payload == null && contract.allowNull) {
        continue;
      }

      if (payload == null) {
        issues.push({
          severity: "ERROR",
          code: "API_CONTRACT_EMPTY",
          message: `${contract.label} returned null.`,
          location: contractId,
          suggestedFix: "Ensure handler returns a payload matching the frontend contract."
        });
        continue;
      }

      const missingFields = findMissingFields(payload, contract);

      if (missingFields.length) {
        issues.push({
          severity: "ERROR",
          code: "API_CONTRACT_MISSING_FIELDS",
          message: `${contract.label} missing fields: ${missingFields.join(", ")}`,
          location: contractId,
          suggestedFix: "Align API response with frontend adapter expectations."
        });
      }
    } catch (error) {
      issues.push({
        severity: "ERROR",
        code: "API_CONTRACT_FAILED",
        message: `${contract.label} failed: ${error.message}`,
        location: contractId,
        suggestedFix: "Fix handler exception before UI can consume this endpoint.",
        durationMs: Date.now() - startedAt
      });
    }
  }

  return issues;
}

async function probeCriticalApiHealth(organizationId = DEFAULT_ORGANIZATION_ID) {
  const results = [];

  for (const [contractId, contract] of Object.entries(API_CONTRACTS)) {
    const startedAt = Date.now();

    try {
      const payload = await contract.load(organizationId);

      if (payload == null && contract.allowNull) {
        results.push({
          id: contractId,
          label: contract.label,
          httpStatus: 200,
          ok: true,
          detail: "No active payload (empty queue) — handler healthy.",
          durationMs: Date.now() - startedAt
        });
        continue;
      }

      const missingFields = findMissingFields(payload, contract);

      results.push({
        id: contractId,
        label: contract.label,
        httpStatus: missingFields.length ? 422 : 200,
        ok: missingFields.length === 0,
        detail: missingFields.length
          ? `Missing fields: ${missingFields.join(", ")}`
          : "Contract satisfied.",
        durationMs: Date.now() - startedAt
      });
    } catch (error) {
      results.push({
        id: contractId,
        label: contract.label,
        httpStatus: 500,
        ok: false,
        detail: error.message,
        durationMs: Date.now() - startedAt
      });
    }
  }

  return results;
}

async function runStartupValidation(options = {}) {
  const organizationId = options.organizationId || DEFAULT_ORGANIZATION_ID;
  const failFast = options.failFast !== false;

  const issues = [
    ...validateStartupEnvironment(),
    ...validateCriticalModuleExports(),
    ...(await probeCriticalRuntimeDependencies(organizationId)),
    ...(await validateApiContracts(organizationId))
  ];

  const errors = issues.filter((row) => row.severity === "ERROR");
  const warnings = issues.filter((row) => row.severity === "WARNING");

  const report = {
    sprint: GUARDRAIL_SPRINT,
    ranAt: new Date().toISOString(),
    pass: errors.length === 0,
    errors,
    warnings,
    issueCount: issues.length
  };

  if (failFast && errors.length) {
    const error = new Error(formatDiagnostics("Startup validation failed.", errors));
    error.code = "ENGINEERING_GUARDRAILS_FAILED";
    error.report = report;
    throw error;
  }

  return report;
}

function mapHealthStatus(ok, warning = false) {
  if (ok) {
    return "healthy";
  }

  if (warning) {
    return "warning";
  }

  return "failure";
}

async function evaluateGuardrailHealthCards() {
  const lastCheck = new Date().toISOString();
  const readiness = await evaluateProductionReadiness();
  const supabaseCheck = readiness.checks.find((row) => row.id === "supabase");
  const whatsappWebhook = readiness.checks.find((row) => row.id === "whatsapp_webhook");
  const whatsappSend = readiness.checks.find((row) => row.id === "whatsapp_send");
  const googleCalendar = readiness.checks.find((row) => row.id === "google_calendar");
  const metaEmbedded = readiness.checks.find((row) => row.id === "meta_embedded_signup");

  let meetingManagementDetail = "reachable";
  let meetingManagementOk = true;
  let meetingManagementWarning = false;

  try {
    const meetingManagementService = require("../services/meetingManagementService");
    const config = await meetingManagementService.getMeetingManagement(DEFAULT_ORGANIZATION_ID);
    meetingManagementOk = true;
    meetingManagementWarning = !config.configured;
    meetingManagementDetail = config.configured
      ? "Personal meeting URL or office address configured"
      : "Meeting URLs not configured — virtual interviews will fail until set";
  } catch (error) {
    meetingManagementOk = false;
    meetingManagementDetail = error.message;
  }

  let missionControlDetail = "API contract healthy";
  let missionControlOk = true;

  try {
    const { getMissionControlWithActions } = require("../application/agentActionApplicationService");
    await getMissionControlWithActions("latest", {
      organizationId: DEFAULT_ORGANIZATION_ID,
      tenantScoped: true
    });
  } catch (error) {
    missionControlOk = false;
    missionControlDetail = error.message;
  }

  const dependencyIssues = [
    ...validateCriticalModuleExports(),
    ...(await probeCriticalRuntimeDependencies(DEFAULT_ORGANIZATION_ID))
  ];
  const dependencyErrors = dependencyIssues.filter((row) => row.severity === "ERROR");

  const metaWhatsappOk = Boolean(metaEmbedded?.ok && whatsappWebhook?.ok && whatsappSend?.ok);
  const metaWhatsappWarning =
    !metaWhatsappOk && (metaEmbedded?.ok || whatsappWebhook?.ok || whatsappSend?.ok);

  return [
    {
      id: "backend",
      label: "Backend",
      status: "healthy",
      detail: "Atlas API responding",
      lastCheck
    },
    {
      id: "database",
      label: "Database",
      status: mapHealthStatus(supabaseCheck?.ok),
      detail: supabaseCheck?.detail || "Supabase probe unavailable",
      lastCheck
    },
    {
      id: "meeting_management",
      label: "Meeting Management",
      status: mapHealthStatus(meetingManagementOk, meetingManagementWarning),
      detail: meetingManagementDetail,
      lastCheck
    },
    {
      id: "mission_control",
      label: "Mission Control",
      status: mapHealthStatus(missionControlOk),
      detail: missionControlDetail,
      lastCheck
    },
    {
      id: "google_calendar",
      label: "Google Calendar",
      status: mapHealthStatus(googleCalendar?.ok, !googleCalendar?.blocker),
      detail: googleCalendar?.detail || "Not evaluated",
      lastCheck
    },
    {
      id: "meta_whatsapp",
      label: "Meta/WhatsApp",
      status: mapHealthStatus(metaWhatsappOk, metaWhatsappWarning),
      detail: [
        metaEmbedded?.ok ? "Meta configured" : "Meta not configured",
        whatsappSend?.ok ? "WhatsApp send ready" : "WhatsApp send missing"
      ].join("; "),
      lastCheck
    },
    {
      id: "validation_engine",
      label: "Validation Engine",
      status: mapHealthStatus(dependencyErrors.length === 0),
      detail:
        dependencyErrors.length === 0
          ? "Dependency and runtime probes healthy"
          : dependencyErrors.map((row) => row.message).join("; "),
      lastCheck
    }
  ];
}

module.exports = {
  GUARDRAIL_SPRINT,
  CRITICAL_MODULE_CONTRACTS,
  API_CONTRACTS,
  validateCriticalModuleExports,
  probeCriticalRuntimeDependencies,
  validateStartupEnvironment,
  validateApiContracts,
  probeCriticalApiHealth,
  runStartupValidation,
  evaluateGuardrailHealthCards,
  findMissingFields
};
