const express = require("express");
const {
  getMissionControlWithActions,
  executeAgentAction,
  syncAgentWorkflow
} = require("../controllers/agentActionController");

const router = express.Router();

router.get("/:phone", async (req, res) => {
  try {
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

router.post("/:phone/workflow", async (req, res) => {
  try {
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
