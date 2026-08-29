/**
 * LC1.1 — Administrator user management routes.
 */

const express = require("express");
const router = express.Router();
const { requireAtlasUser } = require("../middleware/requireAtlasUser");
const { requirePermission } = require("../middleware/requirePermission");
const { organizationGuard } = require("../middleware/organizationGuard");
const { PERMISSIONS } = require("../security/permissions");
const { USER_STATUSES } = require("../security/roles");
const identityAdminService = require("../services/identityAdminService");
const { listBusinessRanks } = require("../core/teamVisionBusinessRanks");

router.use(requireAtlasUser);
router.use(organizationGuard());
router.use(requirePermission(PERMISSIONS.ADMIN_USERS));

function auditMeta(req) {
  return {
    ipAddress: req.ip,
    userAgent: req.get("user-agent")
  };
}

router.get("/users/meta/business-ranks", (_req, res) => {
  res.json({ items: listBusinessRanks() });
});

router.get("/users", async (req, res) => {
  try {
    const result = await identityAdminService.listUsers(req.query, req.authContext, req);
    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error: error.publicCode || error.message,
      message: error.message || "Request failed."
    });
  }
});

router.post("/users", async (req, res) => {
  try {
    const result = await identityAdminService.createUser(
      req.body,
      req.authContext,
      auditMeta(req),
      {},
      req
    );
    res.status(201).json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error: error.publicCode || error.message,
      message: error.message || "Request failed."
    });
  }
});

router.get("/users/:id", async (req, res) => {
  try {
    const user = await identityAdminService.getUserById(req.params.id, req.authContext, req);
    res.json({ user });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error: error.publicCode || error.message,
      message: error.message || "Request failed."
    });
  }
});

router.patch("/users/:id", async (req, res) => {
  try {
    const user = await identityAdminService.updateUser(
      req.params.id,
      req.body,
      req.authContext,
      auditMeta(req),
      req
    );
    res.json({ user });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error: error.publicCode || error.message,
      message: error.message || "Request failed."
    });
  }
});

router.patch("/users/:id/email", async (req, res) => {
  try {
    const user = await identityAdminService.changeEmail(
      req.params.id,
      req.body,
      req.authContext,
      auditMeta(req),
      req
    );
    res.json({ user });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error: error.publicCode || error.message,
      message: error.message || "Request failed."
    });
  }
});

router.patch("/users/:id/capabilities", async (req, res) => {
  try {
    const user = await identityAdminService.updateAgentCapabilities(
      req.params.id,
      req.body,
      req.authContext,
      auditMeta(req),
      req
    );
    res.json({ user });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error: error.publicCode || error.message,
      message: error.message || "Request failed."
    });
  }
});

router.post("/users/:id/suspend", async (req, res) => {
  try {
    const user = await identityAdminService.setUserStatus(
      req.params.id,
      USER_STATUSES.SUSPENDED,
      req.authContext,
      auditMeta(req),
      req
    );
    res.json({ user });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error: error.publicCode || error.message,
      message: error.message || "Request failed."
    });
  }
});

router.post("/users/:id/reactivate", async (req, res) => {
  try {
    const user = await identityAdminService.setUserStatus(
      req.params.id,
      USER_STATUSES.ACTIVE,
      req.authContext,
      auditMeta(req),
      req
    );
    res.json({ user });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error: error.publicCode || error.message,
      message: error.message || "Request failed."
    });
  }
});

router.post("/users/:id/archive", async (req, res) => {
  try {
    const user = await identityAdminService.setUserStatus(
      req.params.id,
      USER_STATUSES.ARCHIVED,
      req.authContext,
      auditMeta(req),
      req
    );
    res.json({ user });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error: error.publicCode || error.message,
      message: error.message || "Request failed."
    });
  }
});

router.post("/users/:id/force-password-reset", async (req, res) => {
  try {
    const result = await identityAdminService.forcePasswordReset(
      req.params.id,
      req.authContext,
      auditMeta(req),
      req
    );
    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error: error.publicCode || error.message,
      message: error.message || "Request failed."
    });
  }
});

router.post("/users/:id/force-logout", async (req, res) => {
  try {
    const result = await identityAdminService.forceLogout(
      req.params.id,
      req.authContext,
      auditMeta(req),
      req
    );
    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error: error.publicCode || error.message,
      message: error.message || "Request failed."
    });
  }
});

router.post("/users/:id/resend-invitation", async (req, res) => {
  try {
    const result = await identityAdminService.resendInvitation(
      req.params.id,
      req.authContext,
      auditMeta(req),
      req
    );
    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error: error.publicCode || error.message,
      message: error.message || "Request failed."
    });
  }
});

router.post("/users/:id/revoke-invitation", async (req, res) => {
  try {
    const result = await identityAdminService.revokeInvitation(
      req.params.id,
      req.authContext,
      auditMeta(req),
      req
    );
    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error: error.publicCode || error.message,
      message: error.message || "Request failed."
    });
  }
});

router.post("/users/:id/transfer-ownership", async (req, res) => {
  try {
    const result = await identityAdminService.transferOwnership(
      {
        fromUserId: req.body.fromUserId || req.params.id,
        toUserId: req.body.toUserId
      },
      req.authContext,
      auditMeta(req),
      req
    );
    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error: error.publicCode || error.message,
      message: error.message || "Request failed."
    });
  }
});

router.get("/users/:id/login-history", async (req, res) => {
  try {
    const result = await identityAdminService.getUserLoginHistory(
      req.params.id,
      req.authContext,
      req.query,
      req
    );
    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error: error.publicCode || error.message,
      message: error.message || "Request failed."
    });
  }
});

router.get("/recruit-ai-v2", async (req, res) => {
  try {
    const service = require("../services/recruitAiV2CertificationService");
    const organizationId = req.authContext?.organizationId;
    const status = await service.getTenantV2Status(organizationId);
    return res.json({
      tenant: status.tenant,
      canManageUserGrants: status.canManageUserGrants
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      error: error.publicCode || error.message,
      message: error.message || "Unable to load Recruit AI v2 status."
    });
  }
});

router.get("/users/:id/recruit-ai-v2", async (req, res) => {
  try {
    const service = require("../services/recruitAiV2CertificationService");
    const organizationId = req.authContext?.organizationId;
    await service.assertUserInOrganization(organizationId, req.params.id);
    const grant = await service.getUserGrant(organizationId, req.params.id);
    const status = await service.getTenantV2Status(organizationId);
    return res.json({
      grant,
      tenant: status.tenant,
      canManageUserGrants: status.canManageUserGrants
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      error: error.publicCode || error.message,
      message: error.message || "Unable to load Recruit AI v2 user grant."
    });
  }
});

router.patch("/users/:id/recruit-ai-v2", async (req, res) => {
  try {
    const service = require("../services/recruitAiV2CertificationService");
    const grant = await service.upsertUserGrant({
      organizationId: req.authContext?.organizationId,
      userId: req.params.id,
      authoringEnabled: req.body?.authoringEnabled,
      executionEnabled: req.body?.executionEnabled,
      actor: {
        userId: req.authContext?.userId,
        userEmail: req.authContext?.email
      },
      requireTenantEnabled: true
    });
    return res.json({ grant });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      error: error.publicCode || error.message,
      message: error.message || "Unable to update Recruit AI v2 user grant."
    });
  }
});

module.exports = router;
