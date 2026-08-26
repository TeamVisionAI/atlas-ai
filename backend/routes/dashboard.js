const express = require("express");
const { requireAtlasUser } = require("../middleware/requireAtlasUser");
const { organizationGuard } = require("../middleware/organizationGuard");
const { requireAnyPermission } = require("../middleware/requirePermission");
const { getTenantOrganizationId } = require("../services/tenantContextService");
const { PERMISSIONS } = require("../security/permissions");
const router = express.Router();

router.use(requireAtlasUser);
router.use(organizationGuard());

const { supabase } = require("../services/supabaseService");
const {
  buildPrioritizedWorkflowQueue
} = require("../core/missionControlPriorityEngine");
const { filterProductionProspects } = require("../core/productionProspectFilter");
const {
  filterOutOperationalTestProspects
} = require("../core/missionControlOperationalTestFilter");
const { filterProspectsForAuthContext } = require("../security/authorizationService");
const {
  buildExecutiveDashboard,
  buildRecommendations,
  buildRecentActivity,
  loadProductionProspects
} = require("../core/executiveDashboardReadModel");

/** BR-149 — Team + Executive dashboards share scoped aggregate APIs. */
const requireDashboardAccess = requireAnyPermission(
  PERMISSIONS.DASHBOARD_EXECUTIVE,
  PERMISSIONS.DASHBOARD_TEAM
);

router.get("/", async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);

    const { data, error } = await supabase
      .from("prospects")
      .select("*")
      .eq("organization_id", organizationId);

    if (error) {
      return res.status(500).json(error);
    }

    const productionProspects = filterOutOperationalTestProspects(
      filterProductionProspects(data || [])
    );
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

    return res.json(dashboard);
  } catch (error) {
    console.error("[dashboard] error:", error.message);
    return res.status(error.statusCode || 500).json({
      error: error.publicCode || "Failed to load dashboard",
      message: error.message
    });
  }
});

/** Sprint 9.0 — Executive / Team Dashboard aggregate read model (hierarchy-scoped). */
router.get("/executive", requireDashboardAccess, async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const productionProspects = await loadProductionProspects(organizationId);
    const prospects = filterProspectsForAuthContext(req.authContext, productionProspects);
    const payload = await buildExecutiveDashboard(organizationId, { prospects });
    res.json(payload);
  } catch (error) {
    console.error("[dashboard/executive] error:", error.message);
    res.status(error.statusCode || 500).json({
      error: error.publicCode || "Failed to load executive dashboard",
      message: error.message
    });
  }
});

/** Sprint 9.0 — Top recommendations from priority queue. */
router.get("/recommendations", requireDashboardAccess, async (req, res) => {
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
    res.status(error.statusCode || 500).json({
      error: error.publicCode || "Failed to load recommendations",
      message: error.message
    });
  }
});

/** Sprint 9.0 — Recent workflow activity timeline. */
router.get("/activity", requireDashboardAccess, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const organizationId = getTenantOrganizationId(req);
    const { data } = await supabase
      .from("prospects")
      .select("*")
      .eq("organization_id", organizationId);
    const productionProspects = filterProductionProspects(data || []);
    const prospects = filterProspectsForAuthContext(
      req.authContext,
      filterOutOperationalTestProspects(productionProspects)
    );
    const phones = prospects.map((row) => row.phone);
    const activity = await buildRecentActivity(phones, limit, organizationId);

    res.json({
      generatedAt: new Date().toISOString(),
      activity
    });
  } catch (error) {
    console.error("[dashboard/activity] error:", error.message);
    res.status(error.statusCode || 500).json({
      error: error.publicCode || "Failed to load activity",
      message: error.message
    });
  }
});

/** Sprint 12 — Alpha executive morning brief (hierarchy-scoped). */
router.get("/alpha-brief", requireDashboardAccess, async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);
    const productionProspects = await loadProductionProspects(organizationId);
    const prospects = filterProspectsForAuthContext(req.authContext, productionProspects);
    const { buildAlphaMorningBrief } = require("../core/alphaMorningBriefEngine");
    const brief = await buildAlphaMorningBrief({ organizationId, prospects });
    res.json(brief);
  } catch (error) {
    console.error("[dashboard/alpha-brief] error:", error.message);
    res.status(error.statusCode || 500).json({
      error: error.publicCode || "Failed to load alpha morning brief",
      message: error.message
    });
  }
});

module.exports = router;
