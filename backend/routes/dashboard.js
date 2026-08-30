const express = require("express");
const { requireAtlasUser } = require("../middleware/requireAtlasUser");
const { organizationGuard } = require("../middleware/organizationGuard");
const { requireAnyPermission } = require("../middleware/requirePermission");
const { getTenantOrganizationId } = require("../services/tenantContextService");
const {
  operationalControlPlaneEmpty,
  emptyDashboard,
  emptyExecutiveDashboard
} = require("../core/operationalControlPlane");
const { PERMISSIONS } = require("../security/permissions");
const router = express.Router();

router.use(requireAtlasUser);
router.use(organizationGuard());

const { supabase } = require("../services/supabaseService");
const {
  buildPrioritizedWorkflowQueue
} = require("../core/missionControlPriorityEngine");
const {
  filterProductionProspects,
  filterOperationalProspects
} = require("../core/productionProspectFilter");
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

router.get("/", operationalControlPlaneEmpty(emptyDashboard), async (req, res) => {
  try {
    const organizationId = getTenantOrganizationId(req);

    const { data, error } = await supabase
      .from("prospects")
      .select("*")
      .eq("organization_id", organizationId);

    if (error) {
      return res.status(500).json(error);
    }

    const productionProspects = filterOperationalProspects(
      filterOutOperationalTestProspects(filterProductionProspects(data || []))
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

    try {
      const followUpApplicationService = require("../application/followUpApplicationService");
      const followUpSummary = await followUpApplicationService.summarizeForOwner({
        organizationId,
        authContext: {
          userId: req.tenantContext?.userId || req.authContext?.userId,
          role: req.authContext?.role,
          hierarchyMode: req.authContext?.hierarchyMode,
          hierarchyUserIds: req.authContext?.hierarchyUserIds
        }
      });
      dashboard.followUpsDue = followUpSummary.followUpsDue;
      dashboard.followUpsOverdue = followUpSummary.followUpsOverdue;
      dashboard.nextFollowUps = followUpSummary.nextFollowUps;
      try {
        const clientWorkspaceApplicationService = require("../application/clientWorkspaceApplicationService");
        const clientSummary = await clientWorkspaceApplicationService.summarizeForOwner({
          organizationId,
          authContext: {
            userId: req.tenantContext?.userId || req.authContext?.userId,
            role: req.authContext?.role,
            hierarchyMode: req.authContext?.hierarchyMode,
            hierarchyUserIds: req.authContext?.hierarchyUserIds
          }
        });
        dashboard.myClientsCount = clientSummary.myClientsCount;
        dashboard.clientFollowUpsDue = clientSummary.clientFollowUpsDue;
      } catch (clientError) {
        console.error("[dashboard] client summary error:", clientError.message);
        dashboard.myClientsCount = 0;
        dashboard.clientFollowUpsDue = 0;
      }
    } catch (followUpError) {
      console.error("[dashboard] follow-up summary error:", followUpError.message);
      dashboard.followUpsDue = dashboard.followUpsDue || 0;
      dashboard.followUpsOverdue = 0;
      dashboard.nextFollowUps = [];
      dashboard.myClientsCount = dashboard.myClientsCount || 0;
      dashboard.clientFollowUpsDue = dashboard.clientFollowUpsDue || 0;
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
router.get("/executive", requireDashboardAccess, operationalControlPlaneEmpty(emptyExecutiveDashboard), async (req, res) => {
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
router.get("/recommendations", requireDashboardAccess, operationalControlPlaneEmpty(() => ({
  generatedAt: new Date().toISOString(),
  recommendations: []
})), async (req, res) => {
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
router.get("/activity", requireDashboardAccess, operationalControlPlaneEmpty(() => ({
  generatedAt: new Date().toISOString(),
  activity: []
})), async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const organizationId = getTenantOrganizationId(req);
    const { data } = await supabase
      .from("prospects")
      .select("*")
      .eq("organization_id", organizationId);
    const productionProspects = filterOperationalProspects(
      filterProductionProspects(data || [])
    );
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
router.get("/alpha-brief", requireDashboardAccess, operationalControlPlaneEmpty(() => ({
  generatedAt: new Date().toISOString(),
  items: [],
  priorities: []
})), async (req, res) => {
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
