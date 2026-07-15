const axios = require("axios");

const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;

console.log("TOKEN START:", TOKEN.substring(0, 20));
console.log("TOKEN END:", TOKEN.slice(-20));

console.log("PHONE NUMBER ID:", PHONE_NUMBER_ID);
console.log("TOKEN LENGTH:", TOKEN ? TOKEN.length : "MISSING");

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
    console.error("STATUS:", err.response?.status);
    console.error(
      "DATA:",
      JSON.stringify(err.response?.data, null, 2)
    );
  }
}

module.exports = {
  sendTextMessage,
};