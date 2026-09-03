/**
 * Sprint 17.0 — Operations Center API routes.
 */

const express = require("express");
const { requireAtlasUser } = require("../middleware/requireAtlasUser");
const {
  canAccessOperationsCenter,
  getOperationsAccessProfile
} = require("./operationsCenterAccess");
const operationsCenterService = require("./operationsCenterService");

function createOperationsRoutes(deps = {}) {
  const router = express.Router();
  const businessEventService = deps.businessEventService;

  router.use(requireAtlasUser);

  router.get("/access", (req, res) => {
    res.json({
      success: true,
      ...getOperationsAccessProfile(req.atlasUser)
    });
  });

  router.use((req, res, next) => {
    if (!canAccessOperationsCenter(req.atlasUser)) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Operations Center is not available."
      });
    }

    next();
  });

  router.get("/dashboard", async (req, res) => {
    try {
      const dashboard = await operationsCenterService.getOperationsDashboard();
      res.json({ success: true, ...dashboard });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "DASHBOARD_FAILED",
        message: error.message
      });
    }
  });

  router.get("/health/system", async (req, res) => {
    try {
      const health = await operationsCenterService.getSystemHealth();
      res.json({ success: true, ...health });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "SYSTEM_HEALTH_FAILED",
        message: error.message
      });
    }
  });

  router.get("/smoke-tests", (req, res) => {
    res.json({
      success: true,
      tests: operationsCenterService.listSmokeTests()
    });
  });

  router.post("/smoke-tests/:testId", async (req, res) => {
    try {
      const result = await operationsCenterService.runSmokeTest(req.params.testId);
      res.json({ success: true, ...result });
    } catch (error) {
      res.status(error.statusCode || 500).json({
        success: false,
        error: "SMOKE_TEST_FAILED",
        message: error.message
      });
    }
  });

  router.post("/replay/all", async (req, res) => {
    try {
      const result = await operationsCenterService.replayAllProjections();
      res.json({ success: true, ...result });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "REPLAY_FAILED",
        message: error.message
      });
    }
  });

  router.post("/replay/prospect", async (req, res) => {
    try {
      const result = await operationsCenterService.replaySingleProspect(req.body?.prospectId);
      res.json({ success: true, ...result });
    } catch (error) {
      res.status(error.statusCode || 500).json({
        success: false,
        error: "REPLAY_FAILED",
        message: error.message
      });
    }
  });

  router.post("/replay/reset", async (req, res) => {
    try {
      const result = await operationsCenterService.resetProjectionState();
      res.json({ success: true, ...result });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "RESET_FAILED",
        message: error.message
      });
    }
  });

  router.post("/replay/mission-control", async (req, res) => {
    try {
      const result = await operationsCenterService.rebuildMissionControlProjection(req.body || {});
      res.json({ success: true, ...result });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "REBUILD_FAILED",
        message: error.message
      });
    }
  });

  router.post("/replay/executive-dashboard", async (req, res) => {
    try {
      const result = await operationsCenterService.rebuildExecutiveDashboardProjection(
        req.body || {}
      );
      res.json({ success: true, ...result });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "REBUILD_FAILED",
        message: error.message
      });
    }
  });

  router.get("/business-events", async (req, res) => {
    try {
      const result = await operationsCenterService.listBusinessEvents(
        {
          prospectId: req.query.prospectId,
          eventType: req.query.eventType,
          correlationId: req.query.correlationId,
          from: req.query.from,
          to: req.query.to,
          organizationId: req.query.organizationId,
          limit: req.query.limit,
          offset: req.query.offset
        },
        businessEventService
      );
      res.json(result);
    } catch (error) {
      res.status(error.statusCode || 500).json({
        success: false,
        error: "BUSINESS_EVENTS_FAILED",
        message: error.message
      });
    }
  });

  router.get("/business-events/:id", async (req, res) => {
    try {
      const result = await operationsCenterService.getBusinessEventById(
        req.params.id,
        businessEventService
      );
      res.json(result);
    } catch (error) {
      res.status(error.statusCode || 500).json({
        success: false,
        error: "BUSINESS_EVENT_FAILED",
        message: error.message
      });
    }
  });

  router.get("/timeline/:prospectId", async (req, res) => {
    try {
      const result = await operationsCenterService.getProspectTimeline(
        req.params.prospectId,
        businessEventService
      );
      res.json(result);
    } catch (error) {
      res.status(error.statusCode || 500).json({
        success: false,
        error: "TIMELINE_FAILED",
        message: error.message
      });
    }
  });

  router.get("/logs/diagnostics", async (req, res) => {
    try {
      const diagnostics = await operationsCenterService.getDiagnostics();
      res.json({ success: true, ...diagnostics });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "DIAGNOSTICS_FAILED",
        message: error.message
      });
    }
  });


  router.post("/validation/run-complete", async (req, res) => {
    try {
      const report = await operationsCenterService.runCompleteWorkflowValidation();
      res.status(report.success ? 200 : 422).json({ success: report.success, ...report });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "VALIDATION_FAILED",
        message: error.message,
        stack: process.env.NODE_ENV === "production" ? undefined : error.stack
      });
    }
  });


  router.get("/alpha-checklist", async (req, res) => {
    try {
      const report = await operationsCenterService.getAlphaAcceptanceChecklist({
        phone: req.query.phone || null,
        runValidation: req.query.runValidation === "true"
      });
      res.status(report.alphaReady ? 200 : 422).json({ success: report.alphaReady, ...report });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "ALPHA_CHECKLIST_FAILED",
        message: error.message
      });
    }
  });

  router.post("/alpha-checklist", async (req, res) => {
    try {
      const report = await operationsCenterService.getAlphaAcceptanceChecklist({
        phone: req.body?.phone || null,
        runValidation: req.body?.runValidation === true
      });
      res.status(report.alphaReady ? 200 : 422).json({ success: report.alphaReady, ...report });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "ALPHA_CHECKLIST_FAILED",
        message: error.message
      });
    }
  });

  router.get("/golden-path-trace/:phone", async (req, res) => {
    try {
      const trace = await operationsCenterService.getGoldenPathTrace(req.params.phone);
      res.json({ success: true, trace });
    } catch (error) {
      res.status(error.statusCode || 500).json({
        success: false,
        error: "GOLDEN_PATH_TRACE_FAILED",
        message: error.message
      });
    }
  });

  router.get("/simulator/scenarios", (req, res) => {
    res.json({
      success: true,
      scenarios: operationsCenterService.listSimulatorScenarios()
    });
  });

  router.post("/simulator/scenarios/run-all", async (req, res) => {
    try {
      const report = await operationsCenterService.runAllWorkflowScenarios();
      res.json({ success: true, ...report });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "SCENARIO_RUN_FAILED",
        message: error.message
      });
    }
  });

  router.post("/simulator/scenarios/:scenarioId/run", async (req, res) => {
    try {
      const report = await operationsCenterService.runWorkflowScenario(req.params.scenarioId);
      res.json({ success: true, report });
    } catch (error) {
      res.status(error.statusCode || 500).json({
        success: false,
        error: "SCENARIO_RUN_FAILED",
        message: error.message
      });
    }
  });

  router.get("/simulator/recruit-ai-v2/scenarios", (req, res) => {
    res.json({
      success: true,
      scenarios: operationsCenterService.listRecruitAiV2SimulatorScenarios()
    });
  });

  router.post("/simulator/recruit-ai-v2/scenarios/run-all", (req, res) => {
    try {
      const report = operationsCenterService.runAllRecruitAiV2SimulatorScenarios();
      res.json({ success: true, ...report });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "V2_SCENARIO_SUITE_FAILED",
        message: error.message
      });
    }
  });

  router.post("/simulator/recruit-ai-v2/scenarios/:scenarioId/run", (req, res) => {
    try {
      const report = operationsCenterService.runRecruitAiV2SimulatorScenario(
        req.params.scenarioId
      );
      res.json({ success: true, report });
    } catch (error) {
      res.status(error.statusCode || 500).json({
        success: false,
        error: "V2_SCENARIO_RUN_FAILED",
        message: error.message
      });
    }
  });

  router.get("/simulator/iul-policy-review/scenarios", (req, res) => {
    res.json({
      success: true,
      scenarios: operationsCenterService.listIulPolicyReviewSimulatorScenarios()
    });
  });

  router.post("/simulator/iul-policy-review/scenarios/run-all", async (req, res) => {
    try {
      const report = await operationsCenterService.runAllIulPolicyReviewSimulatorScenarios();
      res.json({ success: true, ...report });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "IUL_SCENARIO_SUITE_FAILED",
        message: error.message
      });
    }
  });

  router.post("/simulator/iul-policy-review/scenarios/:scenarioId/run", async (req, res) => {
    try {
      const report = await operationsCenterService.runIulPolicyReviewSimulatorScenario(
        req.params.scenarioId,
        req,
        req.body || {}
      );
      res.json({ success: true, report });
    } catch (error) {
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.code || "IUL_SCENARIO_RUN_FAILED",
        message: error.message
      });
    }
  });

  router.post("/simulator/iul-policy-review/staging-e2e/run-all", async (req, res) => {
    try {
      const report = await operationsCenterService.runIulStagingE2ESimulator(req, req.body || {});
      res.json({ success: true, ...report });
    } catch (error) {
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.code || "IUL_STAGING_E2E_FAILED",
        message: error.publicMessage || error.message
      });
    }
  });

  router.post("/simulator/iul-policy-review/staging-e2e/cleanup", async (req, res) => {
    try {
      const simulatorRunId = req.body?.simulatorRunId;
      const result = await operationsCenterService.cleanupIulStagingSimulatorEvent(
        req,
        simulatorRunId
      );
      res.json({ success: true, cleanup: result });
    } catch (error) {
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.code || "IUL_STAGING_CLEANUP_FAILED",
        message: error.publicMessage || error.message
      });
    }
  });

  router.get("/simulator/recruit-ai-v2/playground/meta", (req, res) => {
    res.json({
      success: true,
      ...operationsCenterService.getRecruitAiV2PlaygroundMeta()
    });
  });

  router.post("/simulator/recruit-ai-v2/playground/sessions", async (req, res) => {
    try {
      const session = await operationsCenterService.startRecruitAiV2PlaygroundSession(
        req.body || {}
      );
      res.status(201).json({ success: true, session });
    } catch (error) {
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.code || "PLAYGROUND_START_FAILED",
        message: error.message
      });
    }
  });

  router.get("/simulator/recruit-ai-v2/playground/sessions/:sessionId", (req, res) => {
    try {
      const session = operationsCenterService.getRecruitAiV2PlaygroundSession(
        req.params.sessionId
      );
      res.json({ success: true, session });
    } catch (error) {
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.code || "PLAYGROUND_SESSION_FAILED",
        message: error.message
      });
    }
  });

  router.post(
    "/simulator/recruit-ai-v2/playground/sessions/:sessionId/reset",
    async (req, res) => {
      try {
        const session = await operationsCenterService.resetRecruitAiV2PlaygroundSession(
          req.params.sessionId,
          req.body || {}
        );
        res.json({ success: true, session });
      } catch (error) {
        res.status(error.statusCode || 500).json({
          success: false,
          error: error.code || "PLAYGROUND_RESET_FAILED",
          message: error.message
        });
      }
    }
  );

  router.post(
    "/simulator/recruit-ai-v2/playground/sessions/:sessionId/turns",
    async (req, res) => {
      try {
        const result = await operationsCenterService.sendRecruitAiV2PlaygroundTurn(
          req.params.sessionId,
          req.body || {}
        );
        res.json(result);
      } catch (error) {
        res.status(error.statusCode || 500).json({
          success: false,
          error: error.code || "PLAYGROUND_TURN_FAILED",
          message: error.message
        });
      }
    }
  );

  router.post(
    "/simulator/recruit-ai-v2/playground/sessions/:sessionId/regression-candidate",
    (req, res) => {
      try {
        const result =
          operationsCenterService.exportRecruitAiV2PlaygroundRegressionCandidate(
            req.params.sessionId
          );
        res.json(result);
      } catch (error) {
        res.status(error.statusCode || 500).json({
          success: false,
          error: error.code || "PLAYGROUND_CANDIDATE_FAILED",
          message: error.message
        });
      }
    }
  );

  router.post("/simulator/facebook-lead", async (req, res) => {
    try {
      const result = await operationsCenterService.simulateFacebookLead(req.body || {});
      res.status(result.success ? 201 : 400).json({ success: result.success, ...result });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "SIMULATOR_FAILED",
        message: error.message
      });
    }
  });

  router.post("/simulator/website-lead", async (req, res) => {
    try {
      const result = await operationsCenterService.simulateWebsiteLead(
        req.body || {},
        req.atlasUser
      );
      res.status(result.success ? 201 : result.status || 400).json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "SIMULATOR_FAILED",
        message: error.message
      });
    }
  });

  router.post("/simulator/whatsapp", async (req, res) => {
    try {
      const result = await operationsCenterService.simulateWhatsAppConversation(req.body || {});
      res.status(201).json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "SIMULATOR_FAILED",
        message: error.message
      });
    }
  });

  router.get("/simulator/workflow/state/:phone", async (req, res) => {
    try {
      const state = await operationsCenterService.getWorkflowSimulatorState(req.params.phone);
      res.json({ success: true, ...state });
    } catch (error) {
      res.status(error.statusCode || 500).json({
        success: false,
        error: "SIMULATOR_STATE_FAILED",
        message: error.message
      });
    }
  });

  router.post("/simulator/workflow/advance", async (req, res) => {
    try {
      const phone = req.body?.phone;

      if (!phone) {
        return res.status(400).json({
          success: false,
          error: "PHONE_REQUIRED",
          message: "phone is required in body."
        });
      }

      const result = await operationsCenterService.advanceWorkflowSimulator(phone, req.body);
      res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "SIMULATOR_ADVANCE_FAILED",
        message: error.message
      });
    }
  });

  router.get("/simulator/workflow/events/:phone", async (req, res) => {
    try {
      const data = await operationsCenterService.getWorkflowSimulatorEvents(
        req.params.phone,
        req.query
      );
      res.json({ success: true, ...data });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "SIMULATOR_EVENTS_FAILED",
        message: error.message
      });
    }
  });

  router.get("/simulator/workflow/timeline/:phone", async (req, res) => {
    try {
      const data = await operationsCenterService.getWorkflowSimulatorTimeline(req.params.phone);
      res.json({ success: true, ...data });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "SIMULATOR_TIMELINE_FAILED",
        message: error.message
      });
    }
  });

  router.get("/review/:phone", async (req, res) => {
    try {
      const data = await operationsCenterService.getSimulatorReviewExperience(
        req.params.phone,
        req.atlasUser
      );
      res.json(data);
    } catch (error) {
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.code || "REVIEW_LOAD_FAILED",
        message: error.message
      });
    }
  });

  router.post("/review/:phone/message", async (req, res) => {
    try {
      const data = await operationsCenterService.sendSimulatorReviewMessage(
        req.params.phone,
        req.body?.message || req.body?.body,
        req.atlasUser
      );
      res.status(201).json(data);
    } catch (error) {
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.code || "REVIEW_MESSAGE_FAILED",
        message: error.message
      });
    }
  });

  return router;
}

module.exports = createOperationsRoutes;
