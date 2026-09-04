/**
 * TikFinity TikTok LIVE webhook (BR-230).
 * Mount: /api/integrations/tikfinity
 */

const express = require("express");
const { recordTikfinityLiveEvent } = require("../core/tikfinity/tikfinityLiveEventService");

function createTikfinityLiveEventRouter(dependencies = {}) {
  const router = express.Router();
  router.use(express.urlencoded({ extended: true }));

  async function handleLiveEvent(req, res) {
    try {
      const result = await recordTikfinityLiveEvent(req, dependencies);
      return res.status(result.status).json(result.body);
    } catch {
      return res.status(500).json({ ok: false, error: "TIKFINITY_LIVE_EVENT_FAILED" });
    }
  }

  router.get("/live-event", handleLiveEvent);
  router.post("/live-event", handleLiveEvent);
  return router;
}

module.exports = createTikfinityLiveEventRouter;
module.exports.createTikfinityLiveEventRouter = createTikfinityLiveEventRouter;
