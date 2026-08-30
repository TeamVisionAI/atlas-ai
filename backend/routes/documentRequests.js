/**
 * BR-183 — Client document request routes.
 * Personal queue by default. Team scope only when hierarchy already allows it.
 */

const express = require("express");
const { requireAtlasUser } = require("../middleware/requireAtlasUser");
const { organizationGuard } = require("../middleware/organizationGuard");
const { getTenantOrganizationId } = require("../services/tenantContextService");
const {
  operationalControlPlaneEmpty,
  emptyDocumentRequests,
  emptyDocumentRequestDetail
} = require("../core/operationalControlPlane");
const clientDocumentsApplicationService = require("../application/clientDocumentsApplicationService");

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
    error: error.publicCode || error.code || "DOCUMENT_REQUEST_FAILED",
    message: error.message
  });
}

router.get("/", operationalControlPlaneEmpty(emptyDocumentRequests), async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const payload = await clientDocumentsApplicationService.listDocumentRequests({
      organizationId,
      authContext: actorContext(req),
      scope: req.query.scope,
      search: req.query.q,
      status: req.query.status,
      documentType: req.query.documentType || req.query.type,
      clientId: req.query.clientId,
      serviceCaseId: req.query.serviceCaseId,
      ownerUserId: req.query.ownerUserId,
      due: req.query.due
    });
    res.json(payload);
  } catch (error) {
    console.error("[document-requests]", error.message);
    sendError(res, error);
  }
});

router.post("/", operationalControlPlaneEmpty(emptyDocumentRequests), async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const record = await clientDocumentsApplicationService.createDocumentRequest(
      { ...(req.body || {}), organizationId },
      actorContext(req)
    );
    res.status(201).json({ success: true, record });
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/:id", operationalControlPlaneEmpty(emptyDocumentRequestDetail), async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const record = await clientDocumentsApplicationService.getDocumentRequest(req.params.id, {
      organizationId,
      authContext: actorContext(req)
    });
    res.json(record);
  } catch (error) {
    sendError(res, error);
  }
});

router.patch("/:id", operationalControlPlaneEmpty(emptyDocumentRequestDetail), async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const record = await clientDocumentsApplicationService.updateDocumentRequest(
      req.params.id,
      { ...(req.body || {}), organizationId },
      actorContext(req)
    );
    res.json({ success: true, record });
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/:id/status", operationalControlPlaneEmpty(emptyDocumentRequestDetail), async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const record = await clientDocumentsApplicationService.updateRequestStatus(
      req.params.id,
      { ...(req.body || {}), organizationId },
      actorContext(req)
    );
    res.json({ success: true, record });
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/:id/follow-up", operationalControlPlaneEmpty(emptyDocumentRequestDetail), async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const result = await clientDocumentsApplicationService.createRequestFollowUp(
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
