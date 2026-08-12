/**
 * Apply Meta WhatsApp delivery/read/failed status updates (observability only).
 * Correlates strictly by provider_message_id / wamid — never by phone alone.
 * Does not trigger follow-ups, ownership, stall, workflow, or QUAL changes.
 */

"use strict";

const {
  applyMetaDeliveryStatusEvent
} = require("../repositories/whatsappOutboundDeliveryRepository");

/**
 * @param {Object} statusEvent — normalized status from whatsappWebhookParser
 * @param {Object} [client] — optional Supabase client (tests)
 */
async function applyWhatsAppMetaDeliveryStatus(statusEvent, client) {
  return applyMetaDeliveryStatusEvent(statusEvent, client);
}

/**
 * Apply a batch of Meta status events (order preserved).
 */
async function applyWhatsAppMetaDeliveryStatuses(statusEvents = [], client) {
  const results = [];
  for (const event of statusEvents || []) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await applyWhatsAppMetaDeliveryStatus(event, client));
  }
  return results;
}

module.exports = {
  applyWhatsAppMetaDeliveryStatus,
  applyWhatsAppMetaDeliveryStatuses
};
