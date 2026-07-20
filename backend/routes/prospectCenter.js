/**
 * Sprint 10.3 — Prospect Center routes (thin API).
 */

const express = require("express");
const { buildProspectCenterReadModel } = require("../core/prospectCenterReadModel");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const payload = await buildProspectCenterReadModel({
      filter: req.query.filter,
      search: req.query.q
    });

    res.json(payload);
  } catch (error) {
    console.error("[prospect-center]", error.message);
    res.status(500).json({ error: "Failed to load prospect center" });
  }
});

module.exports = router;
