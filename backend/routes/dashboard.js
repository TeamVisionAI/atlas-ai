const express = require("express");
const router = express.Router();

const { supabase } = require("../services/supabaseService");
const {
  buildPrioritizedWorkflowQueue
} = require("../core/missionControlPriorityEngine");
const { filterProductionProspects } = require("../core/productionProspectFilter");

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

module.exports = router;