/**
 * Lightweight poller for pending WhatsApp media fetches (BR-140).
 * Reuses Atlas reminder/attention poller pattern. No new queue infra.
 */

"use strict";

const { FETCH_POLL_INTERVAL_MS } = require("./constants");
const { processPendingWhatsAppMediaFetches } = require("./whatsappMediaFetchService");

let timer = null;

function startWhatsAppMediaFetchPoller(intervalMs = FETCH_POLL_INTERVAL_MS) {
  if (timer) {
    return timer;
  }

  const tick = () => {
    processPendingWhatsAppMediaFetches().catch((error) => {
      console.warn(
        "[whatsappMediaFetchPoller]",
        error?.publicCode || error?.message || "tick_failed"
      );
    });
  };

  timer = setInterval(tick, intervalMs);
  if (typeof timer.unref === "function") {
    timer.unref();
  }
  tick();
  return timer;
}

function stopWhatsAppMediaFetchPoller() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = {
  startWhatsAppMediaFetchPoller,
  stopWhatsAppMediaFetchPoller
};
