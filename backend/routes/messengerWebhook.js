const express = require("express");
const { verifyMetaWebhookSignature } = require("../middleware/metaWebhookSignature");
const { getCommunicationGateway, CHANNEL } = require("../communication/gateway/createCommunicationGateway");
const { LOG_COMPONENTS, logCommunication } = require("../communication/logging/communicationLogger");

const router = express.Router();

router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const verifyToken = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && verifyToken === process.env.VERIFY_TOKEN) {
    logCommunication(LOG_COMPONENTS.MESSENGER, "Webhook verified");
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
    logCommunication(LOG_COMPONENTS.MESSENGER, "Webhook parse failed", {
      level: "error",
      error: error.message
    });
    return;
  }

  if (body.object !== "page") {
    logCommunication(LOG_COMPONENTS.MESSENGER, "Webhook ignored", {
      reason: "not_page_object",
      object: body.object || null
    });
    return;
  }

  try {
    const { gateway } = getCommunicationGateway();
    await gateway.receive(CHANNEL.MESSENGER, body);
  } catch (error) {
    logCommunication(LOG_COMPONENTS.MESSENGER, "Webhook processing failed", {
      level: "error",
      error: error.message
    });
  }
});

module.exports = router;
