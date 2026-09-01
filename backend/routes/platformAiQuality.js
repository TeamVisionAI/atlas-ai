/**
 * BR-175 — Super Admin cross-tenant AI Quality control plane.
 */

const express = require("express");
const aiQualityService = require("../services/aiQualityService");

const router = express.Router();

function sendError(res, error) {
  return res.status(error.statusCode || 500).json({
    error: error.publicCode || error.message,
    message: error.message || "AI Quality request failed."
  });
}

router.get("/settings", (req, res) => {
  res.json({ settings: aiQualityService.presentPlatformSettings(process.env) });
});

router.get("/overview", async (req, res) => {
  try {
    const organizationId = req.query.organizationId || null;
    const cases = await aiQualityService.listCasesForScope({ organizationId });
    res.json({ overview: aiQualityService.computeOverview(cases) });
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/cases", async (req, res) => {
  try {
    const cases = await aiQualityService.listCasesForScope({
      organizationId: req.query.organizationId || null,
      signalType: req.query.signalType || null,
      tab: req.query.tab || null
    });
    res.json({ cases });
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/cases/:id", async (req, res) => {
  try {
    const qualityCase = await aiQualityService.getCaseForScope({
      caseId: req.params.id,
      includeTurns: true
    });
    if (!qualityCase) {
      return res.status(404).json({ error: "QUALITY_CASE_NOT_FOUND" });
    }
    res.json({ case: qualityCase });
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/learning-report", async (req, res) => {
  try {
    const report = await aiQualityService.getLearningReportForScope({
      organizationId: req.query.organizationId || null
    });
    res.json({ report });
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/cases/:id/learning-actions", async (req, res) => {
  try {
    const result = await aiQualityService.applyLearningCaseAction({
      caseId: req.params.id,
      action: req.body?.action,
      notes: req.body?.notes || null,
      expectedBehavior: req.body?.expectedBehavior || {},
      linkedPr: req.body?.linkedPr || null,
      linkedBr: req.body?.linkedBr || null,
      actorUserId: req.authContext?.userId || null,
      preAuthorize: req.body?.preAuthorize,
      skipAuthorization: req.body?.skipAuthorization,
      autoAuthorize: req.body?.autoAuthorize
    });
    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/cases/:id/review", async (req, res) => {
  try {
    const result = await aiQualityService.reviewCase({
      caseId: req.params.id,
      action: req.body?.action,
      notes: req.body?.notes || null,
      expectedBehavior: req.body?.expectedBehavior || {},
      reviewerUserId: req.authContext?.userId || null
    });
    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/regressions", async (req, res) => {
  try {
    const store = aiQualityService.getStore();
    const regressions = await store.listRegressions({
      organizationId: req.query.organizationId || null
    });
    res.json({ regressions });
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/regressions/:id/spec", async (req, res) => {
  try {
    const store = aiQualityService.getStore();
    const regression = await store.getRegression(req.params.id);
    if (!regression) {
      return res.status(404).json({ error: "REGRESSION_NOT_FOUND" });
    }
    res.json({
      regression,
      spec: regression.spec,
      markdown: regression.markdown,
      mutatesSourceCode: false,
      mutatesTests: false
    });
  } catch (error) {
    sendError(res, error);
  }
});

router.patch("/tenants/:organizationId/participation", async (req, res) => {
  try {
    const tenant = await aiQualityService.updateTenantParticipation({
      organizationId: req.params.organizationId,
      participationEnabled: req.body?.participationEnabled,
      mode: req.body?.mode,
      sampleRate: req.body?.sampleRate,
      actorUserId: req.authContext?.userId || null
    });
    res.json({ tenant });
  } catch (error) {
    sendError(res, error);
  }
});

module.exports = router;
