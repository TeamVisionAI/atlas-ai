/**
 * Short inbound burst aggregation — combine rapid short fragments into one logical turn.
 * Only delays processing for short text fragments; long messages flush immediately.
 */

const SHORT_FRAGMENT_MAX_LEN = 48;
const BURST_WAIT_MS = 500;

/** @type {Map<string, { fragments: Array<{ text: string, inbound: object }>, timer: NodeJS.Timeout | null, waiters: Array<Function> }>} */
const bursts = new Map();

function burstKey(phone) {
  return String(phone || "").trim();
}

function isShortFragment(text) {
  return (
    String(text || "").trim().length > 0 &&
    String(text || "").trim().length <= SHORT_FRAGMENT_MAX_LEN
  );
}

/**
 * Schedule or extend a burst window. Returns a promise that resolves with
 * { combinedText, inbound, burst, anchorProviderMessageId }.
 */
function scheduleInboundBurstAggregation({
  phone,
  text,
  inbound,
  waitMs = BURST_WAIT_MS
} = {}) {
  const key = burstKey(phone);
  const trimmed = String(text || "").trim();

  if (!key || !trimmed || !isShortFragment(trimmed)) {
    return Promise.resolve({
      combinedText: trimmed,
      inbound,
      burst: false,
      anchorProviderMessageId: String(inbound?.providerMessageId || "").trim()
    });
  }

  return new Promise((resolve) => {
    let entry = bursts.get(key);
    if (!entry) {
      entry = { fragments: [], timer: null, waiters: [] };
      bursts.set(key, entry);
    }

    entry.fragments.push({ text: trimmed, inbound });
    entry.waiters.push(resolve);

    if (entry.timer) {
      clearTimeout(entry.timer);
    }

    entry.timer = setTimeout(() => {
      const current = bursts.get(key);
      bursts.delete(key);
      if (!current?.waiters?.length) {
        return;
      }

      const combinedText = current.fragments
        .map((f) => f.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      const anchorInbound =
        current.fragments[current.fragments.length - 1]?.inbound || inbound;
      const result = {
        combinedText,
        inbound: {
          ...anchorInbound,
          text: combinedText,
          body: combinedText,
          burstFragmentCount: current.fragments.length
        },
        burst: current.fragments.length > 1,
        anchorProviderMessageId: String(
          anchorInbound?.providerMessageId || ""
        ).trim()
      };

      for (const waiter of current.waiters) {
        waiter(result);
      }
    }, waitMs);
  });
}

function resetInboundBurstAggregationForTests() {
  for (const entry of bursts.values()) {
    if (entry.timer) {
      clearTimeout(entry.timer);
    }
  }
  bursts.clear();
}

module.exports = {
  SHORT_FRAGMENT_MAX_LEN,
  BURST_WAIT_MS,
  scheduleInboundBurstAggregation,
  resetInboundBurstAggregationForTests
};
