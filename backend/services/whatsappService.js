const axios = require("axios");

const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
console.log(
  "TOKEN PREFIX:",
  TOKEN ? TOKEN.substring(0, 20) : "MISSING"
);
async function sendTextMessage(to, message) {
  try {
    await axios.post(
      `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: {
          body: message,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ Message sent");
  } catch (err) {
    console.error(err.response?.data || err.message);
  }
}

module.exports = {
  sendTextMessage,
};