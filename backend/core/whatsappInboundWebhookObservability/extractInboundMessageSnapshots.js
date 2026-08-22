/**
 * Extract per-message inbound snapshots from raw Meta webhook JSON BEFORE parser normalization.
 */

const { sanitizeWebhookBody } = require("./sanitizeWebhookPayload");

function formatStoragePhone(from) {
  const digits = String(from || "").replace(/\D/g, "");
  if (!digits) {
    return null;
  }
  return digits.startsWith("+") ? digits : `+${digits}`;
}

function referralFlags(message) {
  const referral = message?.referral;
  if (!referral || typeof referral !== "object") {
    return {
      hasReferral: false,
      hasCtwaClid: false,
      referralSourceType: null
    };
  }
  return {
    hasReferral: true,
    hasCtwaClid: Boolean(referral.ctwa_clid),
    referralSourceType: referral.source_type ? String(referral.source_type) : null
  };
}

/**
 * Build a single-message change envelope preserving Meta structure.
 */
function buildMessagePayload(body, entry, change, message) {
  const sanitizedBody = sanitizeWebhookBody(body);
  const entryId = entry?.id ? String(entry.id) : null;
  const changeField = change?.field ? String(change.field) : null;
  const value = change?.value || {};

  return {
    object: sanitizedBody?.object || body?.object || null,
    entryId,
    changeField,
    value: sanitizeWebhookBody({
      messaging_product: value.messaging_product || "whatsapp",
      metadata: value.metadata || null,
      contacts: value.contacts || null,
      messages: [message]
    })
  };
}

/**
 * @param {object} body — raw parsed Meta webhook POST body
 * @returns {Array<object>}
 */
function extractInboundMessageSnapshots(body) {
  const snapshots = [];

  for (const entry of body?.entry || []) {
    const wabaId = entry?.id ? String(entry.id) : null;

    for (const change of entry?.changes || []) {
      const value = change?.value;
      if (!value) {
        continue;
      }

      const phoneNumberId = value.metadata?.phone_number_id
        ? String(value.metadata.phone_number_id)
        : null;
      const displayPhoneNumber = value.metadata?.display_phone_number
        ? String(value.metadata.display_phone_number)
        : null;

      for (const message of value.messages || []) {
        if (!message?.id || !message?.from) {
          continue;
        }

        const flags = referralFlags(message);

        snapshots.push({
          providerMessageId: String(message.id),
          prospectPhone: formatStoragePhone(message.from),
          messageFrom: String(message.from),
          messageTimestamp: message.timestamp != null ? String(message.timestamp) : null,
          messageType: message.type ? String(message.type) : null,
          wabaId,
          phoneNumberId,
          displayPhoneNumber,
          hasReferral: flags.hasReferral,
          hasCtwaClid: flags.hasCtwaClid,
          referralSourceType: flags.referralSourceType,
          payload: buildMessagePayload(body, entry, change, message)
        });
      }
    }
  }

  return snapshots;
}

module.exports = {
  extractInboundMessageSnapshots,
  buildMessagePayload,
  referralFlags
};
