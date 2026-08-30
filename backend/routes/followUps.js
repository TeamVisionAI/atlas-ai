/**
 * BR-178 — Follow-up Engine V2 routes.
 * Personal queue by default. Team scope only when hierarchy already allows it.
 */

const express = require("express");
const { requireAtlasUser } = require("../middleware/requireAtlasUser");
const { organizationGuard } = require("../middleware/organizationGuard");
const { getTenantOrganizationId } = require("../services/tenantContextService");
const {
  operationalControlPlaneEmpty,
  emptyFollowUps
} = require("../core/operationalControlPlane");
const followUpApplicationService = require("../application/followUpApplicationService");

const router = express.Router();

router.use(requireAtlasUser);
router.use(organizationGuard());

function actorContext(req) {
  return {
    userId: req.tenantContext?.userId || req.authContext?.userId,
    organizationId: getTenantOrganizationId(req),
    role: req.authContext?.role,
    hierarchyMode: req.authContext?.hierarchyMode,
    hierarchyUserIds: req.authContext?.hierarchyUserIds
  };
}

function sendError(res, error) {
  return res.status(error.statusCode || 500).json({
    error: error.publicCode || error.code || "FOLLOW_UP_FAILED",
    message: error.message
  });
}

router.get("/", operationalControlPlaneEmpty(emptyFollowUps), async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const payload = await followUpApplicationService.listFollowUps({
      organizationId,
      authContext: actorContext(req),
      filter: req.query.filter,
      search: req.query.q,
      sort: req.query.sort,
      scope: req.query.scope
    });
    res.json(payload);
  } catch (error) {
    console.error("[follow-ups]", error.message);
    sendError(res, error);
  }
});

router.post("/", operationalControlPlaneEmpty(emptyFollowUps), async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const result = await followUpApplicationService.createManualFollowUp(
      { ...(req.body || {}), organizationId },
      actorContext(req)
    );
    res.status(result.created ? 201 : 200).json({ success: true, ...result });
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/:id/complete", operationalControlPlaneEmpty(emptyFollowUps), async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const followUp = await followUpApplicationService.completeFollowUp(
      req.params.id,
      { ...(req.body || {}), organizationId },
      actorContext(req)
    );
    res.json({ success: true, followUp });
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/:id/reschedule", operationalControlPlaneEmpty(emptyFollowUps), async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const followUp = await followUpApplicationService.rescheduleFollowUp(
      req.params.id,
      { ...(req.body || {}), organizationId },
      actorContext(req)
    );
    res.json({ success: true, followUp });
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/:id/cancel", operationalControlPlaneEmpty(emptyFollowUps), async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const followUp = await followUpApplicationService.cancelFollowUp(
      req.params.id,
      { ...(req.body || {}), organizationId },
      actorContext(req)
    );
    res.json({ success: true, followUp });
  } catch (error) {
    sendError(res, error);
  }
});

module.exports = router;
