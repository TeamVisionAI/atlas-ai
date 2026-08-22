/**
 * BR-147 — Campaign Intake Codes API.
 * Mount: /api/campaign-intake-codes
 */

const express = require("express");
const { requireAtlasUser } = require("../middleware/requireAtlasUser");
const { organizationGuard } = require("../middleware/organizationGuard");
const { getTenantOrganizationId } = require("../services/tenantContextService");
const {
  createCampaignIntakeCodeManagerService,
  REASON
} = require("../core/campaignIntakeCode/campaignIntakeCodeManagerService");

const router = express.Router();

router.use(requireAtlasUser);
router.use(organizationGuard());

function buildManager() {
  return createCampaignIntakeCodeManagerService();
}

function authBundle(req) {
  return {
    ...req.authContext,
    organizationId: getTenantOrganizationId(req),
    user: req.atlasUser || req.user || null
  };
}

function sendError(res, result) {
  const status =
    result.status ||
    (result.reason === REASON.NOT_FOUND
      ? 404
      : result.reason === REASON.FORBIDDEN
        ? 403
        : 400);
  return res.status(status).json({
    error: result.reason || "CAMPAIGN_INTAKE_CODE_ERROR",
    message: result.message || null
  });
}

router.get("/", async (req, res) => {
  try {
    const result = await buildManager().listCodes(authBundle(req));
    if (!result.ok) return sendError(res, result);
    return res.json({
      codes: result.codes,
      canManageAll: result.canManageAll
    });
  } catch (error) {
    return res.status(500).json({
      error: "CAMPAIGN_INTAKE_CODE_LIST_FAILED",
      message: error.message
    });
  }
});

router.post("/", async (req, res) => {
  try {
    const result = await buildManager().createCode(authBundle(req), req.body || {});
    if (!result.ok) return sendError(res, result);
    return res.status(201).json({
      code: result.code,
      prefilledMessage: result.prefilledMessage,
      displayPhoneNumber: result.displayPhoneNumber
    });
  } catch (error) {
    return res.status(500).json({
      error: "CAMPAIGN_INTAKE_CODE_CREATE_FAILED",
      message: error.message
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const result = await buildManager().getCode(authBundle(req), req.params.id);
    if (!result.ok) return sendError(res, result);
    return res.json({ code: result.code });
  } catch (error) {
    return res.status(500).json({
      error: "CAMPAIGN_INTAKE_CODE_GET_FAILED",
      message: error.message
    });
  }
});

router.post("/:id/pause", async (req, res) => {
  try {
    const result = await buildManager().pauseCode(authBundle(req), req.params.id);
    if (!result.ok) return sendError(res, result);
    return res.json({ code: result.code });
  } catch (error) {
    return res.status(500).json({
      error: "CAMPAIGN_INTAKE_CODE_PAUSE_FAILED",
      message: error.message
    });
  }
});

router.post("/:id/reactivate", async (req, res) => {
  try {
    const result = await buildManager().reactivateCode(authBundle(req), req.params.id);
    if (!result.ok) return sendError(res, result);
    return res.json({ code: result.code });
  } catch (error) {
    return res.status(500).json({
      error: "CAMPAIGN_INTAKE_CODE_REACTIVATE_FAILED",
      message: error.message
    });
  }
});

router.post("/:id/retire", async (req, res) => {
  try {
    const result = await buildManager().retireCode(authBundle(req), req.params.id);
    if (!result.ok) return sendError(res, result);
    return res.json({ code: result.code });
  } catch (error) {
    return res.status(500).json({
      error: "CAMPAIGN_INTAKE_CODE_RETIRE_FAILED",
      message: error.message
    });
  }
});

module.exports = router;
