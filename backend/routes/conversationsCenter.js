/**
 * Conversations Center — tenant-scoped routes.
 * Access: GLOBAL_MASTER && TENANT_FEATURE(conversationsCenterEnabled) && RBAC.
 */

const express = require("express");
const { requireAtlasUser } = require("../middleware/requireAtlasUser");
const { organizationGuard } = require("../middleware/organizationGuard");
const { getTenantOrganizationId } = require("../services/tenantContextService");
const {
  operationalControlPlaneEmpty,
  emptyConversations
} = require("../core/operationalControlPlane");
const {
  buildConversationsCenterReadModel,
  getConversationsAttentionCount
} = require("../core/conversationsCenter/conversationsCenterReadModel");
const {
  assertConversationsCenterAccessAsync,
  resolveConversationsCenterAccessAsync,
  isProspectInConversationsTenantScope,
  isProspectInConversationsUserScope,
  ACCESS_CODES
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
const { logWhatsAppStage } = require("../core/whatsappStructuredLogger");
const {
  sendHumanComposerReply
} = require("../core/conversationsCenter/conversationsCenterHumanReplyService");
const { loadPersistedWorkflowState } = require("../core/workflowStateStore");
const {
  markConversationRead
} = require("../core/conversationsCenter/conversationsReadCursorService");
const { findProspectInOrganization } = require("../services/supabaseService");
const {
  INBOX_CLOSE_REASONS
} = require("../core/conversationsCenter/conversationsCenterLifecycle");
const {
  canUseConversationsSupportAccess,
  readConversationsSupportRequest,
  withConversationsSupportCapability,
  resolveConversationsListScope,
  shouldAuditConversationsSupportAccess
} = require("../core/conversationsPrivacyEngine");
const { auditFromRequest } = require("../security/auditLogService");

const router = express.Router();

router.use(requireAtlasUser);
router.use(organizationGuard());

async function requireConversationsAccess(req, res) {
  try {
    await assertConversationsCenterAccessAsync({
      userId: req.atlasUser?.id,
      organizationId: getTenantOrganizationId(req),
      authContext: req.authContext
    });
    return true;
  } catch (error) {
    res.status(error.statusCode || 403).json({
      error: error.code || ACCESS_CODES.FORBIDDEN,
      message: error.message,
      reason: error.reason || null
    });
    return false;
  }
}

async function conversationsPrivacyContext(req) {
  const supportRequest = readConversationsSupportRequest(req);
  const authContext = await withConversationsSupportCapability(req.authContext);
  return {
    authContext,
    supportRequest,
    listScope: resolveConversationsListScope(authContext, supportRequest)
  };
}

function conversationsSupportOptions(supportRequest) {
  return {
    supportUserId: supportRequest.supportUserId,
    conversationsSupport: supportRequest.conversationsSupport,
    supportModeActive: supportRequest.supportModeActive
  };
}

router.get("/access", operationalControlPlaneEmpty(() => ({
  allowed: false,
  organizationId: null,
  reason: "CONTROL_PLANE_NO_TENANT",
  code: "CONTROL_PLANE_NO_TENANT",
  featureEnabled: false,
  globalEnabled: true
})), async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const result = await resolveConversationsCenterAccessAsync({
      userId: req.atlasUser?.id,
      organizationId,
      authContext: req.authContext
    });
    const privacyAuth = await withConversationsSupportCapability(req.authContext);
    res.json({
      allowed: result.allowed === true,
      organizationId,
      reason: result.reason || null,
      code: result.code || null,
      featureEnabled: result.feature?.enabled === true,
      globalEnabled: result.feature?.global?.enabled !== false,
      canUseConversationsSupportAccess: canUseConversationsSupportAccess(privacyAuth),
      supportModeActive: Boolean(req.supportContext?.organizationId)
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error: error.code || "CONVERSATIONS_CENTER_ACCESS_FAILED",
      message: "Failed to resolve Conversations Center access"
    });
  }
});

router.get("/attention-count", operationalControlPlaneEmpty(() => ({
  needsAttentionCount: 0,
  generatedAt: new Date().toISOString()
})), async (req, res) => {
  if (!(await requireConversationsAccess(req, res))) {
    return;
  }

  try {
    const organizationId = getTenantOrganizationId(req);
    const { authContext, supportRequest } = await conversationsPrivacyContext(req);
    const payload = await getConversationsAttentionCount(
      organizationId,
      undefined,
      authContext,
      req.query.workspaceScope,
      conversationsSupportOptions(supportRequest)
    );
    res.json(payload);
  } catch (error) {
    console.error("[conversations-center] attention-count", error.message);
    res.status(error.statusCode || 500).json({
      error: error.code || "CONVERSATIONS_CENTER_FAILED",
      message: "Failed to load attention count"
    });
  }
});

router.get("/", operationalControlPlaneEmpty(emptyConversations), async (req, res) => {
  if (!(await requireConversationsAccess(req, res))) {
    return;
  }

  try {
    const organizationId = getTenantOrganizationId(req);
    const { authContext, supportRequest } = await conversationsPrivacyContext(req);
    const payload = await buildConversationsCenterReadModel({
      organizationId,
      filter: req.query.filter,
      search: req.query.q,
      view: req.query.view,
      authContext,
      workspaceScope: req.query.workspaceScope,
      ...conversationsSupportOptions(supportRequest)
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

async function loadScopedProspect(phone, organizationId, authContext = null, supportOptions = {}) {
  if (!phone || !organizationId) {
    return null;
  }

  const prospect = await findProspectInOrganization(phone, organizationId);

  if (!prospect) {
    return null;
  }

  if (authContext) {
    if (
      !isProspectInConversationsUserScope(
        prospect,
        organizationId,
        authContext,
        supportOptions
      )
    ) {
      return null;
    }
  } else if (!isProspectInConversationsTenantScope(prospect, organizationId)) {
    return null;
  }

  const {
    isSuspectedMetaLeadReview,
    isOwnerOfProspect
  } = require("../core/metaLeadReview");
  if (
    isSuspectedMetaLeadReview(prospect) &&
    !isOwnerOfProspect(prospect, authContext?.userId)
  ) {
    return null;
  }

  return prospect;
}

async function loadRequestScopedProspect(req, phone) {
  const organizationId = getTenantOrganizationId(req);
  const { authContext, supportRequest } = await conversationsPrivacyContext(req);
  return loadScopedProspect(
    phone,
    organizationId,
    authContext,
    conversationsSupportOptions(supportRequest)
  );
}

async function listConversationsSupportTargets(organizationId) {
  const { supabase } = require("../services/supabaseService");
  const { data, error } = await supabase
    .from("atlas_users")
    .select("id, email, first_name, last_name, display_name, role, status")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .order("first_name", { ascending: true })
    .limit(200);

  if (error) {
    if (error.code === "42P01") {
      return [];
    }
    throw error;
  }

  return (data || []).map((user) => ({
    id: user.id,
    email: user.email || null,
    role: user.role || null,
    name:
      user.display_name ||
      [user.first_name, user.last_name].filter(Boolean).join(" ") ||
      user.email ||
      user.id
  }));
}

async function requireConversationsSupportAccess(req, res) {
  if (!(await requireConversationsAccess(req, res))) {
    return null;
  }

  const { authContext, supportRequest, listScope } = await conversationsPrivacyContext(req);
  if (!canUseConversationsSupportAccess(authContext)) {
    res.status(403).json({
      error: "CONVERSATIONS_SUPPORT_FORBIDDEN",
      message: "Conversations Support Mode requires Super Admin or explicit support permission"
    });
    return null;
  }

  return { authContext, supportRequest, listScope };
}

router.get("/support-targets", operationalControlPlaneEmpty(() => ({
  items: [],
  supportModeActive: false
})), async (req, res) => {
  const privacy = await requireConversationsSupportAccess(req, res);
  if (!privacy) {
    return;
  }

  try {
    const organizationId = getTenantOrganizationId(req);
    const items = await listConversationsSupportTargets(organizationId);
    res.json({
      items,
      supportModeActive: privacy.supportRequest.supportModeActive,
      canUseConversationsSupportAccess: true
    });
  } catch (error) {
    console.error("[conversations-center] support-targets", error.message);
    res.status(error.statusCode || 500).json({
      error: "CONVERSATIONS_SUPPORT_TARGETS_FAILED",
      message: "Failed to load support conversation targets"
    });
  }
});

router.post("/support-access", operationalControlPlaneEmpty(() => ({
  ok: false,
  reason: "CONTROL_PLANE_NO_TENANT"
})), async (req, res) => {
  const privacy = await requireConversationsSupportAccess(req, res);
  if (!privacy) {
    return;
  }

  const supportUserId = privacy.supportRequest.supportUserId;
  if (!supportUserId) {
    return res.status(400).json({
      error: "SUPPORT_USER_REQUIRED",
      message: "Select a target user before opening Support Mode conversations"
    });
  }

  if (!privacy.listScope?.supportAccess) {
    return res.status(403).json({
      error: "CONVERSATIONS_SUPPORT_CONTEXT_REQUIRED",
      message: "Support Mode conversations require explicit support context and a target user"
    });
  }

  await auditFromRequest(req, {
    action: "conversations.support_access",
    targetType: "user",
    targetId: supportUserId,
    metadata: {
      supportMode: true,
      supportTargetUserId: supportUserId,
      supportOrganizationId: getTenantOrganizationId(req),
      surface: "conversations"
    }
  });

  res.json({
    ok: true,
    supportAccess: true,
    supportTargetUserId: supportUserId,
    workspaceScope: "support"
  });
});

async function humanReplyHandler(req, res) {
  if (!(await requireConversationsAccess(req, res))) {
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
      organizationId,
      authContext: req.authContext,
      accessAlreadyAsserted: true
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
  if (!(await requireConversationsAccess(req, res))) {
    return;
  }

  try {
    const organizationId = getTenantOrganizationId(req);
    const phone = req.body?.phone || req.params.phone;
    const prospect = await loadRequestScopedProspect(req, phone);

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
  if (!(await requireConversationsAccess(req, res))) {
    return;
  }

  try {
    const organizationId = getTenantOrganizationId(req);
    const phone = req.body?.phone || req.params.phone;
    const prospect = await loadRequestScopedProspect(req, phone);

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

    const {
      resumeConversationAfterReturnToAtlas
    } = require("../core/conversationsCenter/returnToAtlasResumeService");

    logWhatsAppStage("return_to_atlas_resume_scheduled", {
      phone: prospect.phone,
      organizationId: prospect.organization_id || organizationId || null,
      returnedToAtlasAt: result.next.returnedToAtlasAt || null
    });

    setImmediate(() => {
      resumeConversationAfterReturnToAtlas({
        phone: prospect.phone,
        prospect,
        organizationId: prospect.organization_id || organizationId || null,
        previousWorkflow: result.previous,
        returnedToAtlasAt: result.next.returnedToAtlasAt
      }).catch((resumeError) => {
        logWhatsAppStage("return_to_atlas_resume_failed", {
          level: "error",
          phone: prospect.phone,
          reason: "UNHANDLED_RESUME_EXCEPTION",
          error: resumeError.message
        });
        console.error(
          "[conversations-center] return-to-atlas-resume",
          resumeError.message
        );
      });
    });

    res.json({
      success: true,
      action: "RETURN_TO_ATLAS",
      phone: prospect.phone,
      ownershipState: result.ownershipState,
      handoffReason: null,
      resume: { scheduled: true },
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
  if (!(await requireConversationsAccess(req, res))) {
    return;
  }

  try {
    const organizationId = getTenantOrganizationId(req);
    const phone = req.body?.phone || req.params.phone;
    const prospect = await loadRequestScopedProspect(req, phone);

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

async function metaLeadReviewAction(req, res, actionName) {
  if (!(await requireConversationsAccess(req, res))) {
    return;
  }

  try {
    const organizationId = getTenantOrganizationId(req);
    const phone = req.body?.phone || req.params.phone;
    const prospect = await loadRequestScopedProspect(req, phone);
    if (!prospect) {
      return res.status(404).json({
        error: "CONVERSATION_NOT_FOUND",
        message: "Conversation not found in Conversations Center scope"
      });
    }

    const {
      confirmMetaLead,
      dismissMetaLeadAsPersonal
    } = require("../core/metaLeadReview");
    const result =
      actionName === "CONFIRM_META_LEAD"
        ? await confirmMetaLead({
            prospect,
            organizationId: prospect.organization_id || organizationId,
            authContext: req.authContext,
            connectionId: req.body?.connectionId || null,
            phoneNumberId: req.body?.phoneNumberId || null
          })
        : await dismissMetaLeadAsPersonal({
            prospect,
            organizationId: prospect.organization_id || organizationId,
            authContext: req.authContext
          });

    if (!result.ok) {
      return res.status(result.status || 409).json({
        error: `CONVERSATIONS_CENTER_${actionName}_DENIED`,
        reason: result.reason,
        message:
          result.reason === "OWNER_ONLY"
            ? "Only the connection owner can review this suspected Meta lead"
            : "This conversation is not eligible for Meta lead review"
      });
    }

    const {
      buildConversationListItem
    } = require("../core/conversationsCenter/conversationsCenterReadModel");
    const refreshed = await findProspectInOrganization(
      prospect.phone,
      prospect.organization_id || organizationId
    );

    res.json({
      success: true,
      action: actionName,
      phone: prospect.phone,
      atlasEligibilitySource: result.source || null,
      alreadyResolved: Boolean(result.alreadyResolved),
      conversation: await buildConversationListItem(refreshed || prospect)
    });
  } catch (error) {
    console.error(`[conversations-center] ${actionName}`, error.message);
    res.status(500).json({
      error: `CONVERSATIONS_CENTER_${actionName}_FAILED`,
      message: `Failed to ${String(actionName).toLowerCase().replace(/_/g, " ")}`
    });
  }
}

router.post("/confirm-meta-lead", (req, res) =>
  metaLeadReviewAction(req, res, "CONFIRM_META_LEAD")
);
router.post("/mark-not-lead", (req, res) =>
  metaLeadReviewAction(req, res, "MARK_NOT_LEAD")
);

/**
 * Messaging unread only. Must not acknowledge BR-080, mutate ownership,
 * or change inbox lifecycle.
 */
router.post("/mark-read", async (req, res) => {
  if (!(await requireConversationsAccess(req, res))) {
    return;
  }

  try {
    const organizationId = getTenantOrganizationId(req);
    const phone = req.body?.phone || req.params.phone;
    const prospect = await loadRequestScopedProspect(req, phone);

    if (!prospect) {
      return res.status(404).json({
        error: "CONVERSATION_NOT_FOUND",
        message: "Conversation not found in Conversations Center scope"
      });
    }

    const result = await markConversationRead({
      phone: prospect.phone,
      organizationId: prospect.organization_id || organizationId || null,
      prospectId: prospect.id || null,
      lastReadInboundAt: req.body?.lastReadInboundAt || null,
      lastSeenInboundMessageId: req.body?.lastSeenInboundMessageId || null
    });

    const {
      buildConversationListItem
    } = require("../core/conversationsCenter/conversationsCenterReadModel");

    res.json({
      success: true,
      action: "MARK_READ",
      phone: prospect.phone,
      lastReadInboundAt: result.lastReadInboundAt,
      lastSeenInboundMessageId: result.lastSeenInboundMessageId,
      ownershipUnchanged: result.ownershipUnchanged,
      conversation: await buildConversationListItem(prospect),
      workflow: {
        workflowOwnership: result.next.workflowOwnership,
        needsHumanAttention: Boolean(result.next.needsHumanAttention),
        manualAgentOwnership: Boolean(result.next.manualAgentOwnership),
        humanTakenOverAt: result.next.humanTakenOverAt || null,
        stalledAt: result.next.stalledAt || null,
        stallEpisodeKey: result.next.stallEpisodeKey || null
      }
    });
  } catch (error) {
    console.error("[conversations-center] mark-read", error.message);
    res.status(error.statusCode || 500).json({
      error: error.code || "CONVERSATIONS_CENTER_MARK_READ_FAILED",
      message: "Failed to mark conversation read"
    });
  }
});

router.get("/:phone", async (req, res) => {
  if (!(await requireConversationsAccess(req, res))) {
    return;
  }

  try {
    const organizationId = getTenantOrganizationId(req);
    const { listScope } = await conversationsPrivacyContext(req);
    const prospect = await loadRequestScopedProspect(req, req.params.phone);

    if (!prospect) {
      return res.status(404).json({
        error: "CONVERSATION_NOT_FOUND",
        message: "Conversation not found in Conversations Center scope"
      });
    }

    if (shouldAuditConversationsSupportAccess(listScope)) {
      await auditFromRequest(req, {
        action: "conversations.support_read",
        targetType: "conversation",
        targetId: prospect.id || prospect.phone,
        metadata: {
          supportMode: true,
          supportTargetUserId: listScope.supportTargetUserId,
          phone: prospect.phone || null,
          surface: "detail"
        }
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
