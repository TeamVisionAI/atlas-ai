const express = require("express");
const {
  getMissionControlWithActions,
  executeAgentAction,
  syncAgentWorkflow
} = require("../controllers/agentActionController");
const { postWorkflowAdvance } = require("../controllers/workflowAdvanceController");
const { isProductionProspect } = require("../core/productionProspectFilter");
const { getCommunicationGateway } = require("../communication/gateway/createCommunicationGateway");

const router = express.Router();

router.get("/live/snapshot", (req, res) => {
  try {
    const { missionControlService } = getCommunicationGateway();
    res.json(missionControlService.getSnapshot());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

function rejectSimulatorProspect(phone, res) {
  if (!isProductionProspect(phone)) {
    res.status(404).json({ error: "No active conversation found" });
    return true;
  }

  return false;
}

router.get("/:phone", async (req, res) => {
  try {
    if (rejectSimulatorProspect(req.params.phone, res)) {
      return;
    }

    const data = await getMissionControlWithActions(req.params.phone);

    if (!data) {
      return res.status(404).json({ error: "No active conversation found" });
    }

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/:phone/actions", async (req, res) => {
  try {
    if (rejectSimulatorProspect(req.params.phone, res)) {
      return;
    }

    const action = req.body?.action || req.body?.type;

    if (!action) {
      return res.status(400).json({
        success: false,
        action: null,
        error: "ACTION_REQUIRED",
        message: "Action type is required."
      });
    }

    const result = await executeAgentAction(
      req.params.phone,
      action,
      req.body?.payload || {}
    );

    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      action: req.body?.action || req.body?.type || null,
      error: "SERVER_ERROR",
      message: error.message
    });
  }
});

router.post("/:phone/workflow/advance", async (req, res) => {
  try {
    if (rejectSimulatorProspect(req.params.phone, res)) {
      return;
    }

    const result = await postWorkflowAdvance(req.params.phone, req.body || {});

    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      action: "workflow_advance",
      error: "SERVER_ERROR",
      message: error.message
    });
  }
});

router.post("/:phone/workflow", async (req, res) => {
  try {
    if (rejectSimulatorProspect(req.params.phone, res)) {
      return;
    }

    const workflowState = await syncAgentWorkflow(req.params.phone, req.body || {});

    res.json({
      success: true,
      action: "sync_workflow",
      message: "Workflow state synchronized.",
      workflowState
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      action: "sync_workflow",
      error: "SERVER_ERROR",
      message: error.message
    });
  }
});

module.exports = router;
