/**
 * BR-183 — Client document metadata and authorized upload/download.
 * Never returns storage keys or public bucket URLs.
 */

const express = require("express");
const { requireAtlasUser } = require("../middleware/requireAtlasUser");
const { organizationGuard } = require("../middleware/organizationGuard");
const { getTenantOrganizationId } = require("../services/tenantContextService");
const {
  operationalControlPlaneEmpty,
  emptyDocuments,
  emptyDocumentDetail
} = require("../core/operationalControlPlane");
const { handleClientDocumentUpload } = require("./clientDocumentUpload");
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
    error: error.publicCode || error.code || "DOCUMENT_FAILED",
    message: error.message
  });
}

router.get("/", operationalControlPlaneEmpty(emptyDocuments), async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const payload = await clientDocumentsApplicationService.listDocuments({
      organizationId,
      authContext: actorContext(req),
      scope: req.query.scope,
      search: req.query.q,
      status: req.query.status,
      documentType: req.query.documentType || req.query.type,
      clientId: req.query.clientId,
      serviceCaseId: req.query.serviceCaseId,
      ownerUserId: req.query.ownerUserId
    });
    res.json(payload);
  } catch (error) {
    console.error("[documents]", error.message);
    sendError(res, error);
  }
});

router.post("/upload", operationalControlPlaneEmpty(emptyDocuments), handleClientDocumentUpload, async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const file = req.file;
    const record = await clientDocumentsApplicationService.uploadDocument(
      {
        organizationId,
        clientId: req.body?.clientId,
        documentType: req.body?.documentType,
        requestId: req.body?.requestId || null,
        serviceCaseId: req.body?.serviceCaseId || null,
        productionId: req.body?.productionId || null,
        notes: req.body?.notes || null,
        originalFilename: file?.originalname,
        mimeType: file?.mimetype,
        buffer: file?.buffer
      },
      actorContext(req)
    );
    res.status(201).json({ success: true, record });
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/:id", operationalControlPlaneEmpty(emptyDocumentDetail), async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const record = await clientDocumentsApplicationService.getDocument(req.params.id, {
      organizationId,
      authContext: actorContext(req)
    });
    res.json(record);
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/:id/download", operationalControlPlaneEmpty(emptyDocumentDetail), async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const file = await clientDocumentsApplicationService.downloadDocument(req.params.id, {
      organizationId,
      authContext: actorContext(req)
    });
    res.setHeader("Content-Type", file.mimeType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${String(file.originalFilename).replace(/"/g, "")}"`
    );
    res.setHeader("Cache-Control", "private, no-store");
    res.send(file.buffer);
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/:id/status", operationalControlPlaneEmpty(emptyDocumentDetail), async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const record = await clientDocumentsApplicationService.updateDocumentStatus(
      req.params.id,
      { ...(req.body || {}), organizationId },
      actorContext(req)
    );
    res.json({ success: true, record });
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/:id/link", operationalControlPlaneEmpty(emptyDocumentDetail), async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const record = await clientDocumentsApplicationService.linkDocumentToRequest(
      req.params.id,
      req.body?.requestId,
      { ...(req.body || {}), organizationId },
      actorContext(req)
    );
    res.json({ success: true, record });
  } catch (error) {
    sendError(res, error);
  }
});

module.exports = router;
