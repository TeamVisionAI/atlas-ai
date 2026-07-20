/**
 * Sprint 11.1 — Normalize Meta WhatsApp Cloud API webhook payloads.
 */

function normalizeMessageBody(message) {
  if (!message) {
    return null;
  }

  if (message.type === "text") {
    return String(message.text?.body || "").trim();
  }

  if (message.type === "button") {
    return String(message.button?.text || message.button?.payload || "").trim();
  }

  if (message.type === "interactive") {
    const interactive = message.interactive || {};
    return String(
      interactive.button_reply?.title ||
        interactive.list_reply?.title ||
        interactive.list_reply?.description ||
        ""
    ).trim();
  }

  return `[${message.type || "unknown"} message]`;
}

/**
 * @param {Object} body — Meta webhook JSON body
 * @returns {Array<Object>} normalized inbound messages
 */
function parseWhatsAppWebhookBody(body) {
  const messages = [];

  for (const entry of body?.entry || []) {
    for (const change of entry?.changes || []) {
      const value = change?.value;

      if (!value?.messages?.length) {
        continue;
      }

      const contactName = value.contacts?.[0]?.profile?.name || "Unknown";

      for (const message of value.messages) {
        if (!message?.from || !message?.id) {
          continue;
        }

        messages.push({
          providerMessageId: message.id,
          phone: message.from,
          contactName,
          messageType: message.type || "unknown",
          body: normalizeMessageBody(message),
          timestamp: message.timestamp
            ? new Date(Number(message.timestamp) * 1000).toISOString()
            : new Date().toISOString(),
          rawMessage: message,
          rawValue: value
        });
      }
    }
  }

  return messages;
}

module.exports = {
  parseWhatsAppWebhookBody,
  normalizeMessageBody
};
