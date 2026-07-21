const express = require("express");
const { evaluateProductionReadiness } = require("../core/productionReadiness");

const router = express.Router();

router.get("/", (req, res) => {
  res.json({
    status: "healthy",
    service: "Atlas AI",
    uptime: process.uptime()
  });
});

router.get("/production", async (req, res) => {
  try {
    const report = await evaluateProductionReadiness();
    const statusCode = report.mvpReady ? 200 : 503;

    res.status(statusCode).json({
      status: report.mvpReady ? "mvp_ready" : "mvp_blocked",
      ...report
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: error.message
    });
  }
});

module.exports = router;
