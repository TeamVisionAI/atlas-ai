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
  resolveConversationOwnershipState
} = require("../core/conversationsCenter/conversationsCenterOwnershipService");
const { loadPersistedWorkflowState } = require("../core/workflowStateStore");
const { findProspect } = require("../services/supabaseService");

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

    const persisted = loadPersistedWorkflowState(prospect.phone);
    const {
      buildConversationListItem
    } = require("../core/conversationsCenter/conversationsCenterReadModel");

    res.json({
      conversation: buildConversationListItem(prospect),
      ownershipState: resolveConversationOwnershipState(persisted),
      handoffReason: persisted.handoffReason || null,
      handoffAt: persisted.handoffAt || null,
      workflow: {
        workflowOwnership: persisted.workflowOwnership,
        needsHumanAttention: Boolean(persisted.needsHumanAttention),
        manualAgentOwnership: Boolean(persisted.manualAgentOwnership)
      },
      prospectId: prospect.id || null,
      communicationsPath: prospect.id
        ? `/api/prospects/${prospect.id}/communications`
        : null
    });
  } catch (error) {
    console.error("[conversations-center] detail", error.message);
    res.status(500).json({
      error: "CONVERSATIONS_CENTER_FAILED",
      message: "Failed to load conversation"
    });
  }
});

router.post("/:phone/take-over", async (req, res) => {
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

    const result = takeOverConversation(prospect.phone, {
      reason: req.body?.reason
    });

    res.json({
      success: true,
      action: "TAKE_OVER",
      ownershipState: result.ownershipState,
      handoffReason: result.next.handoffReason || null,
      workflow: {
        workflowOwnership: result.next.workflowOwnership,
        needsHumanAttention: Boolean(result.next.needsHumanAttention),
        manualAgentOwnership: Boolean(result.next.manualAgentOwnership)
      }
    });
  } catch (error) {
    console.error("[conversations-center] take-over", error.message);
    res.status(500).json({
      error: "CONVERSATIONS_CENTER_TAKEOVER_FAILED",
      message: "Failed to take over conversation"
    });
  }
});

router.post("/:phone/return-to-atlas", async (req, res) => {
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

    const result = returnConversationToAtlas(prospect.phone);

    res.json({
      success: true,
      action: "RETURN_TO_ATLAS",
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
});

module.exports = router;
