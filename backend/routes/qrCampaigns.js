/**
 * Authenticated QR Campaign Manager API (Phase A).
 * Mount: /api/qr-campaigns
 */

const express = require("express");
const { requireAtlasUser } = require("../middleware/requireAtlasUser");
const { organizationGuard } = require("../middleware/organizationGuard");
const { getTenantOrganizationId } = require("../services/tenantContextService");
const {
  createSupabaseQrChannelRepository
} = require("../core/qrChannel/supabaseQrChannelRepository");
const {
  createQrCampaignManagerService,
  REASON
} = require("../core/qrChannel/qrCampaignManagerService");
const { CAMPAIGN_STATUS } = require("../core/qrChannel/constants");

const router = express.Router();

router.use(requireAtlasUser);
router.use(organizationGuard());

function buildManager(req) {
  const repository = createSupabaseQrChannelRepository();
  return createQrCampaignManagerService({
    repository,
    env: process.env
  });
}

function authBundle(req) {
  const organizationId = getTenantOrganizationId(req);
  return {
    ...req.authContext,
    organizationId,
    user: req.atlasUser || req.user || null
  };
}

function sendError(res, result) {
  const status = result.status || (result.reason === REASON.NOT_FOUND ? 404 : 400);
  return res.status(status).json({
    error: result.reason || "QR_CAMPAIGN_ERROR",
    message: result.message || null
  });
}

router.get("/meta", async (req, res) => {
  try {
    const manager = buildManager(req);
    const auth = authBundle(req);
    const gate = manager.featureGate(auth.organizationId);
    const candidates = await manager.listOwnerCandidates(auth);
    if (!candidates.ok) {
      return sendError(res, candidates);
    }
    return res.json({
      enabled: gate.allowed,
      reason: gate.allowed ? null : gate.reason,
      canCreateForOthers: candidates.canCreateForOthers,
      candidates: candidates.candidates,
      campaignTypes: require("../core/qrChannel/qrCampaignTypes").CAMPAIGN_TYPES
    });
  } catch (error) {
    return res.status(500).json({
      error: "QR_CAMPAIGN_META_FAILED",
      message: error.message
    });
  }
});

router.get("/", async (req, res) => {
  try {
    const manager = buildManager(req);
    const result = await manager.listCampaigns(authBundle(req));
    if (!result.ok) return sendError(res, result);
    return res.json({
      campaigns: result.campaigns,
      campaignTypes: result.campaignTypes,
      canCreateForOthers: result.canCreateForOthers
    });
  } catch (error) {
    return res.status(500).json({
      error: "QR_CAMPAIGN_LIST_FAILED",
      message: error.message
    });
  }
});

router.post("/", async (req, res) => {
  try {
    const manager = buildManager(req);
    const result = await manager.createCampaign(authBundle(req), {
      name: req.body?.name,
      description: req.body?.description,
      campaignType: req.body?.campaignType,
      ownerUserId: req.body?.ownerUserId
    });
    if (!result.ok) return sendError(res, result);
    return res.status(201).json({
      campaign: result.campaign,
      publicUrl: result.publicUrl,
      previewAvailable: result.previewAvailable
    });
  } catch (error) {
    return res.status(500).json({
      error: "QR_CAMPAIGN_CREATE_FAILED",
      message: error.message
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const manager = buildManager(req);
    const result = await manager.getCampaign(authBundle(req), req.params.id);
    if (!result.ok) return sendError(res, result);
    return res.json({ campaign: result.campaign });
  } catch (error) {
    return res.status(500).json({
      error: "QR_CAMPAIGN_GET_FAILED",
      message: error.message
    });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const manager = buildManager(req);
    const result = await manager.patchCampaign(authBundle(req), req.params.id, {
      name: req.body?.name,
      description: req.body?.description
    });
    if (!result.ok) return sendError(res, result);
    return res.json({ campaign: result.campaign });
  } catch (error) {
    return res.status(500).json({
      error: "QR_CAMPAIGN_PATCH_FAILED",
      message: error.message
    });
  }
});

router.post("/:id/activate", async (req, res) => {
  try {
    const manager = buildManager(req);
    const result = await manager.setCampaignStatus(
      authBundle(req),
      req.params.id,
      CAMPAIGN_STATUS.ACTIVE
    );
    if (!result.ok) return sendError(res, result);
    return res.json({ campaign: result.campaign });
  } catch (error) {
    return res.status(500).json({
      error: "QR_CAMPAIGN_ACTIVATE_FAILED",
      message: error.message
    });
  }
});

router.post("/:id/deactivate", async (req, res) => {
  try {
    const manager = buildManager(req);
    const result = await manager.setCampaignStatus(
      authBundle(req),
      req.params.id,
      CAMPAIGN_STATUS.INACTIVE
    );
    if (!result.ok) return sendError(res, result);
    return res.json({ campaign: result.campaign });
  } catch (error) {
    return res.status(500).json({
      error: "QR_CAMPAIGN_DEACTIVATE_FAILED",
      message: error.message
    });
  }
});

router.get("/:id/public-url", async (req, res) => {
  try {
    const manager = buildManager(req);
    const result = await manager.getPublicUrl(authBundle(req), req.params.id);
    if (!result.ok) return sendError(res, result);
    return res.json({
      publicUrl: result.publicUrl,
      campaign: result.campaign
    });
  } catch (error) {
    return res.status(500).json({
      error: "QR_CAMPAIGN_PUBLIC_URL_FAILED",
      message: error.message
    });
  }
});

router.get("/:id/qr.png", async (req, res) => {
  try {
    const manager = buildManager(req);
    const result = await manager.getQrPng(authBundle(req), req.params.id);
    if (!result.ok) return sendError(res, result);
    res.setHeader("Content-Type", result.contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="atlas-qr-${req.params.id}.png"`
    );
    return res.send(result.body);
  } catch (error) {
    return res.status(500).json({
      error: "QR_CAMPAIGN_PNG_FAILED",
      message: error.message
    });
  }
});

router.get("/:id/qr.svg", async (req, res) => {
  try {
    const manager = buildManager(req);
    const result = await manager.getQrSvg(authBundle(req), req.params.id);
    if (!result.ok) return sendError(res, result);
    res.setHeader("Content-Type", result.contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="atlas-qr-${req.params.id}.svg"`
    );
    return res.send(result.body);
  } catch (error) {
    return res.status(500).json({
      error: "QR_CAMPAIGN_SVG_FAILED",
      message: error.message
    });
  }
});

module.exports = router;
