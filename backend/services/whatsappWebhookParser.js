/**
 * Sprint 11.1 — Normalize Meta WhatsApp Cloud API webhook payloads.
 * Inbound messages and delivery status updates (observability).
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
 * Positive Click-to-WhatsApp ad referral from Meta Cloud API.
 * Only `source_type=ad` or `ctwa_clid` — not greetings, not organic posts.
 */
function extractClickToWhatsAppReferral(message) {
  const referral = message?.referral;
  if (!referral || typeof referral !== "object") {
    return null;
  }

  const sourceType = String(referral.source_type || "").trim().toLowerCase();
  const ctwaClid = referral.ctwa_clid ? String(referral.ctwa_clid) : null;
  if (sourceType !== "ad" && !ctwaClid) {
    return null;
  }

  return {
    sourceType: referral.source_type ? String(referral.source_type) : null,
    sourceId: referral.source_id ? String(referral.source_id) : null,
    ctwaClid,
    sourceUrl: referral.source_url ? String(referral.source_url) : null,
    headline: referral.headline ? String(referral.headline) : null,
    body: referral.body ? String(referral.body) : null
  };
}

/**
 * Structured WhatsApp media metadata. Phase 1 extracts audio only.
 * Keep rawMessage separately; never include provider tokens.
 */
function extractWhatsAppMedia(message) {
  if (!message) {
    return null;
  }

  const messageType = String(message.type || "").toLowerCase();
  if (messageType !== "audio") {
    return null;
  }

  const audio = message.audio || {};
  if (!audio.id) {
    return null;
  }

  return {
    kind: "audio",
    metaMediaId: String(audio.id),
    mimeType: audio.mime_type || null,
    isVoiceNote: audio.voice === true || audio.voice === "true",
    sha256: audio.sha256 || null,
    fileSize: audio.file_size != null ? Number(audio.file_size) : null
  };
}

function extractStatusFailure(statusItem) {
  const errors = Array.isArray(statusItem?.errors) ? statusItem.errors : [];
  const first = errors[0] || null;
  if (!first) {
    return { failureCode: null, failureReason: null };
  }

  return {
    failureCode: first.code != null ? String(first.code) : null,
    failureReason:
      String(
        first.title ||
          first.message ||
          first.error_data?.details ||
          first.href ||
          ""
      ).trim() || null
  };
}

function normalizeStatusItem(statusItem, value, wabaId) {
  if (!statusItem?.id || !statusItem?.status) {
    return null;
  }

  const { failureCode, failureReason } = extractStatusFailure(statusItem);
  const phoneNumberId = value?.metadata?.phone_number_id
    ? String(value.metadata.phone_number_id)
    : null;

  return {
    providerMessageId: String(statusItem.id),
    status: String(statusItem.status).toLowerCase(),
    timestampSeconds: statusItem.timestamp || null,
    timestampIso: statusItem.timestamp
      ? new Date(Number(statusItem.timestamp) * 1000).toISOString()
      : new Date().toISOString(),
    recipientId: statusItem.recipient_id ? String(statusItem.recipient_id) : null,
    conversation: statusItem.conversation || null,
    pricing: statusItem.pricing || null,
    phoneNumberId,
    wabaId,
    failureCode,
    failureReason,
    rawStatus: statusItem
  };
}

/**
 * @param {Object} body — Meta webhook JSON body
 * @returns {{ messages: Array<Object>, statuses: Array<Object> }}
 */
function parseWhatsAppWebhookPayload(body) {
  const messages = [];
  const statuses = [];

  for (const entry of body?.entry || []) {
    const wabaId = entry?.id ? String(entry.id) : null;

    for (const change of entry?.changes || []) {
      const value = change?.value;
      if (!value) {
        continue;
      }

      const contactName = value.contacts?.[0]?.profile?.name || "Unknown";
      const phoneNumberId = value.metadata?.phone_number_id
        ? String(value.metadata.phone_number_id)
        : null;

      for (const message of value.messages || []) {
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
          phoneNumberId,
          wabaId,
          media: extractWhatsAppMedia(message),
          ctwaReferral: extractClickToWhatsAppReferral(message),
          rawMessage: message,
          rawValue: value
        });
      }

      for (const statusItem of value.statuses || []) {
        const normalized = normalizeStatusItem(statusItem, value, wabaId);
        if (normalized) {
          statuses.push(normalized);
        }
      }
    }
  }

  return { messages, statuses };
}

/**
 * @param {Object} body — Meta webhook JSON body
 * @returns {Array<Object>} normalized inbound messages
 */
function parseWhatsAppWebhookBody(body) {
  return parseWhatsAppWebhookPayload(body).messages;
}

module.exports = {
  parseWhatsAppWebhookBody,
  parseWhatsAppWebhookPayload,
  normalizeMessageBody,
  extractWhatsAppMedia,
  extractClickToWhatsAppReferral,
  normalizeStatusItem
};
