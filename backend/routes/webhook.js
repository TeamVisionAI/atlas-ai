const express = require("express");

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

router.post("/", (req, res) => {
  console.log("📩 Incoming WhatsApp webhook");
  console.log(JSON.stringify(req.body, null, 2));

  res.sendStatus(200);
});

module.exports = router;
