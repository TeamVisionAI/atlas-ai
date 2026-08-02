const express = require("express");
const { requireAtlasUser } = require("../middleware/requireAtlasUser");
const { organizationGuard } = require("../middleware/organizationGuard");
const { getTenantOrganizationId } = require("../services/tenantContextService");
const router = express.Router();

router.use(requireAtlasUser);
router.use(organizationGuard());

const { supabase } = require("../services/supabaseService");
const {
  buildPrioritizedWorkflowQueue
} = require("../core/missionControlPriorityEngine");
const { filterProductionProspects } = require("../core/productionProspectFilter");
const { filterProspectsForAuthContext } = require("../security/authorizationService");
const {
  buildExecutiveDashboard,
  buildRecommendations,
  buildRecentActivity,
  loadProductionProspects
} = require("../core/executiveDashboardReadModel");

router.get("/", async (req, res) => {
  const organizationId = getTenantOrganizationId(req);

  const { data, error } = await supabase
    .from("prospects")
    .select("*")
    .eq("organization_id", organizationId);

  if (error) {
    return res.status(500).json(error);
  }

  const productionProspects = filterProductionProspects(data || []);
  const prospects = filterProspectsForAuthContext(req.authContext, productionProspects);

  const dashboard = {
    totalProspects: prospects.length,

    activeConversations: prospects.filter(
      p => p.current_step !== "CONFIRMED"
    ).length,

    confirmed: prospects.filter(
      p => p.current_step === "CONFIRMED"
    ).length,

    prospects
  };

  try {
    dashboard.prioritizedWorkflowQueue = await buildPrioritizedWorkflowQueue(prospects);
  } catch (queueError) {
    console.error("[dashboard] prioritizedWorkflowQueue error:", queueError.message);
    dashboard.prioritizedWorkflowQueue = [];
  }

  res.json(dashboard);
});

/** Sprint 9.0 — Executive Dashboard aggregate read model. */
router.get("/executive", async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const payload = await buildExecutiveDashboard(organizationId);
    res.json(payload);
  } catch (error) {
    console.error("[dashboard/executive] error:", error.message);
    res.status(500).json({ error: "Failed to load executive dashboard" });
  }
});

/** Sprint 9.0 — Top recommendations from priority queue. */
router.get("/recommendations", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 5, 20);
    const organizationId = getTenantOrganizationId(req);
    const productionProspects = await loadProductionProspects(organizationId);
    const prospects = filterProspectsForAuthContext(req.authContext, productionProspects);
    const queue = await buildPrioritizedWorkflowQueue(prospects);

    res.json({
      generatedAt: new Date().toISOString(),
      recommendations: buildRecommendations(queue, prospects, limit)
    });
  } catch (error) {
    console.error("[dashboard/recommendations] error:", error.message);
    res.status(500).json({ error: "Failed to load recommendations" });
  }
});

/** Sprint 9.0 — Recent workflow activity timeline. */
router.get("/activity", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const organizationId = getTenantOrganizationId(req);
    const { data } = await supabase
      .from("prospects")
      .select("*")
      .eq("organization_id", organizationId);
    const productionProspects = filterProductionProspects(data || []);
    const prospects = filterProspectsForAuthContext(req.authContext, productionProspects);
    const phones = prospects.map((row) => row.phone);
    const activity = await buildRecentActivity(phones, limit);

    res.json({
      generatedAt: new Date().toISOString(),
      activity
    });
  } catch (error) {
    console.error("[dashboard/activity] error:", error.message);
    res.status(500).json({ error: "Failed to load activity" });
  }
});

/** Sprint 12 — Alpha executive morning brief. */
router.get("/alpha-brief", async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const { buildAlphaMorningBrief } = require("../core/alphaMorningBriefEngine");
    const brief = await buildAlphaMorningBrief({ organizationId });
    res.json(brief);
  } catch (error) {
    console.error("[dashboard/alpha-brief] error:", error.message);
    res.status(500).json({ error: "Failed to load alpha morning brief" });
  }
});

module.exports = router;