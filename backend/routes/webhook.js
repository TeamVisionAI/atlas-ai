const express = require("express");
const { sendTextMessage } = require("../services/whatsappService");

const {
  handleIncomingMessage
} = require("../core/conversationEngine");

const router = express.Router();

router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const verifyToken = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (
    mode === "subscribe" &&
    verifyToken === process.env.VERIFY_TOKEN
  ) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

router.post("/", async (req, res) => {
  console.log("📩 Incoming WhatsApp webhook");
  console.log(JSON.stringify(req.body, null, 2));

  const value = req.body.entry?.[0]?.changes?.[0]?.value;
  const message = value?.messages?.[0];

  if (message && message.type === "text") {
    console.log("💬 User:", message.text.body);
  
    const phone = message.from;
    const name = value.contacts?.[0]?.profile?.name || "Unknown";
  
    const result = await handleIncomingMessage(
      phone,
      name,
      message.text.body
    );

    const replyText =
      typeof result === "string" ? result : result?.reply || "";

    await sendTextMessage(phone, replyText);
  }

  res.sendStatus(200);
});

module.exports = router;