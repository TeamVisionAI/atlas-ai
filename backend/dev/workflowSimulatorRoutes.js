/**
 * Sprint 8A.4a — Developer-only workflow simulator routes.
 * See docs/WORKFLOW_SIMULATOR_SPEC.md
 */

const express = require("express");
const {
  createSimulatorProspect,
  simulateMessage,
  advanceSimulatorWorkflow,
  simulateStall,
  simulateInterview,
  getSimulatorState,
  getSimulatorEvents,
  getSimulatorTimeline,
  getSimulatorPriority,
  cleanupSimulatorProspect,
  handleSimulatorError
} = require("./workflowSimulatorService");
const { assertSimulatorPhone } = require("./simulatorSafety");
const { runAllGoldenScenarios } = require("./goldenScenarios");

const router = express.Router();

function isDevSimulatorEnabled() {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.ENABLE_DEV_SIMULATOR === "true"
  );
}

router.use((req, res, next) => {
  if (!isDevSimulatorEnabled()) {
    return res.status(404).json({
      success: false,
      error: "NOT_FOUND",
      message: "Workflow simulator is disabled."
    });
  }

  next();
});

router.post("/prospect", async (req, res) => {
  try {
    const data = await createSimulatorProspect(req.body || {});
    res.status(201).json({ success: true, ...data });
  } catch (error) {
    res.status(error.code === "SIM_PHONE_REQUIRED" ? 403 : 400).json(handleSimulatorError(error));
  }
});

router.delete("/prospect/:phone", async (req, res) => {
  try {
    assertSimulatorPhone(req.params.phone);
    await cleanupSimulatorProspect(req.params.phone);
    res.json({ success: true, simulator: true, message: "Simulator prospect deleted." });
  } catch (error) {
    res.status(error.code === "SIM_PHONE_REQUIRED" ? 403 : 400).json(handleSimulatorError(error));
  }
});

router.post("/message", async (req, res) => {
  try {
    const data = await simulateMessage(req.body || {});
    res.json({ success: true, ...data });
  } catch (error) {
    res.status(400).json(handleSimulatorError(error));
  }
});

router.post("/advance", async (req, res) => {
  try {
    const phone = req.body?.phone;

    if (!phone) {
      return res.status(400).json({
        success: false,
        error: "PHONE_REQUIRED",
        message: "phone is required in body."
      });
    }

    const result = await advanceSimulatorWorkflow(phone, req.body);
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    res.status(error.code === "SIM_PHONE_REQUIRED" ? 403 : 400).json(handleSimulatorError(error));
  }
});

router.post("/time/stall", async (req, res) => {
  try {
    const data = await simulateStall(req.body || {});
    res.json({ success: true, ...data });
  } catch (error) {
    res.status(400).json(handleSimulatorError(error));
  }
});

router.post("/interview", async (req, res) => {
  try {
    const result = await simulateInterview(req.body || {});
    res.status(result.success === false ? 400 : 200).json(result);
  } catch (error) {
    res.status(400).json(handleSimulatorError(error));
  }
});

router.get("/state/:phone", async (req, res) => {
  try {
    const state = await getSimulatorState(req.params.phone);

    if (!state) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Simulator prospect not found."
      });
    }

    res.json({ success: true, ...state });
  } catch (error) {
    res.status(error.code === "SIM_PHONE_REQUIRED" ? 403 : 400).json(handleSimulatorError(error));
  }
});

router.get("/events/:phone", async (req, res) => {
  try {
    const data = await getSimulatorEvents(req.params.phone, req.query);
    res.json({ success: true, ...data });
  } catch (error) {
    res.status(error.code === "SIM_PHONE_REQUIRED" ? 403 : 400).json(handleSimulatorError(error));
  }
});

router.get("/timeline/:phone", async (req, res) => {
  try {
    const data = await getSimulatorTimeline(req.params.phone);
    res.json({ success: true, ...data });
  } catch (error) {
    res.status(error.code === "SIM_PHONE_REQUIRED" ? 403 : 400).json(handleSimulatorError(error));
  }
});

router.get("/priority", async (req, res) => {
  try {
    const data = await getSimulatorPriority();
    res.json({ success: true, ...data });
  } catch (error) {
    res.status(500).json(handleSimulatorError(error));
  }
});

router.post("/scenarios/run", async (req, res) => {
  try {
    const report = await runAllGoldenScenarios();
    res.json({ success: true, ...report });
  } catch (error) {
    res.status(500).json(handleSimulatorError(error));
  }
});

module.exports = router;
