/**
 * BR-074 — Securities access probe and admin authorization workflow routes.
 */

const express = require("express");
const { requireAtlasUser } = require("../middleware/requireAtlasUser");
const { requirePermission } = require("../middleware/requirePermission");
const { requireSecuritiesContentAccess } = require("../middleware/requireSecuritiesContentAccess");
const { PERMISSIONS } = require("../security/permissions");
const {
  canVerifySecuritiesAuthorization,
  getAdminSecuritiesSummary,
  upsertSecuritiesAuthorization,
  revokeSecuritiesAuthorization
} = require("../security/securitiesAccessService");
const { resolveWorkspaceOrganizationId } = require("../core/tenantOrganization");

const router = express.Router();

function auditMeta(req) {
  return {
    ipAddress: req.ip,
    userAgent: req.get("user-agent")
  };
}

/** Minimal protected resource proving fail-closed backend enforcement (no fund data). */
router.get(
  "/probe",
  requireAtlasUser,
  requireSecuritiesContentAccess({ resource: "securities.probe" }),
  (req, res) => {
    res.json({
      ok: true,
      resource: "securities.probe",
      message: "Securities content access authorized.",
      // Intentionally no fund names, tickers, or SB-72 payload.
      payload: {
        access: "authorized",
        contentType: "probe"
      }
    });
  }
);

router.get("/capabilities", requireAtlasUser, async (req, res) => {
  try {
    const canVerify = await canVerifySecuritiesAuthorization(req.authContext);
    res.json({
      canVerifySecuritiesAuthorization: canVerify
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error: error.publicCode || "CAPABILITIES_FAILED",
      message: error.message
    });
  }
});

router.get(
  "/users/:userId",
  requireAtlasUser,
  requirePermission(PERMISSIONS.ADMIN_USERS),
  async (req, res) => {
    try {
      const organizationId = await resolveWorkspaceOrganizationId(req.authContext);
      const summary = await getAdminSecuritiesSummary(organizationId, req.params.userId);
      const canVerify = await canVerifySecuritiesAuthorization(req.authContext);
      res.json({
        securities_access: summary,
        canVerifySecuritiesAuthorization: canVerify
      });
    } catch (error) {
      res.status(error.statusCode || 500).json({
        error: error.publicCode || "SECURITIES_READ_FAILED",
        message: error.message
      });
    }
  }
);

router.put(
  "/users/:userId",
  requireAtlasUser,
  requirePermission(PERMISSIONS.ADMIN_USERS),
  async (req, res) => {
    try {
      // Explicit securities:verify is enforced inside the service (not admin wildcard).
      const summary = await upsertSecuritiesAuthorization(
        req.params.userId,
        req.body || {},
        req.authContext,
        auditMeta(req)
      );
      res.json({ securities_access: summary });
    } catch (error) {
      res.status(error.statusCode || 500).json({
        error: error.publicCode || "SECURITIES_UPDATE_FAILED",
        message: error.message
      });
    }
  }
);

router.post(
  "/users/:userId/revoke",
  requireAtlasUser,
  requirePermission(PERMISSIONS.ADMIN_USERS),
  async (req, res) => {
    try {
      const summary = await revokeSecuritiesAuthorization(
        req.params.userId,
        req.authContext,
        auditMeta(req),
        req.body?.reason || null
      );
      res.json({ securities_access: summary });
    } catch (error) {
      res.status(error.statusCode || 500).json({
        error: error.publicCode || "SECURITIES_REVOKE_FAILED",
        message: error.message
      });
    }
  }
);

module.exports = router;
