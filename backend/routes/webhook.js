const express = require("express");
const { verifyMetaWebhookSignature } = require("../middleware/metaWebhookSignature");
const { parseWhatsAppWebhookPayload } = require("../services/whatsappWebhookParser");
const { processInboundWhatsAppMessage } = require("../core/whatsappInboundPipeline");
const {
  applyWhatsAppMetaDeliveryStatus
} = require("../core/whatsappMetaDeliveryStatusService");
const { logWhatsAppStage } = require("../core/whatsappStructuredLogger");
const {
  captureInboundWebhookObservability,
  linkInboundWebhookObservability
} = require("../services/whatsappInboundWebhookObservabilityService");

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

  try {
    await captureInboundWebhookObservability(body);
  } catch (observabilityError) {
    logWhatsAppStage("inbound_webhook_observability_capture_failed", {
      level: "warn",
      error: observabilityError.message
    });
  }

  const { messages, statuses } = parseWhatsAppWebhookPayload(body);

  if (!messages.length && !statuses.length) {
    logWhatsAppStage("webhook_ignored", { reason: "no_messages_or_statuses" });
    return;
  }

  for (const statusEvent of statuses) {
    try {
      await applyWhatsAppMetaDeliveryStatus(statusEvent);
    } catch (error) {
      logWhatsAppStage("meta_delivery_status_failed", {
        providerMessageId: statusEvent.providerMessageId,
        level: "error",
        error: error.message
      });
    }
  }

  for (const inbound of messages) {
    try {
      const result = await processInboundWhatsAppMessage(inbound);
      if (inbound.providerMessageId) {
        try {
          await linkInboundWebhookObservability({
            providerMessageId: inbound.providerMessageId,
            organizationId: result?.organizationId || null,
            prospectId: result?.prospectId || null,
            conversationLogId: result?.conversationLogId || null,
            ownerUserId: result?.ownerUserId || null,
            prospectPhone: result?.phone || inbound.phone || null
          });
        } catch (linkError) {
          logWhatsAppStage("inbound_webhook_observability_link_failed", {
            level: "warn",
            providerMessageId: inbound.providerMessageId,
            error: linkError.message
          });
        }
      }
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
