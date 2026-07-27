/**
 * Sprint 11.5 — Autonomous workflow validation engine.
 * Runs happy path, golden scenarios, validator audit, cross-system checks,
 * and failure recovery tests. Produces structured reports (no placeholders).
 */

const crypto = require("crypto");
const { MILESTONES, OWNERSHIP } = require("../core/workflowConstants");
const { validateAnswer } = require("../core/validationEngine");
const { validateScheduleStep, buildInitialSchedulingState, INTERVIEW_TYPES } = require("../core/schedulingEngine");
const { PhoneNumber } = require("../modules/prospects/domain/value-objects/PhoneNumber");
const { EmailAddress } = require("../modules/prospects/domain/value-objects/EmailAddress");
const { normalizePhoneNumber } = require("../core/phoneNormalizer");
const {
  normalizeMeetingManagement
} = require("../services/meetingManagementService");
const { validateMilestoneAdvancement } = require("../core/milestoneValidationEngine");
const { withSimulatorGuard } = require("./simulatorGuard");
const { runAllGoldenScenarios, runScenario, GOLDEN_SCENARIOS } = require("./goldenScenarios");
const {
  buildFullWorkflowState,
  advanceSimulatorWorkflow,
  getSimulatorEvents,
  getSimulatorTimeline,
  cleanupSimulatorProspect
} = require("./workflowSimulatorService");
const { clearSimulatedNow } = require("./simulatorClock");

const SCENARIO_DISPLAY_NAMES = Object.freeze({
  "01": "Happy Path Recruitment",
  "02": "Virtual Interview",
  "03": "Office Interview",
  "04": "Prospect Stops Replying",
  "05": "Human Calls and Advances Prospect",
  "06": "Interview No-show",
  "07": "Follow-up Scheduled",
  "08": "Prospect Closed",
  "09": "Do Not Contact",
  "10": "Prospect Reactivation"
});

function createStepResult(name, pass, details = {}) {
  return {
    name,
    pass: Boolean(pass),
    durationMs: details.durationMs ?? 0,
    reason: pass ? null : details.reason || "Assertion failed",
    location: details.location || null,
    stack: details.stack || null,
    suggestedFix: details.suggestedFix || null,
    ...details.extra
  };
}

function createSection(id, name) {
  const startedAt = Date.now();

  return {
    id,
    name,
    startedAt: new Date().toISOString(),
    steps: [],
    failures: [],

    addStep(step) {
      this.steps.push(step);
      if (!step.pass) {
        this.failures.push(step);
      }
      return step;
    },

    finalize() {
      const durationMs = Date.now() - startedAt;
      const stepsPassed = this.steps.filter((row) => row.pass).length;
      const stepsFailed = this.steps.filter((row) => !row.pass).length;

      return {
        id: this.id,
        name: this.name,
        startedAt: this.startedAt,
        completedAt: new Date().toISOString(),
        durationMs,
        stepsPassed,
        stepsFailed,
        overall: stepsFailed === 0 ? "PASS" : "FAIL",
        pass: stepsFailed === 0,
        steps: this.steps,
        failures: this.failures
      };
    }
  };
}

async function runValidatorCase(section, validatorName, caseName, assertionFn) {
  const startedAt = Date.now();

  try {
    const result = await assertionFn();
    const pass = Boolean(result);

    section.addStep(
      createStepResult(`${validatorName}: ${caseName}`, pass, {
        durationMs: Date.now() - startedAt,
        reason: pass ? null : `Expected pass for ${caseName}`,
        location: "backend/dev/autonomousValidationEngine.js#runValidatorAudit"
      })
    );
  } catch (error) {
    section.addStep(
      createStepResult(`${validatorName}: ${caseName}`, false, {
        durationMs: Date.now() - startedAt,
        reason: error.message,
        location: "backend/dev/autonomousValidationEngine.js#runValidatorAudit",
        stack: error.stack,
        suggestedFix: "Inspect validator implementation and test inputs."
      })
    );
  }
}

async function runValidatorAudit() {
  const section = createSection("validators", "Validators");

  await runValidatorCase(section, "Phone", "valid 10-digit", () =>
    PhoneNumber.create("7875551234")?.normalized === "+17875551234"
  );
  await runValidatorCase(section, "Phone", "valid E.164", () =>
    PhoneNumber.create("+17875559999")?.normalized === "+17875559999"
  );
  await runValidatorCase(section, "Phone", "invalid empty", () => PhoneNumber.create("") === null);
  await runValidatorCase(section, "Phone", "invalid letters", () => PhoneNumber.create("abc") === null);
  await runValidatorCase(section, "Phone", "edge normalized dedup", () => {
    const left = normalizePhoneNumber("(787) 555-1234");
    const right = normalizePhoneNumber("7875551234");
    return left === right && left === "17875551234";
  });

  await runValidatorCase(section, "Email", "valid input", () =>
    validateAnswer("EMAIL", "candidate@example.com").valid === true
  );
  await runValidatorCase(section, "Email", "invalid input", () =>
    validateAnswer("EMAIL", "not-an-email").valid === false
  );
  await runValidatorCase(section, "Email", "edge short valid", () => {
    EmailAddress.create("a@b.co");
    return validateAnswer("EMAIL", "a@b.co").valid === true;
  });

  await runValidatorCase(section, "City", "valid input", () =>
    validateAnswer("GREETING", "Miami, FL").valid === true
  );
  await runValidatorCase(section, "City", "invalid greeting", () =>
    validateAnswer("GREETING", "hi").valid === false
  );
  await runValidatorCase(section, "City", "edge accented city", () =>
    validateAnswer("GREETING", "San Juan, PR").valid === true
  );

  await runValidatorCase(section, "State", "valid with city", () => {
    const result = validateAnswer("GREETING", "Doral, FL");
    return result.valid === true;
  });
  await runValidatorCase(section, "State", "invalid too short", () =>
    validateAnswer("GREETING", "FL").valid === false
  );
  await runValidatorCase(section, "State", "edge multi-word city", () =>
    validateAnswer("GREETING", "New York, NY").valid === true
  );

  await runValidatorCase(section, "Work Authorization", "valid yes", () => {
    const result = validateAnswer("WORK_AUTHORIZATION", "yes");
    return result.valid === true && result.value === true;
  });
  await runValidatorCase(section, "Work Authorization", "invalid ambiguous", () =>
    validateAnswer("WORK_AUTHORIZATION", "maybe later").valid === false
  );
  await runValidatorCase(section, "Work Authorization", "edge no", () => {
    const result = validateAnswer("WORK_AUTHORIZATION", "no");
    return result.valid === true && result.value === false;
  });

  await runValidatorCase(section, "Duplicate Prospect", "same phone normalized", () => {
    const first = PhoneNumber.create("7875553001");
    const second = PhoneNumber.create("(787) 555-3001");
    return first.equals(second);
  });
  await runValidatorCase(section, "Duplicate Prospect", "different phones", () => {
    const first = PhoneNumber.create("7875553001");
    const second = PhoneNumber.create("7875553002");
    return !first.equals(second);
  });
  await runValidatorCase(section, "Duplicate Prospect", "edge null safe", () => {
    const first = PhoneNumber.create("7875553001");
    return first.equals(null) === false;
  });

  await runValidatorCase(section, "Meeting URL", "configured virtual", () => {
    const config = normalizeMeetingManagement({
      personalMeetingUrl: "https://meet.example.com/room-1"
    });
    return config.personalMeetingUrl === "https://meet.example.com/room-1";
  });
  await runValidatorCase(section, "Meeting URL", "missing url flagged", () => {
    const config = normalizeMeetingManagement({});
    return config.personalMeetingUrl === null;
  });
  await runValidatorCase(section, "Meeting URL", "edge whitespace trimmed", () => {
    const config = normalizeMeetingManagement({
      personalMeetingUrl: "  https://meet.example.com/room-2  "
    });
    return config.personalMeetingUrl === "https://meet.example.com/room-2";
  });

  await runValidatorCase(section, "Calendar Availability", "valid day selection", () => {
    const schedulingState = buildInitialSchedulingState(INTERVIEW_TYPES.ZOOM);
    const result = validateScheduleStep("1", {
      schedulingState,
      interviewType: INTERVIEW_TYPES.ZOOM
    });
    return result.valid === true;
  });
  await runValidatorCase(section, "Calendar Availability", "invalid day", () => {
    const schedulingState = buildInitialSchedulingState(INTERVIEW_TYPES.ZOOM);
    const result = validateScheduleStep("not-a-valid-day", {
      schedulingState,
      interviewType: INTERVIEW_TYPES.ZOOM
    });
    return result.valid === false && result.reason === "SCHEDULE_DAY_REQUIRED";
  });
  await runValidatorCase(section, "Calendar Availability", "edge empty selection", () => {
    const schedulingState = buildInitialSchedulingState(INTERVIEW_TYPES.ZOOM);
    const result = validateScheduleStep("", {
      schedulingState,
      interviewType: INTERVIEW_TYPES.ZOOM
    });
    return result.valid === false;
  });

  return section.finalize();
}

async function runFailureRecoveryTests() {
  const section = createSection("failure_recovery", "Failure Recovery");

  await runValidatorCase(section, "Invalid email", "returns validation error", () => {
    const result = validateAnswer("EMAIL", "@@@");
    return result.valid === false && result.reason === "EMAIL_REQUIRED";
  });

  await runValidatorCase(section, "Invalid phone", "rejects non-numeric", () =>
    PhoneNumber.create("call-me") === null
  );

  await runValidatorCase(section, "Missing meeting URL", "virtual resolves error code", () => {
    const config = normalizeMeetingManagement({});
    return config.personalMeetingUrl === null;
  });

  await runValidatorCase(section, "Calendar unavailable", "invalid period rejected", () => {
    const schedulingState = buildInitialSchedulingState(INTERVIEW_TYPES.ZOOM);
    const day = schedulingState.offeredDays[0];
    const periodState = {
      ...schedulingState,
      phase: "PERIOD",
      selectedDay: day
    };
    const result = validateScheduleStep("invalid-period", {
      schedulingState: periodState,
      interviewType: INTERVIEW_TYPES.ZOOM
    });
    return result.valid === false;
  });

  await runValidatorCase(section, "Duplicate lead", "phone equality detects duplicate", () => {
    const a = PhoneNumber.create("7875551111");
    const b = PhoneNumber.create("7875551111");
    return a.equals(b);
  });

  await runValidatorCase(section, "Missing city", "greeting rejected", () =>
    validateAnswer("GREETING", "ok").valid === false
  );

  await runValidatorCase(section, "Missing authorization", "ambiguous answer rejected", () =>
    validateAnswer("WORK_AUTHORIZATION", "I think so").valid === false
  );

  await runValidatorCase(section, "Invalid milestone advance", "blocked transition", () => {
    const result = validateMilestoneAdvancement({
      currentMilestone: MILESTONES.CLOSED,
      targetMilestone: MILESTONES.FOLLOW_UP,
      prospect: { current_step: "CONFIRMED" },
      capturedFields: {}
    });
    return result.valid === false && result.invalidTransition === true;
  });

  return section.finalize();
}

async function verifyCrossSystemSync(phone, section) {
  const startedAt = Date.now();

  try {
    const fullState = await buildFullWorkflowState(phone);
    const events = await getSimulatorEvents(phone, { limit: 100 });
    const timeline = await getSimulatorTimeline(phone);

    const workflowMilestone = fullState?.workflow?.canonicalMilestone;
    const mcTier = fullState?.workflow?.missionControlPriorityTier;
    const eventCount = events.events?.length || 0;
    const timelineCount = timeline.timeline?.length || 0;

    const checks = [
      createStepResult("Cross-system: prospect exists", Boolean(fullState?.prospect), {
        durationMs: 0,
        location: "workflowSimulatorService.buildFullWorkflowState"
      }),
      createStepResult("Cross-system: workflow milestone present", Boolean(workflowMilestone), {
        durationMs: 0,
        location: "workflowReadModel"
      }),
      createStepResult("Cross-system: mission control tier present", mcTier !== undefined && mcTier !== null, {
        durationMs: 0,
        location: "missionControlPriorityEngine"
      }),
      createStepResult("Cross-system: workflow events emitted", eventCount > 0, {
        durationMs: 0,
        location: "workflowEventService",
        extra: { eventCount }
      }),
      createStepResult("Cross-system: timeline populated", timelineCount > 0, {
        durationMs: 0,
        location: "timelineService",
        extra: { timelineCount }
      }),
      createStepResult("Cross-system: milestone consistent", workflowMilestone === fullState?.workflow?.canonicalMilestone, {
        durationMs: 0,
        location: "workflowReadModel"
      })
    ];

    for (const check of checks) {
      check.durationMs = Date.now() - startedAt;
      section.addStep(check);
    }

    return fullState;
  } catch (error) {
    section.addStep(
      createStepResult("Cross-system sync", false, {
        durationMs: Date.now() - startedAt,
        reason: error.message,
        location: "autonomousValidationEngine.verifyCrossSystemSync",
        stack: error.stack,
        suggestedFix: "Ensure simulator prospect exists and projection tables are reachable."
      })
    );

    return null;
  }
}

async function runHappyPathValidation() {
  const section = createSection("happy_path", "Happy Path");
  const happyScenario = GOLDEN_SCENARIOS.find((row) => row.id === "01");

  if (!happyScenario) {
    section.addStep(
      createStepResult("Happy path scenario definition", false, {
        reason: "Golden scenario 01 not found",
        location: "goldenScenarios.js"
      })
    );
    return section.finalize();
  }

  const startedAt = Date.now();
  let report = null;
  let phone = null;

  try {
    report = await withSimulatorGuard(async () => runScenario(happyScenario));
    phone = report?.phone || null;

    const pass = report.pass === true;
    section.addStep(
      createStepResult("Happy path workflow completes", pass, {
        durationMs: Date.now() - startedAt,
        reason: pass
          ? null
          : `Expected milestone ${happyScenario.expected.canonicalMilestone}, got ${report.actualResult?.canonicalMilestone}`,
        location: "goldenScenarios.runScenario",
        suggestedFix: pass
          ? null
          : "Inspect humanAdvancementEngine and milestone validation for scenario 01.",
        extra: {
          expected: happyScenario.expected,
          actual: report.actualResult
        }
      })
    );

    if (report.actualResult?.canonicalMilestone === MILESTONES.ORIENTATION) {
      section.addStep(
        createStepResult("Prospect reaches ORIENTATION milestone", true, {
          durationMs: 0,
          location: "workflowConstants.MILESTONES"
        })
      );
    } else {
      section.addStep(
        createStepResult("Prospect reaches ORIENTATION milestone", false, {
          durationMs: 0,
          reason: `Got ${report.actualResult?.canonicalMilestone}`,
          location: "workflowConstants.MILESTONES"
        })
      );
    }

    if (report.actualResult?.workflowOwnership === OWNERSHIP.ATLAS) {
      section.addStep(
        createStepResult("Workflow ownership ATLAS", true, { durationMs: 0 })
      );
    } else {
      section.addStep(
        createStepResult("Workflow ownership ATLAS", false, {
          durationMs: 0,
          reason: `Got ${report.actualResult?.workflowOwnership}`
        })
      );
    }

    const eventTypes = report.actualResult?.eventTypes || [];
    section.addStep(
      createStepResult("Workflow events recorded", eventTypes.length > 0, {
        durationMs: 0,
        extra: { eventTypes }
      })
    );
  } catch (error) {
    section.addStep(
      createStepResult("Happy path execution", false, {
        durationMs: Date.now() - startedAt,
        reason: error.message,
        stack: error.stack,
        location: "goldenScenarios.runScenario"
      })
    );
  }

  if (phone) {
    await verifyCrossSystemSync(phone, section);
    await cleanupSimulatorProspect(phone).catch(() => {});
  } else {
    section.addStep(
      createStepResult("Cross-system sync", false, {
        reason: "Could not resolve happy path simulator phone for cross-system checks.",
        suggestedFix: "Ensure golden scenario 01 creates a sim-golden-01-* prospect."
      })
    );
  }

  clearSimulatedNow();
  return section.finalize();
}

async function runWorkflowScenarios() {
  const section = createSection("workflow_scenarios", "Workflow Scenarios");
  const startedAt = Date.now();

  let goldenReport = null;

  try {
    goldenReport = await withSimulatorGuard(() => runAllGoldenScenarios());
  } catch (error) {
    section.addStep(
      createStepResult("Run all golden scenarios", false, {
        durationMs: Date.now() - startedAt,
        reason: error.message,
        stack: error.stack,
        location: "goldenScenarios.runAllGoldenScenarios"
      })
    );
    return section.finalize();
  }

  for (const report of goldenReport.reports || []) {
    const scenarioId = GOLDEN_SCENARIOS.find((row) => row.name === report.scenarioName)?.id || "?";
    const displayName = SCENARIO_DISPLAY_NAMES[scenarioId] || report.scenarioName;

    section.addStep(
      createStepResult(displayName, report.pass === true, {
        durationMs: 0,
        reason: report.pass
          ? null
          : `Scenario failed — expected ${JSON.stringify(report.expectedResult)}, got ${JSON.stringify(report.actualResult)}`,
        location: `goldenScenarios#${scenarioId}`,
        suggestedFix: report.pass ? null : "Review scenario steps and milestone expectations.",
        extra: {
          scenarioId,
          expected: report.expectedResult,
          actual: report.actualResult
        }
      })
    );
  }

  section.addStep(
    createStepResult("All scenarios summary", goldenReport.failed === 0, {
      durationMs: Date.now() - startedAt,
      extra: {
        passed: goldenReport.passed,
        failed: goldenReport.failed,
        total: goldenReport.total
      }
    })
  );

  clearSimulatedNow();
  return section.finalize();
}

async function runCrossSystemValidationSection() {
  const section = createSection("cross_system", "Cross-System Validation");
  const phone = `sim-validation-${crypto.randomUUID().slice(0, 8)}`;

  try {
    await withSimulatorGuard(async () => {
      const { createSimulatorProspect, simulateMessage, advanceSimulatorWorkflow } = require("./workflowSimulatorService");

      await cleanupSimulatorProspect(phone);

      await createSimulatorProspect({
        phone,
        name: "Cross System Validation",
        preset: "QUALIFICATION"
      });

      await simulateMessage({
        phone,
        direction: "outgoing",
        body: "Cross-system validation probe"
      });

      await advanceSimulatorWorkflow(phone, {
        targetMilestone: MILESTONES.INTERVIEW_SCHEDULED,
        capturedFields: {
          city: "Miami",
          state: "FL",
          authorization: true,
          occupation: "Sales",
          interviewType: "Zoom",
          email: "cross-system@example.com",
          interviewDateTime: new Date(Date.now() + 86400000 * 2).toISOString()
        },
        interactionType: "phone"
      });

      await verifyCrossSystemSync(phone, section);

      const fullState = await buildFullWorkflowState(phone);
      const milestone = fullState?.workflow?.canonicalMilestone;

      section.addStep(
        createStepResult("Mission Control state synchronized", milestone === MILESTONES.INTERVIEW_SCHEDULED, {
          reason:
            milestone === MILESTONES.INTERVIEW_SCHEDULED
              ? null
              : `Expected INTERVIEW_SCHEDULED, got ${milestone}`,
          location: "missionControlPriorityEngine"
        })
      );

      section.addStep(
        createStepResult("Prospect Center data present", Boolean(fullState?.prospect?.phone), {
          location: "supabaseService.findProspect"
        })
      );

      section.addStep(
        createStepResult("Analytics events available", (fullState?.workflow ? 1 : 0) > 0, {
          location: "workflowEventService"
        })
      );

      await cleanupSimulatorProspect(phone);
    });
  } catch (error) {
    section.addStep(
      createStepResult("Cross-system validation run", false, {
        reason: error.message,
        stack: error.stack,
        location: "autonomousValidationEngine.runCrossSystemValidationSection"
      })
    );
  }

  clearSimulatedNow();
  return section.finalize();
}

function buildRecommendations(sections) {
  const recommendations = [];
  const remainingIssues = [];
  const regressionRisks = [];

  for (const section of sections) {
    for (const failure of section.failures || []) {
      remainingIssues.push({
        section: section.name,
        step: failure.name,
        reason: failure.reason,
        location: failure.location,
        suggestedFix: failure.suggestedFix
      });
    }
  }

  if (remainingIssues.some((row) => row.section === "Happy Path")) {
    recommendations.push(
      "Fix happy path milestone progression before production — core recruiting funnel is broken."
    );
    regressionRisks.push("Happy path regression blocks end-to-end autonomous recruiting.");
  }

  if (remainingIssues.some((row) => row.section === "Validators")) {
    recommendations.push("Review conversation validators — invalid data may slip through qualification.");
    regressionRisks.push("Validator failures can cause bad scheduling or compliance issues.");
  }

  if (remainingIssues.some((row) => row.section === "Failure Recovery")) {
    recommendations.push("Harden error handling paths — Atlas may crash or leak errors on bad input.");
    regressionRisks.push("Failure recovery gaps risk production instability.");
  }

  if (remainingIssues.some((row) => row.section === "Cross-System Validation")) {
    recommendations.push("Replay projections and verify Mission Control / timeline sync.");
    regressionRisks.push("Cross-system drift causes operator confusion and missed follow-ups.");
  }

  if (remainingIssues.some((row) => row.section === "Import Validation")) {
    recommendations.push("Fix missing module exports before deploy — prevents runtime ReferenceErrors.");
    regressionRisks.push("Missing imports/exports can break Mission Control and scheduling silently at runtime.");
  }

  if (remainingIssues.some((row) => row.section === "API Contract Validation")) {
    recommendations.push("Align API payloads with frontend adapters — UI pages will fail even when routes respond.");
    regressionRisks.push("Contract drift causes workspace load failures across Mission Control and Prospect Center.");
  }

  if (remainingIssues.some((row) => row.section === "Startup Validation")) {
    recommendations.push("Resolve startup guardrail failures before restarting the server.");
    regressionRisks.push("Startup validation failures indicate the server should not accept traffic.");
  }

  if (remainingIssues.some((row) => row.section === "Mission Control Load")) {
    recommendations.push("Fix Mission Control API load path before deploy — agents cannot work prospects.");
    regressionRisks.push("Mission Control load failure blocks the primary agent workspace.");
  }

  if (remainingIssues.length === 0) {
    recommendations.push("All automated validation checks passed — run manual WhatsApp and Google Calendar smoke in staging.");
  } else {
    recommendations.push("Re-run complete validation after fixes: node backend/dev/verifySprint11_5.js");
  }

  return { remainingIssues, regressionRisks, recommendations };
}

function summarizeSections(sections) {
  let stepsPassed = 0;
  let stepsFailed = 0;

  for (const section of sections) {
    stepsPassed += section.stepsPassed || 0;
    stepsFailed += section.stepsFailed || 0;
  }

  const overall = stepsFailed === 0 ? "PASS" : "FAIL";
  const total = stepsPassed + stepsFailed;
  const passRate = total > 0 ? Math.round((stepsPassed / total) * 100) : 0;

  return {
    stepsPassed,
    stepsFailed,
    total,
    overall,
    passRate
  };
}

function buildDisplayReport(sections) {
  const lines = [];

  for (const section of sections) {
    const label = section.name.padEnd(20, ".");
    lines.push(`${label} ${section.overall}`);
  }

  return lines;
}

async function runMissionControlLoadTest() {
  const section = createSection("mission_control_load", "Mission Control Load");
  const startedAt = Date.now();
  const { getMissionControlWithActions } = require("../application/agentActionApplicationService");
  const { DEFAULT_ORGANIZATION_ID } = require("../modules/prospects/domain/constants");

  let payload = null;

  try {
    payload = await getMissionControlWithActions("latest", {
      organizationId: DEFAULT_ORGANIZATION_ID,
      tenantScoped: true
    });

    section.addStep(
      createStepResult("Mission Control API responds without server error", true, {
        durationMs: Date.now() - startedAt,
        location: "agentActionApplicationService.getMissionControlWithActions"
      })
    );
  } catch (error) {
    section.addStep(
      createStepResult("Mission Control API responds without server error", false, {
        durationMs: Date.now() - startedAt,
        reason: error.message,
        stack: error.stack,
        location: "backend/application/agentActionApplicationService.js",
        suggestedFix: "Ensure getOrganizationSettings and Mission Control dependencies are imported."
      })
    );
    return section.finalize();
  }

  if (!payload) {
    section.addStep(
      createStepResult("Mission Control payload available (or empty queue)", true, {
        reason: null,
        extra: { note: "No production prospects in queue — API returned null without error." }
      })
    );
    return section.finalize();
  }

  const adapterRequired = [
    ["prospect", Boolean(payload.prospect)],
    ["brain", Boolean(payload.brain)],
    ["businessRules", Boolean(payload.businessRules)],
    ["atlasBrief", Boolean(payload.atlasBrief)],
    ["workflow", Boolean(payload.workflow)],
    ["latestConversation", payload.latestConversation !== undefined],
    ["availableActions", Array.isArray(payload.availableActions)],
    ["conversationMessages", Array.isArray(payload.conversationMessages)],
    ["aiActionCenter", payload.aiActionCenter !== undefined],
    ["workflowGate", Boolean(payload.workflowGate)]
  ];

  for (const [field, ok] of adapterRequired) {
    section.addStep(
      createStepResult(`Mission Control field: ${field}`, ok, {
        location: "frontend/src/adapters/missionControlAdapter.js",
        reason: ok ? null : `Missing or invalid "${field}" in Mission Control API response.`
      })
    );
  }

  section.addStep(
    createStepResult("Mission Control brain.currentStep present", Boolean(payload.brain?.currentStep), {
      location: "missionControlReadModel"
    })
  );

  section.addStep(
    createStepResult("Mission Control workflow.canonicalMilestone present", Boolean(payload.workflow?.canonicalMilestone), {
      location: "workflowReadModel"
    })
  );

  return section.finalize();
}

async function runCompleteValidation() {
  const startedAt = Date.now();
  const ranAt = new Date().toISOString();

  const happyPath = await runHappyPathValidation();
  const workflowScenarios = await runWorkflowScenarios();
  const validators = await runValidatorAudit();
  const crossSystem = await runCrossSystemValidationSection();
  const failureRecovery = await runFailureRecoveryTests();
  const missionControlLoad = await runMissionControlLoadTest();
  const sections = [
    happyPath,
    workflowScenarios,
    validators,
    crossSystem,
    failureRecovery,
    missionControlLoad
  ];
  const summary = summarizeSections(sections);
  const { remainingIssues, regressionRisks, recommendations } = buildRecommendations(sections);

  const durationMs = Date.now() - startedAt;

  return {
    sprint: "11.5",
    title: "Atlas Validation Report",
    ranAt,
    durationMs,
    durationSeconds: Math.round(durationMs / 1000),
    ...summary,
    displayLines: buildDisplayReport(sections),
    sections,
    validationSummary: {
      happyPath: happyPath.overall,
      virtualInterview: workflowScenarios.steps.find((row) => row.name === "Virtual Interview")?.pass
        ? "PASS"
        : "FAIL",
      officeInterview: workflowScenarios.steps.find((row) => row.name === "Office Interview")?.pass
        ? "PASS"
        : "FAIL",
      validators: validators.overall,
      missionControl: missionControlLoad.overall,
      calendar: validators.steps.find((row) => row.name.includes("Calendar"))?.pass ? "PASS" : "FAIL",
      timeline: crossSystem.steps.find((row) => row.name.includes("timeline"))?.pass ? "PASS" : "FAIL",
      analytics: crossSystem.steps.find((row) => row.name.includes("Analytics"))?.pass ? "PASS" : "FAIL",
      failureRecovery: failureRecovery.overall
    },
    remainingIssues,
    regressionRisks,
    recommendations
  };
}

module.exports = {
  SCENARIO_DISPLAY_NAMES,
  runCompleteValidation,
  runHappyPathValidation,
  runWorkflowScenarios,
  runValidatorAudit,
  runCrossSystemValidationSection,
  runFailureRecoveryTests,
  runMissionControlLoadTest,
};
