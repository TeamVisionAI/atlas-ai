const express = require("express");
const { intakeFacebookLead } = require("../core/facebookLeadIntakeService");

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const result = await intakeFacebookLead(req.body || {});

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.status(201).json(result);
  } catch (error) {
    console.error("[facebookLeadWebhook]", error);
    res.status(500).json({
      success: false,
      error: "FACEBOOK_LEAD_INTAKE_FAILED",
      message: error.message
    });
  }
});

router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const verifyToken = process.env.FACEBOOK_LEAD_VERIFY_TOKEN || process.env.META_VERIFY_TOKEN;

  if (mode === "subscribe" && token && verifyToken && token === verifyToken) {
    return res.status(200).send(challenge);
  }

  res.status(403).json({ error: "Verification failed" });
});

module.exports = router;
