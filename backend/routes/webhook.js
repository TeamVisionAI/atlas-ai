const express = require("express");
const { verifyMetaWebhookSignature } = require("../middleware/metaWebhookSignature");
const { parseWhatsAppWebhookBody } = require("../services/whatsappWebhookParser");
const { processInboundWhatsAppMessage } = require("../core/whatsappInboundPipeline");
const { logWhatsAppStage } = require("../core/whatsappStructuredLogger");

const router = express.Router();

router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const verifyToken = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && verifyToken === process.env.VERIFY_TOKEN) {
    logWhatsAppStage("webhook_verified");
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

router.post("/", verifyMetaWebhookSignature, async (req, res) => {
  res.sendStatus(200);

  let body;

  try {
    body = JSON.parse(Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "{}");
  } catch (error) {
    logWhatsAppStage("webhook_parse_failed", {
      level: "error",
      error: error.message
    });
    return;
  }

  logWhatsAppStage("webhook_received", {
    object: body.object || null,
    entryCount: body.entry?.length || 0
  });

  const messages = parseWhatsAppWebhookBody(body);

  if (!messages.length) {
    logWhatsAppStage("webhook_ignored", { reason: "no_messages" });
    return;
  }

  for (const inbound of messages) {
    try {
      await processInboundWhatsAppMessage(inbound);
    } catch (error) {
      logWhatsAppStage("message_processing_failed", {
        phone: inbound.phone,
        providerMessageId: inbound.providerMessageId,
        level: "error",
        error: error.message
      });
    }
  }
});

module.exports = router;
