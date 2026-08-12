/**
 * Apply Meta WhatsApp delivery/read/failed status updates (observability only).
 * Correlates strictly by provider_message_id / wamid — never by phone alone.
 * Does not trigger follow-ups, ownership, stall, workflow, or QUAL changes.
 *
 * UNKNOWN_WAMID: bounded retry so early Meta callbacks can win the send→persist race
 * without a pending-status buffer table.
 */

"use strict";

const {
  applyMetaDeliveryStatusEvent
} = require("../repositories/whatsappOutboundDeliveryRepository");
const { logWhatsAppStage } = require("./whatsappStructuredLogger");

/**
 * Delays between UNKNOWN_WAMID lookup attempts (ms).
 * Attempt 1 immediate + 4 retries ≈ 1.75s wall time after first miss.
 */
const UNKNOWN_WAMID_RETRY_DELAYS_MS = Object.freeze([100, 250, 500, 900]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {Object} statusEvent — normalized status from whatsappWebhookParser
 * @param {Object} [client] — optional Supabase client (tests)
 * @param {{ retryDelaysMs?: number[], sleepFn?: Function }} [options]
 */
async function applyWhatsAppMetaDeliveryStatus(statusEvent, client, options = {}) {
  const retryDelaysMs = Array.isArray(options.retryDelaysMs)
    ? options.retryDelaysMs
    : UNKNOWN_WAMID_RETRY_DELAYS_MS;
  const sleepFn = typeof options.sleepFn === "function" ? options.sleepFn : sleep;

  const maxAttempts = retryDelaysMs.length + 1;
  let last = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    // Quiet during all attempts; single exhaustion log below (avoid duplicate).
    // eslint-disable-next-line no-await-in-loop
    last = await applyMetaDeliveryStatusEvent(statusEvent, client, {
      quietUnknownLog: true
    });

    if (last?.reason !== "UNKNOWN_WAMID") {
      return {
        ...last,
        attempts: attempt
      };
    }

    if (attempt < maxAttempts) {
      // eslint-disable-next-line no-await-in-loop
      await sleepFn(retryDelaysMs[attempt - 1]);
    }
  }

  logWhatsAppStage("meta_delivery_status_unknown_wamid", {
    providerMessageId: statusEvent?.providerMessageId || null,
    status: statusEvent?.status || null,
    attempts: maxAttempts
  });

  return {
    ...last,
    attempts: maxAttempts
  };
}

/**
 * Apply a batch of Meta status events (order preserved).
 */
async function applyWhatsAppMetaDeliveryStatuses(statusEvents = [], client, options = {}) {
  const results = [];
  for (const event of statusEvents || []) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await applyWhatsAppMetaDeliveryStatus(event, client, options));
  }
  return results;
}

module.exports = {
  applyWhatsAppMetaDeliveryStatus,
  applyWhatsAppMetaDeliveryStatuses,
  UNKNOWN_WAMID_RETRY_DELAYS_MS
};
