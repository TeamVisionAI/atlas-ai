/**
 * Pure BR-075 customer-care window math. No I/O.
 */

const CUSTOMER_CARE_WINDOW_MS = 24 * 60 * 60 * 1000;

const WINDOW_SOURCE = Object.freeze({
  CONVERSATION_LOGS_INBOUND: "conversation_logs.inbound"
});

function parseInboundTimestamp(value) {
  if (value == null || value === "") {
    return null;
  }

  const ms = Date.parse(value);

  if (!Number.isFinite(ms)) {
    return null;
  }

  return ms;
}

function evaluateCustomerCareWindowFromInboundAt({
  latestInboundAt,
  now = new Date(),
  windowMs = CUSTOMER_CARE_WINDOW_MS
} = {}) {
  const nowMs = typeof now === "number" ? now : Date.parse(now);
  const inboundMs = parseInboundTimestamp(latestInboundAt);

  if (!Number.isFinite(nowMs)) {
    return {
      open: false,
      reason: "INVALID_SERVER_TIME",
      latestInboundAt: null,
      expiresAt: null,
      windowMs,
      source: WINDOW_SOURCE.CONVERSATION_LOGS_INBOUND
    };
  }

  if (inboundMs == null) {
    return {
      open: false,
      reason: "NO_INBOUND_TIMESTAMP",
      latestInboundAt: null,
      expiresAt: null,
      windowMs,
      source: WINDOW_SOURCE.CONVERSATION_LOGS_INBOUND
    };
  }

  if (inboundMs > nowMs + 60_000) {
    return {
      open: false,
      reason: "FUTURE_INBOUND_TIMESTAMP",
      latestInboundAt: new Date(inboundMs).toISOString(),
      expiresAt: null,
      windowMs,
      source: WINDOW_SOURCE.CONVERSATION_LOGS_INBOUND
    };
  }

  const expiresAtMs = inboundMs + windowMs;
  const open = nowMs <= expiresAtMs;

  return {
    open,
    reason: open ? "WINDOW_OPEN" : "WINDOW_EXPIRED",
    latestInboundAt: new Date(inboundMs).toISOString(),
    expiresAt: new Date(expiresAtMs).toISOString(),
    windowMs,
    source: WINDOW_SOURCE.CONVERSATION_LOGS_INBOUND
  };
}

module.exports = {
  CUSTOMER_CARE_WINDOW_MS,
  WINDOW_SOURCE,
  evaluateCustomerCareWindowFromInboundAt
};
