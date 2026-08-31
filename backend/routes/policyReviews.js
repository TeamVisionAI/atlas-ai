/**
 * BR-186 — IUL / Policy Review Pipeline routes.
 * Personal queue by default. Team scope only when hierarchy already allows it.
 */

const express = require("express");
const { requireAtlasUser } = require("../middleware/requireAtlasUser");
const { organizationGuard } = require("../middleware/organizationGuard");
const { getTenantOrganizationId } = require("../services/tenantContextService");
const {
  operationalControlPlaneEmpty,
  emptyPolicyReviews,
  emptyPolicyReviewDetail
} = require("../core/operationalControlPlane");
const policyReviewPipelineApplicationService = require("../application/policyReviewPipelineApplicationService");

const router = express.Router();

router.use(requireAtlasUser);
router.use(organizationGuard());

function actorContext(req) {
  return {
    ...req.authContext,
    userId: req.tenantContext?.userId || req.authContext?.userId,
    organizationId: getTenantOrganizationId(req),
    role: req.authContext?.role,
    hierarchyMode: req.authContext?.hierarchyMode,
    hierarchyUserIds: req.authContext?.hierarchyUserIds
  };
}

function sendError(res, error) {
  return res.status(error.statusCode || 500).json({
    error: error.publicCode || error.code || "POLICY_REVIEW_FAILED",
    message: error.message
  });
}

router.get("/", operationalControlPlaneEmpty(emptyPolicyReviews), async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const payload = await policyReviewPipelineApplicationService.listPolicyReviews({
      organizationId,
      authContext: actorContext(req),
      scope: req.query.scope,
      search: req.query.q,
      stage: req.query.stage,
      clientId: req.query.clientId,
      ownerUserId: req.query.ownerUserId
    });
    res.json(payload);
  } catch (error) {
    console.error("[policy-reviews]", error.message);
    sendError(res, error);
  }
});

router.get(
  "/commission-defaults",
  operationalControlPlaneEmpty(() => ({ controlPlane: true, organizationId: null, org: null, user: null })),
  async (req, res) => {
    try {
      const organizationId = getTenantOrganizationId(req);
      const payload = await policyReviewPipelineApplicationService.getCommissionDefaults({
        organizationId,
        authContext: actorContext(req),
        userId: req.query.userId
      });
      res.json(payload);
    } catch (error) {
      sendError(res, error);
    }
  }
);

router.put(
  "/commission-defaults",
  operationalControlPlaneEmpty(() => ({ controlPlane: true, organizationId: null, org: null, user: null })),
  async (req, res) => {
    try {
      const organizationId = getTenantOrganizationId(req);
      const record = await policyReviewPipelineApplicationService.saveCommissionDefaults(
        { ...(req.body || {}), organizationId },
        actorContext(req)
      );
      res.json({ success: true, record });
    } catch (error) {
      sendError(res, error);
    }
  }
);

router.post("/", operationalControlPlaneEmpty(emptyPolicyReviews), async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const record = await policyReviewPipelineApplicationService.createPolicyReview(
      { ...(req.body || {}), organizationId },
      actorContext(req)
    );
    res.status(201).json({ success: true, record });
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/:id", operationalControlPlaneEmpty(emptyPolicyReviewDetail), async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const record = await policyReviewPipelineApplicationService.getPolicyReview(req.params.id, {
      organizationId,
      authContext: actorContext(req)
    });
    res.json(record);
  } catch (error) {
    sendError(res, error);
  }
});

router.patch("/:id", operationalControlPlaneEmpty(emptyPolicyReviewDetail), async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const record = await policyReviewPipelineApplicationService.updatePolicyReview(
      req.params.id,
      { ...(req.body || {}), organizationId },
      actorContext(req)
    );
    res.json({ success: true, record });
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/:id/stage", operationalControlPlaneEmpty(emptyPolicyReviewDetail), async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const record = await policyReviewPipelineApplicationService.transitionStage(
      req.params.id,
      { ...(req.body || {}), organizationId },
      actorContext(req)
    );
    res.json({ success: true, record });
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/:id/complete", operationalControlPlaneEmpty(emptyPolicyReviewDetail), async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const record = await policyReviewPipelineApplicationService.completeReview(
      req.params.id,
      { ...(req.body || {}), organizationId },
      actorContext(req)
    );
    res.json({ success: true, record });
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/:id/outcome", operationalControlPlaneEmpty(emptyPolicyReviewDetail), async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const record = await policyReviewPipelineApplicationService.recordOutcome(
      req.params.id,
      { ...(req.body || {}), organizationId },
      actorContext(req)
    );
    res.json({ success: true, record });
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/:id/appointment", operationalControlPlaneEmpty(emptyPolicyReviewDetail), async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const record = await policyReviewPipelineApplicationService.linkAppointment(
      req.params.id,
      { ...(req.body || {}), organizationId },
      actorContext(req)
    );
    res.json({ success: true, record });
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/:id/documents", operationalControlPlaneEmpty(emptyPolicyReviewDetail), async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const record = await policyReviewPipelineApplicationService.requestDocuments(
      req.params.id,
      { ...(req.body || {}), organizationId },
      actorContext(req)
    );
    res.json({ success: true, record });
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/:id/documents/received", operationalControlPlaneEmpty(emptyPolicyReviewDetail), async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const record = await policyReviewPipelineApplicationService.markDocumentsReceived(
      req.params.id,
      { ...(req.body || {}), organizationId },
      actorContext(req)
    );
    res.json({ success: true, record });
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/:id/application", operationalControlPlaneEmpty(emptyPolicyReviewDetail), async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const record = await policyReviewPipelineApplicationService.submitApplication(
      req.params.id,
      { ...(req.body || {}), organizationId },
      actorContext(req)
    );
    res.json({ success: true, record });
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/:id/placed", operationalControlPlaneEmpty(emptyPolicyReviewDetail), async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const record = await policyReviewPipelineApplicationService.markPlaced(
      req.params.id,
      { ...(req.body || {}), organizationId },
      actorContext(req)
    );
    res.json({ success: true, record });
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/:id/follow-up", operationalControlPlaneEmpty(emptyPolicyReviewDetail), async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const result = await policyReviewPipelineApplicationService.createClientFollowUp(
      req.params.id,
      { ...(req.body || {}), organizationId },
      actorContext(req)
    );
    res.status(201).json(result);
  } catch (error) {
    sendError(res, error);
  }
});

module.exports = router;
