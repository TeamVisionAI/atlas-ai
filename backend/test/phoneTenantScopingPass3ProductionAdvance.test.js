/**
 * Pass 3B — production callers pass organizationId into advanceProspectWorkflow.
 */

require("dotenv").config();

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ORG = "00000000-0000-4000-8000-000000000001";
const PHONE = "+17865551234";
const AGENT = "11111111-1111-4111-8111-111111111111";

test("appointmentApplicationService passes organizationId on schedule and reschedule advances", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../application/appointmentApplicationService.js"),
    "utf8"
  );

  assert.match(
    source,
    /advanceProspectWorkflow\(prospectPhone,\s*\{\s*\n\s*organizationId,/
  );
  assert.match(
    source,
    /advanceProspectWorkflow\(appointment\.prospectPhone,\s*\{\s*\n\s*organizationId: appointment\.organizationId \|\| organizationId,/
  );
  assert.doesNotMatch(source, /DEFAULT_ORGANIZATION_ID/);
});

test("missionExecutionApplicationService passes organizationId into workflow advance", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../application/missionExecutionApplicationService.js"),
    "utf8"
  );

  assert.match(
    source,
    /const advanceResult = await advanceWorkflow\(phone,\s*\{[\s\S]*organizationId,/
  );
  assert.doesNotMatch(source, /DEFAULT_ORGANIZATION_ID/);
});

test("executeScheduleInterview forwards organizationId to advanceProspectWorkflow", async () => {
  const logService = require("../services/logService");
  const orchestrator = require("../core/recruitingWorkflowOrchestrator");
  const supabaseService = require("../services/supabaseService");
  const originalLog = logService.logConversation;
  const originalScheduled = orchestrator.onInterviewScheduled;
  const originalFindInOrg = supabaseService.findProspectInOrganization;

  const legacy = {
    id: "legacy-1",
    phone: PHONE,
    organization_id: ORG,
    name: "Schedule Test",
    city: "Miami",
    state: "FL",
    work_authorized: true,
    current_step: "QUALIFICATION"
  };

  logService.logConversation = async () => ({ success: true, skipped: true });
  orchestrator.onInterviewScheduled = async () => null;
  supabaseService.findProspectInOrganization = async () => ({ ...legacy, current_step: "CONFIRMED" });

  const { executeScheduleInterview } = require("../application/missionExecutionApplicationService");
  const advances = [];

  try {
    const result = await executeScheduleInterview(
      PHONE,
      {
        dateKey: "2026-08-10",
        timeKey: "13:00",
        interviewType: "In Person",
        timezone: "America/New_York"
      },
      {
        organizationId: ORG,
        agentId: AGENT,
        userId: AGENT,
        dependencies: {
          resolveTenantProspect: async () => legacy,
          resolveCanonicalProspectIdentity: async () => ({
            ok: true,
            coreProspectId: "core-1",
            legacyProspectId: "legacy-1"
          }),
          resolveInterviewLocation: async () => ({
            configured: true,
            location: "Office",
            meetingUrl: null
          }),
          getGoogleCalendarIntegrationStatus: async () => ({ connected: true }),
          scheduleAppointment: async () => ({
            success: true,
            googleCalendarEventId: "cal-pass3b",
            startTimeISO: "2026-08-10T17:00:00.000Z"
          }),
          updateProspect: async (_phone, patch) => {
            Object.assign(legacy, patch);
          },
          createPersistedScheduleAppointment: async () => ({
            id: "appt-pass3b",
            status: "scheduled",
            calendarEventId: "cal-pass3b"
          }),
          advanceProspectWorkflow: async (_phone, payload) => {
            advances.push(payload);
            return {
              success: true,
              workflow: { canonicalMilestone: "INTERVIEW_SCHEDULED" }
            };
          },
          findAppointmentById: async () => null
        }
      }
    );

    assert.equal(result.success, true);
    assert.equal(advances.length, 1);
    assert.equal(advances[0].organizationId, ORG);
    assert.equal(advances[0].targetMilestone, "INTERVIEW_SCHEDULED");
    assert.equal(advances[0].capturedFields.confirmed, true);
  } finally {
    logService.logConversation = originalLog;
    orchestrator.onInterviewScheduled = originalScheduled;
    supabaseService.findProspectInOrganization = originalFindInOrg;
  }
});

test("recordInterviewOutcome passes organizationId to advanceProspectWorkflow", async () => {
  const outcomeServicePath = require.resolve("../application/interviewOutcomeApplicationService");
  const supabaseService = require("../services/supabaseService");
  const humanAdvancementEngine = require("../core/humanAdvancementEngine");
  const logService = require("../services/logService");
  const productionProspectFilter = require("../core/productionProspectFilter");
  const resolverModule = require("../core/activeAppointmentResolver");

  const advances = [];
  const originalFindProspectInOrg = supabaseService.findProspectInOrganization;
  const originalAdvance = humanAdvancementEngine.advanceProspectWorkflow;
  const originalLog = logService.logConversation;
  const originalIsProductionProspect = productionProspectFilter.isProductionProspect;
  const originalFindActive = resolverModule.findActiveAppointmentForProspect;

  supabaseService.findProspectInOrganization = async () => ({
    phone: PHONE,
    name: "Interview Outcome Test",
    organization_id: ORG,
    current_step: "CONFIRMED",
    language: "en"
  });
  productionProspectFilter.isProductionProspect = () => true;
  humanAdvancementEngine.advanceProspectWorkflow = async (_phone, payload) => {
    advances.push(payload);
    return {
      success: true,
      workflow: { canonicalMilestone: "FOLLOW_UP" },
      eventsEmitted: []
    };
  };
  logService.logConversation = async () => null;
  resolverModule.findActiveAppointmentForProspect = async () => null;

  delete require.cache[outcomeServicePath];
  const { recordInterviewOutcome } = require(outcomeServicePath);

  try {
    const result = await recordInterviewOutcome({
      phone: PHONE,
      outcome: "Follow Up Needed",
      fields: { followUpDate: "2026-08-20" },
      organizationId: ORG,
      agentId: AGENT
    });

    assert.equal(result.success, true);
    assert.equal(advances.length, 1);
    assert.equal(advances[0].organizationId, ORG);
    assert.equal(advances[0].targetMilestone, "FOLLOW_UP");
    assert.equal(advances[0].capturedFields.followUpDate, "2026-08-20");
  } finally {
    supabaseService.findProspectInOrganization = originalFindProspectInOrg;
    humanAdvancementEngine.advanceProspectWorkflow = originalAdvance;
    logService.logConversation = originalLog;
    productionProspectFilter.isProductionProspect = originalIsProductionProspect;
    resolverModule.findActiveAppointmentForProspect = originalFindActive;
    delete require.cache[outcomeServicePath];
  }
});

test("recordInterviewOutcome fails closed without organizationId before workflow advance", async () => {
  const outcomeServicePath = require.resolve("../application/interviewOutcomeApplicationService");
  const supabaseService = require("../services/supabaseService");
  const humanAdvancementEngine = require("../core/humanAdvancementEngine");
  const productionProspectFilter = require("../core/productionProspectFilter");

  let lookupCalls = 0;
  const originalFindProspectInOrg = supabaseService.findProspectInOrganization;
  const originalAdvance = humanAdvancementEngine.advanceProspectWorkflow;
  const originalIsProductionProspect = productionProspectFilter.isProductionProspect;

  supabaseService.findProspectInOrganization = async () => {
    lookupCalls += 1;
    return {
      phone: PHONE,
      name: "Missing Org",
      current_step: "CONFIRMED"
    };
  };

  productionProspectFilter.isProductionProspect = () => true;

  delete require.cache[outcomeServicePath];
  const { recordInterviewOutcome } = require(outcomeServicePath);

  try {
    const result = await recordInterviewOutcome({
      phone: PHONE,
      outcome: "Follow Up Needed",
      fields: { followUpDate: "2026-08-20" },
      organizationId: null
    });

    assert.equal(result.success, false);
    assert.equal(result.error, "TENANT_ORGANIZATION_REQUIRED");
    assert.equal(lookupCalls, 0);
  } finally {
    supabaseService.findProspectInOrganization = originalFindProspectInOrg;
    humanAdvancementEngine.advanceProspectWorkflow = originalAdvance;
    productionProspectFilter.isProductionProspect = originalIsProductionProspect;
    delete require.cache[outcomeServicePath];
  }
});

test("production advanceProspectWorkflow call sites include organizationId", () => {
  const productionRoots = [
    "../application/appointmentApplicationService.js",
    "../application/interviewOutcomeApplicationService.js",
    "../controllers/workflowAdvanceController.js",
    "../core/conversationOutcomeEngine.js"
  ];

  for (const relativePath of productionRoots) {
    const source = fs.readFileSync(path.join(__dirname, relativePath), "utf8");
    const matches = [...source.matchAll(/advanceProspectWorkflow\(/g)];

    assert.ok(matches.length > 0, `${relativePath} should call advanceProspectWorkflow`);
    assert.match(source, /organizationId/, `${relativePath} should thread organizationId`);
    assert.doesNotMatch(
      source,
      /DEFAULT_ORGANIZATION_ID/,
      `${relativePath} must not use DEFAULT_ORGANIZATION_ID`
    );
  }

  const missionSource = fs.readFileSync(
    path.join(__dirname, "../application/missionExecutionApplicationService.js"),
    "utf8"
  );
  assert.match(
    missionSource,
    /const advanceResult = await advanceWorkflow\(phone,\s*\{[\s\S]*organizationId,/
  );
  assert.doesNotMatch(missionSource, /DEFAULT_ORGANIZATION_ID/);
});
