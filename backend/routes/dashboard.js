const express = require("express");
const router = express.Router();

const { supabase } = require("../services/supabaseService");

router.get("/", async (req, res) => {
  const { data, error } = await supabase
    .from("prospects")
    .select("*");

  if (error) {
    return res.status(500).json(error);
  }

  const dashboard = {
    totalProspects: data.length,

    activeConversations: data.filter(
      p => p.current_step !== "CONFIRMED"
    ).length,

    confirmed: data.filter(
      p => p.current_step === "CONFIRMED"
    ).length,

    prospects: data
  };

  res.json(dashboard);
});

module.exports = router;