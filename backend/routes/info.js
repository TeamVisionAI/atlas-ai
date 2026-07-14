const express = require("express");

const router = express.Router();

router.get("/", (req, res) => {
  res.json({
    app: "Atlas AI",
    version: "0.2.0",
    sprint: "Sprint 2",
    feature: "Recruiting Engine",
    status: "Running",
    environment: "Development",
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
