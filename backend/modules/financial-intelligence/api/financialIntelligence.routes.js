/**
 * Financial Intelligence HTTP routes (RC3).
 * Auth + tenant isolation + POLICY_READ / POLICY_WRITE.
 */

const express = require("express");
const { requireAtlasUser } = require("../../../middleware/requireAtlasUser");
const { organizationGuard } = require("../../../middleware/organizationGuard");
const { requirePermission } = require("../../../middleware/requirePermission");
const { PERMISSIONS } = require("../../../security/permissions");
const { getTenantOrganizationId } = require("../../../services/tenantContextService");
const { StrategyEvaluationService } = require("../application/StrategyEvaluationService");
const {
  validateTermQuoteInput,
  validateInvestmentHorizonInput,
  validateRiskProfileInput,
  validateOverrideInput
} = require("../validation/strategyEvaluationSchemas");

function sendError(res, error) {
  const status = error.statusCode || 500;
  return res.status(status).json({
    error: error.publicCode || "FINANCIAL_INTELLIGENCE_ERROR",
    message: error.message || "Financial Intelligence request failed."
  });
}

function createFinancialIntelligenceRoutes(deps = {}) {
  const router = express.Router();
  const service = deps.service || new StrategyEvaluationService(deps);

  router.use(requireAtlasUser);
  router.use(organizationGuard());

  router.get("/", requirePermission(PERMISSIONS.POLICY_READ), async (req, res) => {
    try {
      // BR-074 + catalog release gate — VERIFIED_ACTIVE is necessary but not
      // sufficient for named fund catalog. Current release: fail closed for all.
      const summary = service.getModuleSummary();
      const {
        canAccessSecuritiesContent
      } = require("../../../security/securitiesAccessService");
      const {
        canExposeVerifiedFundCatalog
      } = require("../../../security/verifiedFundCatalogGate");

      const securitiesAllowed = await canAccessSecuritiesContent(req.authContext);
      const exposeCatalog = canExposeVerifiedFundCatalog({
        canAccessSecuritiesContent: securitiesAllowed
      });

      if (!exposeCatalog) {
        delete summary.fundCatalog;
        summary.namedFundCatalogActive = false;
        summary.securitiesContentRestricted = true;
      }

      res.json(summary);
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post(
    "/evaluations",
    requirePermission(PERMISSIONS.POLICY_WRITE),
    async (req, res) => {
      try {
        const organizationId = getTenantOrganizationId(req);
        const userId = req.authContext?.userId || null;
        const reviewId = req.body?.reviewId;
        if (!reviewId) {
          return res.status(400).json({
            error: "FI_REVIEW_ID_REQUIRED",
            message: "reviewId is required."
          });
        }

        const evaluation = await service.createFromReview({
          organizationId,
          userId,
          reviewId,
          prospectId: req.body?.prospectId || null,
          termQuote: req.body?.termQuote || null,
          investmentHorizon: req.body?.investmentHorizon || null,
          riskProfile: req.body?.riskProfile || undefined,
          replacementAcknowledged: Boolean(req.body?.replacementAcknowledged),
          override: req.body?.override || null,
          forceClientDiscussion: Boolean(req.body?.forceClientDiscussion)
        });

        res.status(201).json({ evaluation });
      } catch (error) {
        sendError(res, error);
      }
    }
  );

  router.get(
    "/evaluations/:evaluationId",
    requirePermission(PERMISSIONS.POLICY_READ),
    async (req, res) => {
      try {
        const organizationId = getTenantOrganizationId(req);
        const evaluation = await service.getEvaluation(
          organizationId,
          req.params.evaluationId
        );
        res.json({ evaluation });
      } catch (error) {
        sendError(res, error);
      }
    }
  );

  router.get(
    "/reviews/:reviewId/evaluations/latest",
    requirePermission(PERMISSIONS.POLICY_READ),
    async (req, res) => {
      try {
        const organizationId = getTenantOrganizationId(req);
        const evaluation = await service.getLatestForReview(
          organizationId,
          req.params.reviewId
        );
        res.json({ evaluation });
      } catch (error) {
        sendError(res, error);
      }
    }
  );

  router.get(
    "/reviews/:reviewId/evaluations/history",
    requirePermission(PERMISSIONS.POLICY_READ),
    async (req, res) => {
      try {
        const organizationId = getTenantOrganizationId(req);
        const evaluations = await service.getHistoryForReview(
          organizationId,
          req.params.reviewId
        );
        res.json({ evaluations });
      } catch (error) {
        sendError(res, error);
      }
    }
  );

  router.put(
    "/evaluations/:evaluationId/term-quote",
    requirePermission(PERMISSIONS.POLICY_WRITE),
    async (req, res) => {
      try {
        const organizationId = getTenantOrganizationId(req);
        const userId = req.authContext?.userId || null;
        const termQuote = validateTermQuoteInput(req.body?.termQuote || req.body);
        const evaluation = await service.updateTermQuote({
          organizationId,
          userId,
          evaluationId: req.params.evaluationId,
          termQuote
        });
        res.json({ evaluation });
      } catch (error) {
        sendError(res, error);
      }
    }
  );

  router.put(
    "/evaluations/:evaluationId/investment-horizon",
    requirePermission(PERMISSIONS.POLICY_WRITE),
    async (req, res) => {
      try {
        const organizationId = getTenantOrganizationId(req);
        const userId = req.authContext?.userId || null;
        const investmentHorizon = validateInvestmentHorizonInput(
          req.body?.investmentHorizon || req.body
        );
        const evaluation = await service.updateInvestmentHorizon({
          organizationId,
          userId,
          evaluationId: req.params.evaluationId,
          investmentHorizon
        });
        res.json({ evaluation });
      } catch (error) {
        sendError(res, error);
      }
    }
  );

  router.put(
    "/evaluations/:evaluationId/risk-profile",
    requirePermission(PERMISSIONS.POLICY_WRITE),
    async (req, res) => {
      try {
        const organizationId = getTenantOrganizationId(req);
        const userId = req.authContext?.userId || null;
        const riskProfile = validateRiskProfileInput(req.body || {});
        const evaluation = await service.updateRiskProfile({
          organizationId,
          userId,
          evaluationId: req.params.evaluationId,
          riskProfile
        });
        res.json({ evaluation });
      } catch (error) {
        sendError(res, error);
      }
    }
  );

  router.put(
    "/evaluations/:evaluationId/replacement-acknowledgement",
    requirePermission(PERMISSIONS.POLICY_WRITE),
    async (req, res) => {
      try {
        const organizationId = getTenantOrganizationId(req);
        const userId = req.authContext?.userId || null;
        const evaluation = await service.acknowledgeReplacement({
          organizationId,
          userId,
          evaluationId: req.params.evaluationId,
          acknowledged: req.body?.acknowledged !== false
        });
        res.json({ evaluation });
      } catch (error) {
        sendError(res, error);
      }
    }
  );

  router.post(
    "/evaluations/:evaluationId/override",
    requirePermission(PERMISSIONS.POLICY_WRITE),
    async (req, res) => {
      try {
        const organizationId = getTenantOrganizationId(req);
        const userId = req.authContext?.userId || null;
        const override = validateOverrideInput(req.body?.override || req.body);
        const evaluation = await service.applyOverride({
          organizationId,
          userId,
          evaluationId: req.params.evaluationId,
          override
        });
        res.json({ evaluation });
      } catch (error) {
        sendError(res, error);
      }
    }
  );

  router.post(
    "/evaluations/:evaluationId/revisions",
    requirePermission(PERMISSIONS.POLICY_WRITE),
    async (req, res) => {
      try {
        const organizationId = getTenantOrganizationId(req);
        const userId = req.authContext?.userId || null;
        const evaluation = await service.createRevision({
          organizationId,
          userId,
          evaluationId: req.params.evaluationId,
          forceClientDiscussion: Boolean(req.body?.forceClientDiscussion)
        });
        res.status(201).json({ evaluation });
      } catch (error) {
        sendError(res, error);
      }
    }
  );

  return router;
}

module.exports = createFinancialIntelligenceRoutes;
