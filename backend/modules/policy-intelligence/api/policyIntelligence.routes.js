/**
 * Policy Intelligence HTTP routes — Atlas Extract.
 * Implements BR-051 / BR-052.
 */

const express = require("express");
const { requireAtlasUser } = require("../../../middleware/requireAtlasUser");
const { organizationGuard } = require("../../../middleware/organizationGuard");
const { requirePermission } = require("../../../middleware/requirePermission");
const { PERMISSIONS } = require("../../../security/permissions");
const { getTenantOrganizationId } = require("../../../services/tenantContextService");
const { PolicyIntelligenceService } = require("../application/PolicyIntelligenceService");
const { handlePolicyDocumentUpload, parseStructuredFields } = require("./policyDocumentUpload");

function sendError(res, error) {
  const status = error.statusCode || 500;
  return res.status(status).json({
    error: error.publicCode || "POLICY_INTELLIGENCE_ERROR",
    message: error.message || "Policy Intelligence request failed.",
    ...(error.details ? { details: error.details } : {})
  });
}

function createPolicyIntelligenceRoutes(deps = {}) {
  const router = express.Router();
  const service = deps.service || new PolicyIntelligenceService(deps);

  router.use(requireAtlasUser);
  router.use(organizationGuard());

  router.get("/", requirePermission(PERMISSIONS.POLICY_READ), async (req, res) => {
    try {
      const organizationId = getTenantOrganizationId(req);
      const summary = await service.getModuleSummary({ organizationId });
      res.json(summary);
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get(
    "/language",
    requirePermission(PERMISSIONS.POLICY_READ),
    async (_req, res) => {
      try {
        res.json(service.extraction.getLanguageCatalog());
      } catch (error) {
        sendError(res, error);
      }
    }
  );

  router.get(
    "/documents/:documentId/language",
    requirePermission(PERMISSIONS.POLICY_READ),
    async (req, res) => {
      try {
        const organizationId = getTenantOrganizationId(req);
        const analysis = await service.extraction.getLanguageAnalysisForDocument(
          organizationId,
          req.params.documentId
        );
        res.json(analysis);
      } catch (error) {
        sendError(res, error);
      }
    }
  );

  router.get("/reviews", requirePermission(PERMISSIONS.POLICY_READ), async (req, res) => {
    try {
      const organizationId = getTenantOrganizationId(req);
      const reviews = await service.extraction.listReviews(organizationId);
      res.json({ reviews });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/reviews", requirePermission(PERMISSIONS.POLICY_WRITE), async (req, res) => {
    try {
      const organizationId = getTenantOrganizationId(req);
      const userId = req.authContext?.userId || null;
      const review = await service.ingestion.createReview({
        organizationId,
        userId,
        title: req.body?.title,
        // CRM-owned linkage — persisted internally only; never returned on review DTO (BR-056).
        prospectId: req.body?.prospectId || null,
        // Plaintext policy numbers belong to CRM; only a hash is stored if provided.
        policyNumber: req.body?.policyNumber || null,
        summary: req.body?.summary || null
      });
      res.status(201).json({ review });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/reviews/:reviewId", requirePermission(PERMISSIONS.POLICY_READ), async (req, res) => {
    try {
      const organizationId = getTenantOrganizationId(req);
      const bundle = await service.extraction.getReviewBundle(organizationId, req.params.reviewId);
      res.json(bundle);
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post(
    "/reviews/:reviewId/documents",
    requirePermission(PERMISSIONS.POLICY_WRITE),
    handlePolicyDocumentUpload,
    async (req, res) => {
      try {
        const organizationId = getTenantOrganizationId(req);
        const userId = req.authContext?.userId || null;
        const structuredFields = parseStructuredFields(
          req.body?.structuredFields ?? req.body?.extraction
        );

        const result = await service.ingestion.ingestDocument({
          organizationId,
          userId,
          reviewId: req.params.reviewId,
          file: req.file,
          structuredFields
        });

        res.status(201).json(result);
      } catch (error) {
        sendError(res, error);
      }
    }
  );

  router.get(
    "/documents/:documentId/extraction",
    requirePermission(PERMISSIONS.POLICY_READ),
    async (req, res) => {
      try {
        const organizationId = getTenantOrganizationId(req);
        const result = await service.extraction.getExtractionForDocument(
          organizationId,
          req.params.documentId
        );
        res.json(result);
      } catch (error) {
        sendError(res, error);
      }
    }
  );

  router.put(
    "/documents/:documentId/extraction",
    requirePermission(PERMISSIONS.POLICY_WRITE),
    async (req, res) => {
      try {
        const organizationId = getTenantOrganizationId(req);
        const userId = req.authContext?.userId || null;
        const structuredFields = req.body?.extractedData || req.body || {};
        const result = await service.extraction.applyStructuredExtraction({
          organizationId,
          userId,
          documentId: req.params.documentId,
          structuredFields,
          merge: req.body?.merge !== false
        });
        res.json(result);
      } catch (error) {
        sendError(res, error);
      }
    }
  );

  router.get(
    "/documents/:documentId/download-url",
    requirePermission(PERMISSIONS.POLICY_READ),
    async (req, res) => {
      try {
        const organizationId = getTenantOrganizationId(req);
        const result = await service.extraction.createDownloadUrl(
          organizationId,
          req.params.documentId
        );
        res.json(result);
      } catch (error) {
        sendError(res, error);
      }
    }
  );

  router.get(
    "/reviews/:reviewId/report",
    requirePermission(PERMISSIONS.POLICY_READ),
    async (req, res) => {
      try {
        const organizationId = getTenantOrganizationId(req);
        const mode = req.query.mode || "internal";
        const report = await service.extraction.getReport(
          organizationId,
          req.params.reviewId,
          mode
        );
        res.json(report);
      } catch (error) {
        sendError(res, error);
      }
    }
  );

  router.get(
    "/documents/:documentId/ai-context",
    requirePermission(PERMISSIONS.POLICY_READ),
    async (req, res) => {
      try {
        const organizationId = getTenantOrganizationId(req);
        const context = await service.extraction.getAiContextForDocument(
          organizationId,
          req.params.documentId
        );
        res.json(context);
      } catch (error) {
        sendError(res, error);
      }
    }
  );

  router.get(
    "/documents/:documentId/benchmark-features",
    requirePermission(PERMISSIONS.POLICY_READ),
    async (req, res) => {
      try {
        const organizationId = getTenantOrganizationId(req);
        const features = await service.extraction.getBenchmarkFeaturesForDocument(
          organizationId,
          req.params.documentId
        );
        res.json(features);
      } catch (error) {
        sendError(res, error);
      }
    }
  );

  router.get(
    "/documents/:documentId/knowledge-payload",
    requirePermission(PERMISSIONS.POLICY_READ),
    async (req, res) => {
      try {
        const organizationId = getTenantOrganizationId(req);
        const payload = await service.extraction.getKnowledgePayloadForDocument(
          organizationId,
          req.params.documentId
        );
        res.json(payload);
      } catch (error) {
        sendError(res, error);
      }
    }
  );

  router.post(
    "/knowledge/sanitize",
    requirePermission(PERMISSIONS.POLICY_WRITE),
    async (req, res) => {
      try {
        const {
          gatePolicyDocumentForKnowledgeCenter
        } = require("../application/knowledgeCenterGate");
        const payload = gatePolicyDocumentForKnowledgeCenter({
          title: req.body?.title,
          body: req.body?.body,
          metadata: req.body?.metadata
        });
        res.json(payload);
      } catch (error) {
        sendError(res, error);
      }
    }
  );

  // -------------------------------------------------------------------------
  // Annual Values Engine (Sprint 4A / BR-060)
  // -------------------------------------------------------------------------

  router.get(
    "/annual-values/catalog",
    requirePermission(PERMISSIONS.POLICY_READ),
    async (_req, res) => {
      try {
        res.json(service.annualValues.getCatalog());
      } catch (error) {
        sendError(res, error);
      }
    }
  );

  router.post(
    "/annual-values/analyze",
    requirePermission(PERMISSIONS.POLICY_READ),
    async (req, res) => {
      try {
        const rows = req.body?.rows || req.body?.annualValues || [];
        const analysis = service.annualValues.analyze(rows, {
          reviewId: req.body?.reviewId || null,
          extractionId: req.body?.extractionId || null,
          source: req.body?.source || "structured_table"
        });
        res.json(analysis);
      } catch (error) {
        sendError(res, error);
      }
    }
  );

  router.get(
    "/reviews/:reviewId/annual-values",
    requirePermission(PERMISSIONS.POLICY_READ),
    async (req, res) => {
      try {
        const organizationId = getTenantOrganizationId(req);
        const result = await service.annualValues.getForReview(
          organizationId,
          req.params.reviewId
        );
        res.json(result);
      } catch (error) {
        sendError(res, error);
      }
    }
  );

  router.put(
    "/reviews/:reviewId/annual-values",
    requirePermission(PERMISSIONS.POLICY_WRITE),
    async (req, res) => {
      try {
        const organizationId = getTenantOrganizationId(req);
        const userId = req.authContext?.userId || null;
        const rows = req.body?.rows || req.body?.annualValues || [];
        const result = await service.annualValues.upsertForReview({
          organizationId,
          userId,
          reviewId: req.params.reviewId,
          rows,
          extractionId: req.body?.extractionId || null,
          source: req.body?.source || "structured_table"
        });
        res.json(result);
      } catch (error) {
        sendError(res, error);
      }
    }
  );

  router.post(
    "/reviews/:reviewId/annual-values/extract",
    requirePermission(PERMISSIONS.POLICY_WRITE),
    async (req, res) => {
      try {
        const organizationId = getTenantOrganizationId(req);
        const userId = req.authContext?.userId || null;
        const result = await service.annualValues.extractAndPersistFromStoredDocument({
          organizationId,
          userId,
          reviewId: req.params.reviewId,
          documentId: req.body?.documentId || null
        });
        res.json(result);
      } catch (error) {
        sendError(res, error);
      }
    }
  );

  // -------------------------------------------------------------------------
  // Comparison Engine (Sprint 5 / BR-061)
  // -------------------------------------------------------------------------

  router.get(
    "/comparison/catalog",
    requirePermission(PERMISSIONS.POLICY_READ),
    async (_req, res) => {
      try {
        res.json(service.comparison.getCatalog());
      } catch (error) {
        sendError(res, error);
      }
    }
  );

  router.post(
    "/comparison/analyze",
    requirePermission(PERMISSIONS.POLICY_READ),
    async (req, res) => {
      try {
        const comparison = service.comparison.compare(req.body?.scenarios || [], {
          comparisonType: req.body?.comparisonType,
          metricIds: req.body?.metricIds
        });
        res.json({ comparison });
      } catch (error) {
        sendError(res, error);
      }
    }
  );

  router.post(
    "/reviews/:reviewId/comparison",
    requirePermission(PERMISSIONS.POLICY_READ),
    async (req, res) => {
      try {
        const organizationId = getTenantOrganizationId(req);
        const result = await service.comparison.compareReviews({
          organizationId,
          reviewIdA: req.params.reviewId,
          reviewIdB: req.body?.reviewIdB || null,
          scenarioB: req.body?.scenarioB || null,
          stress: req.body?.stress || null,
          comparisonType: req.body?.comparisonType || "side_by_side"
        });
        res.json(result);
      } catch (error) {
        sendError(res, error);
      }
    }
  );

  router.post(
    "/reviews/:reviewId/comparison/stress",
    requirePermission(PERMISSIONS.POLICY_READ),
    async (req, res) => {
      try {
        const organizationId = getTenantOrganizationId(req);
        const result = await service.comparison.compareReviewWithStress({
          organizationId,
          reviewId: req.params.reviewId,
          stress: req.body?.stress || {
            kind: "illustrated_rate",
            fromRate: 0.07,
            toRate: 0.05
          },
          comparisonType: req.body?.comparisonType || "current_vs_stress"
        });
        res.json(result);
      } catch (error) {
        sendError(res, error);
      }
    }
  );

  return router;
}

module.exports = createPolicyIntelligenceRoutes;
