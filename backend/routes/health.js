const express = require("express");
const { evaluateProductionReadiness } = require("../core/productionReadiness");
const { resolveAtlasEnv } = require("../config/atlasEnvironment");

const router = express.Router();

router.get("/", (req, res) => {
  const payload = {
    status: "healthy",
    service: "Atlas AI",
    uptime: process.uptime()
  };
  const atlasEnv = resolveAtlasEnv();

  if (atlasEnv) {
    payload.atlasEnv = atlasEnv;
  }

  // Staging-only booleans. Never emit key material or production secrets.
  if (atlasEnv === "staging") {
    payload.openaiSttConfigured = Boolean(String(process.env.OPENAI_API_KEY || "").trim());
    payload.executionEnabled =
      String(process.env.RECRUIT_AI_V2_EXECUTION_ENABLED || "").trim().toLowerCase() ===
      "true";
    payload.liveExecutionPathEnabled =
      String(process.env.RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED || "").trim().toLowerCase() ===
      "true";
    payload.stagingOutboundEnabled =
      String(process.env.STAGING_OUTBOUND_COMMUNICATION_ENABLED || "").trim().toLowerCase() ===
      "true";
  }

  res.json(payload);
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
