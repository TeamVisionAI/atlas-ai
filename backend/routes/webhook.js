const express = require("express");
const { sendTextMessage } = require("../services/whatsappService");

const {
  findProspect,
  createProspect
} = require("../services/supabaseService");

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

let prospect = await findProspect(phone);

if (!prospect) {
  prospect = await createProspect(
    phone,
    name,
    message.text.body
  );

  console.log("✅ New prospect created:", prospect.phone);
} else {
  console.log("👤 Existing prospect:", prospect.phone);
}

  console.log("✅ New prospect created:", prospect.phone);
} else {
  console.log("👤 Existing prospect:", prospect.phone);
}

await sendTextMessage(
  phone,
  "👋 Welcome to Team Vision!\n\nI'm Atlas, your virtual recruiting assistant.\n\nWhat city and state do you currently live in?"
);
  }

  res.sendStatus(200);
});

module.exports = router;