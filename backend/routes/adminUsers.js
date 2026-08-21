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

module.exports = router;
