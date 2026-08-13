/**
 * Conversations Center — Niovel-only production pilot routes.
 */

const express = require("express");
const { requireAtlasUser } = require("../middleware/requireAtlasUser");
const { organizationGuard } = require("../middleware/organizationGuard");
const { getTenantOrganizationId } = require("../services/tenantContextService");
const {
  buildConversationsCenterReadModel,
  getConversationsAttentionCount
} = require("../core/conversationsCenter/conversationsCenterReadModel");
const {
  assertConversationsCenterPilotAccess,
  isProspectInNiovelPilotScope
} = require("../core/conversationsCenter/conversationsCenterAccess");
const {
  takeOverConversation,
  returnConversationToAtlas,
  resolveConversationOwnershipState,
  archiveConversation,
  closeConversation,
  restoreConversation,
  markConversationAsTest
} = require("../core/conversationsCenter/conversationsCenterOwnershipService");
const {
  sendHumanComposerReply
} = require("../core/conversationsCenter/conversationsCenterHumanReplyService");
const { loadPersistedWorkflowState } = require("../core/workflowStateStore");
const { findProspect } = require("../services/supabaseService");
const {
  INBOX_CLOSE_REASONS
} = require("../core/conversationsCenter/conversationsCenterLifecycle");

const router = express.Router();

router.use(requireAtlasUser);
router.use(organizationGuard());

function requirePilot(req, res) {
  try {
    assertConversationsCenterPilotAccess({
      userId: req.atlasUser?.id,
      organizationId: getTenantOrganizationId(req)
    });
    return true;
  } catch (error) {
    res.status(error.statusCode || 403).json({
      error: error.code || "CONVERSATIONS_CENTER_FORBIDDEN",
      message: error.message
    });
    return false;
  }
}

router.get("/attention-count", async (req, res) => {
  if (!requirePilot(req, res)) {
    return;
  }

  try {
    const organizationId = getTenantOrganizationId(req);
    const payload = await getConversationsAttentionCount(organizationId);
    res.json(payload);
  } catch (error) {
    console.error("[conversations-center] attention-count", error.message);
    res.status(error.statusCode || 500).json({
      error: error.code || "CONVERSATIONS_CENTER_FAILED",
      message: "Failed to load attention count"
    });
  }
});

router.get("/", async (req, res) => {
  if (!requirePilot(req, res)) {
    return;
  }

  try {
    const organizationId = getTenantOrganizationId(req);
    const payload = await buildConversationsCenterReadModel({
      organizationId,
      filter: req.query.filter,
      search: req.query.q
    });
    res.json(payload);
  } catch (error) {
    console.error("[conversations-center] list", error.message);
    res.status(error.statusCode || 500).json({
      error: error.code || "CONVERSATIONS_CENTER_FAILED",
      message: "Failed to load conversations"
    });
  }
});

async function loadScopedProspect(phone, organizationId) {
  const prospect = await findProspect(phone);
  if (!prospect || String(prospect.organization_id || "") !== String(organizationId)) {
    return null;
  }
  if (!isProspectInNiovelPilotScope(prospect)) {
    return null;
  }
  return prospect;
}

async function humanReplyHandler(req, res) {
  if (!requirePilot(req, res)) {
    return;
  }

  try {
    const organizationId = getTenantOrganizationId(req);
    const phone = req.body?.phone || req.params.phone;
    const result = await sendHumanComposerReply({
      phone,
      message: req.body?.message,
      clientRequestId: req.body?.clientRequestId,
      userId: req.atlasUser?.id,
      organizationId
    });

    res.json(result);
  } catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500) {
      console.error("[conversations-center] human-reply", error.message);
    }
    res.status(status).json({
      error: error.code || "HUMAN_REPLY_FAILED",
      message:
        status === 409 || status === 400 || status === 403 || status === 404
          ? error.message
          : "Failed to send human reply",
      ownershipState: error.ownershipState || null,
      retryable: Boolean(error.retryable),
      delivery: error.delivery
        ? {
            status: error.delivery.status || null,
            reason: error.delivery.reason || null,
            windowOpen: error.delivery.window?.open ?? null
          }
        : null
    });
  }
}

async function takeOverHandler(req, res) {
  if (!requirePilot(req, res)) {
    return;
  }

  try {
    const organizationId = getTenantOrganizationId(req);
    const phone = req.body?.phone || req.params.phone;
    const prospect = await loadScopedProspect(phone, organizationId);

    if (!prospect) {
      return res.status(404).json({
        error: "CONVERSATION_NOT_FOUND",
        message: "Conversation not found in Conversations Center scope"
      });
    }

    // Persist under prospect.phone (storage truth), not the request encoding.
    // TAKE OVER also acknowledges the current BR-080 attention episode (canonical).
    const result = await takeOverConversation(prospect.phone, {
      reason: req.body?.reason,
      organizationId: prospect.organization_id || organizationId || null,
      prospectId: prospect.id || null,
      prospect,
      actor: {
        userId: req.atlasUser?.id || req.authContext?.userId || null,
        userEmail:
          req.atlasUser?.email ||
          req.authContext?.email ||
          req.user?.email ||
          null
      }
    });

    res.json({
      success: true,
      action: "TAKE_OVER",
      phone: prospect.phone,
      ownershipState: result.ownershipState,
      handoffReason: result.next.handoffReason || null,
      workflow: {
        workflowOwnership: result.next.workflowOwnership,
        needsHumanAttention: Boolean(result.next.needsHumanAttention),
        manualAgentOwnership: Boolean(result.next.manualAgentOwnership),
        humanTakenOverAt: result.next.humanTakenOverAt || null
      },
      attention: {
        acknowledged: Boolean(
          result.attentionAck?.acknowledgedAt ||
            result.attentionAck?.alreadyAcknowledged
        ),
        alreadyAcknowledged: Boolean(result.attentionAck?.alreadyAcknowledged),
        attentionStatus: result.attentionAck?.attentionStatus || null,
        acknowledgedAt: result.attentionAck?.acknowledgedAt || null
      }
    });
  } catch (error) {
    console.error("[conversations-center] take-over", error.message);
    res.status(500).json({
      error: "CONVERSATIONS_CENTER_TAKEOVER_FAILED",
      message: "Failed to take over conversation"
    });
  }
}

async function returnToAtlasHandler(req, res) {
  if (!requirePilot(req, res)) {
    return;
  }

  try {
    const organizationId = getTenantOrganizationId(req);
    const phone = req.body?.phone || req.params.phone;
    const prospect = await loadScopedProspect(phone, organizationId);

    if (!prospect) {
      return res.status(404).json({
        error: "CONVERSATION_NOT_FOUND",
        message: "Conversation not found in Conversations Center scope"
      });
    }

    const result = await returnConversationToAtlas(prospect.phone, {
      organizationId: prospect.organization_id || organizationId || null,
      prospectId: prospect.id || null
    });

    res.json({
      success: true,
      action: "RETURN_TO_ATLAS",
      phone: prospect.phone,
      ownershipState: result.ownershipState,
      handoffReason: null,
      workflow: {
        workflowOwnership: result.next.workflowOwnership,
        needsHumanAttention: Boolean(result.next.needsHumanAttention),
        manualAgentOwnership: Boolean(result.next.manualAgentOwnership)
      }
    });
  } catch (error) {
    console.error("[conversations-center] return-to-atlas", error.message);
    res.status(500).json({
      error: "CONVERSATIONS_CENTER_RETURN_FAILED",
      message: "Failed to return conversation to Atlas"
    });
  }
}

// Preferred: phone in body (stable; avoids "+" phone path encoding issues).
router.post("/human-reply", humanReplyHandler);
router.post("/take-over", takeOverHandler);
router.post("/return-to-atlas", returnToAtlasHandler);

async function scopedLifecycleAction(req, res, actionName, run) {
  if (!requirePilot(req, res)) {
    return;
  }

  try {
    const organizationId = getTenantOrganizationId(req);
    const phone = req.body?.phone || req.params.phone;
    const prospect = await loadScopedProspect(phone, organizationId);

    if (!prospect) {
      return res.status(404).json({
        error: "CONVERSATION_NOT_FOUND",
        message: "Conversation not found in Conversations Center scope"
      });
    }

    const scope = {
      organizationId: prospect.organization_id || organizationId || null,
      prospectId: prospect.id || null
    };
    const result = await run(prospect.phone, req.body || {}, scope);
    const {
      buildConversationListItem
    } = require("../core/conversationsCenter/conversationsCenterReadModel");

    res.json({
      success: true,
      action: actionName,
      phone: prospect.phone,
      ownershipState: result.ownershipState,
      closeReason: result.closeReason || null,
      conversation: await buildConversationListItem(prospect),
      workflow: {
        workflowOwnership: result.next.workflowOwnership,
        needsHumanAttention: Boolean(result.next.needsHumanAttention),
        manualAgentOwnership: Boolean(result.next.manualAgentOwnership),
        inboxArchivedAt: result.next.inboxArchivedAt || null,
        inboxClosedAt: result.next.inboxClosedAt || null,
        inboxCloseReason: result.next.inboxCloseReason || null,
        inboxMarkedTestAt: result.next.inboxMarkedTestAt || null
      }
    });
  } catch (error) {
    console.error(`[conversations-center] ${actionName}`, error.message);
    res.status(500).json({
      error: `CONVERSATIONS_CENTER_${actionName}_FAILED`,
      message: `Failed to ${String(actionName).toLowerCase().replace(/_/g, " ")} conversation`
    });
  }
}

router.post("/archive", (req, res) =>
  scopedLifecycleAction(req, res, "ARCHIVE", (phone, _body, scope) =>
    archiveConversation(phone, scope)
  )
);
router.post("/restore", (req, res) =>
  scopedLifecycleAction(req, res, "RESTORE", (phone, _body, scope) =>
    restoreConversation(phone, scope)
  )
);
router.post("/close", (req, res) =>
  scopedLifecycleAction(req, res, "CLOSE", (phone, body, scope) =>
    closeConversation(phone, body?.reason || INBOX_CLOSE_REASONS.OTHER, scope)
  )
);
router.post("/mark-test", (req, res) =>
  scopedLifecycleAction(req, res, "MARK_TEST", (phone, _body, scope) =>
    markConversationAsTest(phone, scope)
  )
);

router.get("/:phone", async (req, res) => {
  if (!requirePilot(req, res)) {
    return;
  }

  try {
    const organizationId = getTenantOrganizationId(req);
    const prospect = await loadScopedProspect(req.params.phone, organizationId);

    if (!prospect) {
      return res.status(404).json({
        error: "CONVERSATION_NOT_FOUND",
        message: "Conversation not found in Conversations Center scope"
      });
    }

    const persisted = await loadPersistedWorkflowState(prospect.phone, {
      organizationId: prospect.organization_id || organizationId || null,
      prospectId: prospect.id || null
    });
    const {
      buildConversationListItem
    } = require("../core/conversationsCenter/conversationsCenterReadModel");
    // Implements BR-075 — expose canonical customer-care window for composer UX
    // (read-only; does not change send authorization, which still runs in the gate).
    const {
      evaluateCustomerCareWindow
    } = require("../core/whatsappCustomerCareWindow");
    const careWindow = await evaluateCustomerCareWindow({
      phone: prospect.phone,
      organizationId: prospect.organization_id || organizationId || null
    });

    res.json({
      phone: prospect.phone || null,
      conversation: await buildConversationListItem(prospect),
      ownershipState: resolveConversationOwnershipState(persisted),
      handoffReason: persisted.handoffReason || null,
      handoffAt: persisted.handoffAt || null,
      customerCareWindow: {
        open: Boolean(careWindow?.open),
        reason: careWindow?.reason || null,
        latestInboundAt: careWindow?.latestInboundAt || null,
        expiresAt: careWindow?.expiresAt || null,
        windowMs: careWindow?.windowMs || null
      },
      workflow: {
        workflowOwnership: persisted.workflowOwnership,
        needsHumanAttention: Boolean(persisted.needsHumanAttention),
        manualAgentOwnership: Boolean(persisted.manualAgentOwnership)
      },
      prospectId: prospect.id || null,
      communicationsPath: prospect.id
        ? `/api/prospects/${prospect.id}/communications`
        : null,
      timelinePresentation: {
        order: "newest_first",
        persistedOrderUnchanged: true
      }
    });
  } catch (error) {
    console.error("[conversations-center] detail", error.message);
    res.status(500).json({
      error: "CONVERSATIONS_CENTER_FAILED",
      message: "Failed to load conversation"
    });
  }
});

router.post("/:phone/take-over", takeOverHandler);

router.post("/:phone/return-to-atlas", returnToAtlasHandler);

// Backward-compatible path form.
router.post("/:phone/human-reply", humanReplyHandler);

module.exports = router;
