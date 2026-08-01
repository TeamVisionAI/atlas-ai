const express = require("express");
const {
  getMissionControlWithActionsForRequest,
  executeAgentActionForRequest,
  syncAgentWorkflowForRequest
} = require("../controllers/agentActionController");
const { postWorkflowAdvance } = require("../controllers/workflowAdvanceController");
const { postConversationOutcome } = require("../controllers/conversationOutcomeController");
const { postRequiredInformation } = require("../controllers/requiredInformationController");
const { postInterviewOutcome } = require("../controllers/interviewOutcomeController");
const { getMissionControlAvailability } = require("../controllers/availabilityController");
const { postMissionExecution, buildMissionExecutionOptions } = require("../controllers/missionExecutionController");
const {
  getCommunicationPreview,
  postCommunicationSend,
  postCommunicationExecute
} = require("../controllers/whatsappCommunicationController");
const { isProductionProspect } = require("../core/productionProspectFilter");
const { getCommunicationGateway } = require("../communication/gateway/createCommunicationGateway");
const { requireAtlasUser } = require("../middleware/requireAtlasUser");
const { organizationGuard } = require("../middleware/organizationGuard");
const { requireLegacyProspectAccess } = require("../middleware/requireProspectAccess");
const { requirePermission } = require("../middleware/requirePermission");
const { getTenantOrganizationId } = require("../services/tenantContextService");
const { PERMISSIONS } = require("../security/permissions");

function tenantMissionControlOptions(req) {
  const userId = req.tenantContext?.userId || req.authContext?.userId || req.atlasUser?.id || null;

  return {
    organizationId: getTenantOrganizationId(req),
    tenantScoped: true,
    userId,
    agentId: userId
  };
}

const router = express.Router();

router.use(requireAtlasUser);
router.use(organizationGuard());

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

router.get("/:phone/availability", requireLegacyProspectAccess(), getMissionControlAvailability);

router.get(
  "/:phone/communication/preview",
  requireLegacyProspectAccess(),
  async (req, res) => {
    if (rejectSimulatorProspect(req.params.phone, res)) {
      return;
    }

    return getCommunicationPreview(req, res);
  }
);

router.post(
  "/:phone/communication/send",
  requireLegacyProspectAccess({ write: true }),
  requirePermission(PERMISSIONS.PROSPECT_COMMUNICATE),
  async (req, res) => {
    if (rejectSimulatorProspect(req.params.phone, res)) {
      return;
    }

    return postCommunicationSend(req, res);
  }
);

router.post(
  "/:phone/communication/execute",
  requireLegacyProspectAccess({ write: true }),
  requirePermission(PERMISSIONS.PROSPECT_COMMUNICATE),
  async (req, res) => {
    if (rejectSimulatorProspect(req.params.phone, res)) {
      return;
    }

    return postCommunicationExecute(req, res);
  }
);

router.post(
  "/:phone/execute",
  requireLegacyProspectAccess({ write: true }),
  requirePermission(PERMISSIONS.PROSPECT_WRITE),
  async (req, res) => {
    try {
      if (rejectSimulatorProspect(req.params.phone, res)) {
        return;
      }

      const result = await postMissionExecution(
        req.params.phone,
        req.body || {},
        buildMissionExecutionOptions(req)
      );

      res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        action: "execute_mission",
        error: "SERVER_ERROR",
        message: error.message
      });
    }
  }
);

router.get("/:phone", requireLegacyProspectAccess(), async (req, res) => {
  try {
    if (rejectSimulatorProspect(req.params.phone, res)) {
      return;
    }

    const data = await getMissionControlWithActionsForRequest(req, req.params.phone);

    if (!data) {
      return res.status(404).json({ error: "No active conversation found" });
    }

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post(
  "/:phone/actions",
  requireLegacyProspectAccess({ write: true }),
  requirePermission(PERMISSIONS.PROSPECT_COMMUNICATE),
  async (req, res) => {
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

    const result = await executeAgentActionForRequest(
      req,
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

router.post(
  "/:phone/interview-outcome",
  requireLegacyProspectAccess({ write: true }),
  requirePermission(PERMISSIONS.PROSPECT_WRITE),
  async (req, res) => {
    try {
      if (rejectSimulatorProspect(req.params.phone, res)) {
        return;
      }

      const result = await postInterviewOutcome(
        req.params.phone,
        req.body || {},
        tenantMissionControlOptions(req)
      );

      res.status(result.success ? 200 : result.status || 400).json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "SERVER_ERROR",
        message: error.message
      });
    }
  }
);

router.post(
  "/:phone/required-information",
  requireLegacyProspectAccess({ write: true }),
  requirePermission(PERMISSIONS.PROSPECT_WRITE),
  async (req, res) => {
    try {
      if (rejectSimulatorProspect(req.params.phone, res)) {
        return;
      }

      const result = await postRequiredInformation(
        req.params.phone,
        req.body || {},
        tenantMissionControlOptions(req)
      );

      res.status(result.success ? 200 : result.status || 400).json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "SERVER_ERROR",
        message: error.message
      });
    }
  }
);

router.post(
  "/:phone/conversation-outcome",
  requireLegacyProspectAccess({ write: true }),
  requirePermission(PERMISSIONS.PROSPECT_WRITE),
  async (req, res) => {
    try {
      if (rejectSimulatorProspect(req.params.phone, res)) {
        return;
      }

      const result = await postConversationOutcome(
        req.params.phone,
        req.body || {},
        tenantMissionControlOptions(req)
      );

      res.status(result.success ? 200 : result.status || 400).json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "SERVER_ERROR",
        message: error.message
      });
    }
  }
);

router.post(
  "/:phone/workflow/advance",
  requireLegacyProspectAccess({ write: true }),
  requirePermission(PERMISSIONS.PROSPECT_WRITE),
  async (req, res) => {
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

router.post(
  "/:phone/workflow",
  requireLegacyProspectAccess({ write: true }),
  requirePermission(PERMISSIONS.PROSPECT_WRITE),
  async (req, res) => {
  try {
    if (rejectSimulatorProspect(req.params.phone, res)) {
      return;
    }

    const workflowState = await syncAgentWorkflowForRequest(
      req,
      req.params.phone,
      req.body || {}
    );

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
