const express = require("express");
const router = express.Router();

const { supabase } = require("../services/supabaseService");
const {
  buildPrioritizedWorkflowQueue
} = require("../core/missionControlPriorityEngine");
const { filterProductionProspects } = require("../core/productionProspectFilter");
const {
  buildExecutiveDashboard,
  buildRecommendations,
  buildRecentActivity,
  loadProductionProspects
} = require("../core/executiveDashboardReadModel");

router.get("/", async (req, res) => {
  const { data, error } = await supabase
    .from("prospects")
    .select("*");

  if (error) {
    return res.status(500).json(error);
  }

  const prospects = filterProductionProspects(data || []);

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
    const payload = await buildExecutiveDashboard();
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
    const prospects = await loadProductionProspects();
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
    const { data } = await supabase.from("prospects").select("phone");
    const phones = filterProductionProspects(data || []).map((row) => row.phone);
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

module.exports = router;