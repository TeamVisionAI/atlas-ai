/**
 * Short inbound burst aggregation — combine rapid short fragments into one logical turn.
 * Only delays processing for short text fragments; long messages flush immediately.
 * Recruiting campaign-intake first turns use a longer bounded window (see recruitingFirstTurnBurst.js).
 *
 * BR-167 — burst identity is channel-asset scoped, never phone-only. The same
 * customer may legitimately exist in multiple Atlas tenants / WhatsApp assets.
 */

const {
  RECRUITING_FIRST_TURN_BURST_WAIT_MS
} = require("./recruitingFirstTurnBurst");

const SHORT_FRAGMENT_MAX_LEN = 48;
const BURST_WAIT_MS = 500;

/** @type {Map<string, { fragments: Array<{ text: string, inbound: object }>, timer: NodeJS.Timeout | null, waiters: Array<Function> }>} */
const bursts = new Map();

function normalizedPart(value) {
  return String(value || "").trim();
}

/**
 * BR-167 — use the concrete receiving WhatsApp asset + sender identity.
 * phoneNumberId is preferred because it is the exact Cloud API number asset;
 * WABA is a secondary discriminator. This prevents a phone shared across two
 * tenants/assets from being merged into one logical turn.
 */
function burstKey(phone, inbound = {}) {
  const sender =
    normalizedPart(inbound.whatsappSenderId) ||
    normalizedPart(inbound.phone) ||
    normalizedPart(phone);
  const phoneNumberId =
    normalizedPart(inbound.phoneNumberId) ||
    normalizedPart(inbound.rawValue?.metadata?.phone_number_id);
  const wabaId = normalizedPart(inbound.wabaId);

  if (!sender) {
    return "";
  }

  const asset = phoneNumberId || wabaId || "unknown_asset";
  return `${asset}::${sender}`;
}

function isShortFragment(text, { recruitingFirstTurnBurst = false } = {}) {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    return false;
  }
  if (recruitingFirstTurnBurst) {
    return true;
  }
  return trimmed.length <= SHORT_FRAGMENT_MAX_LEN;
}

function mergeBurstInbound(fragments, fallbackInbound) {
  const anchorInbound =
    fragments[fragments.length - 1]?.inbound || fallbackInbound || {};
  const campaignIntakeMatch =
    fragments.map((f) => f.inbound?.campaignIntakeMatch).find((m) => m?.matched) ||
    anchorInbound.campaignIntakeMatch ||
    null;
  const ctwaReferral =
    fragments.map((f) => f.inbound?.ctwaReferral).find(Boolean) ||
    anchorInbound.ctwaReferral ||
    null;
  return {
    ...anchorInbound,
    campaignIntakeMatch,
    ctwaReferral
  };
}

/**
 * Schedule or extend a burst window. Returns a promise that resolves with
 * { combinedText, inbound, burst, anchorProviderMessageId }.
 */
function scheduleInboundBurstAggregation({
  phone,
  text,
  inbound,
  waitMs = BURST_WAIT_MS,
  recruitingFirstTurnBurst = false
} = {}) {
  const key = burstKey(phone, inbound || {});
  const trimmed = String(text || "").trim();
  const effectiveWaitMs = recruitingFirstTurnBurst
    ? RECRUITING_FIRST_TURN_BURST_WAIT_MS
    : waitMs;

  if (!key || !trimmed || !isShortFragment(trimmed, { recruitingFirstTurnBurst })) {
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
      entry = {
        fragments: [],
        timer: null,
        waiters: [],
        recruitingFirstTurnBurst: false,
        firstFragmentAt: Date.now()
      };
      bursts.set(key, entry);
    }

    entry.recruitingFirstTurnBurst =
      entry.recruitingFirstTurnBurst || recruitingFirstTurnBurst;
    const participates = isShortFragment(trimmed, {
      recruitingFirstTurnBurst: entry.recruitingFirstTurnBurst
    });
    if (!participates) {
      resolve({
        combinedText: trimmed,
        inbound,
        burst: false,
        anchorProviderMessageId: String(inbound?.providerMessageId || "").trim()
      });
      return;
    }

    entry.fragments.push({ text: trimmed, inbound });
    entry.waiters.push(resolve);

    const windowMs = entry.recruitingFirstTurnBurst
      ? RECRUITING_FIRST_TURN_BURST_WAIT_MS
      : effectiveWaitMs;
    const elapsed = Date.now() - (entry.firstFragmentAt || Date.now());
    const remaining = Math.max(0, windowMs - elapsed);

    const flushBurst = () => {
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
      const mergedInbound = mergeBurstInbound(current.fragments, inbound);
      const result = {
        combinedText,
        inbound: {
          ...mergedInbound,
          text: combinedText,
          body: combinedText,
          burstFragmentCount: current.fragments.length,
          recruitingFirstTurnBurst: Boolean(current.recruitingFirstTurnBurst)
        },
        burst: current.fragments.length > 1,
        anchorProviderMessageId: String(
          mergedInbound?.providerMessageId || ""
        ).trim()
      };

      for (const waiter of current.waiters) {
        waiter(result);
      }
    };

    if (entry.timer) {
      clearTimeout(entry.timer);
    }

    if (remaining === 0) {
      flushBurst();
      return;
    }

    entry.timer = setTimeout(flushBurst, remaining);
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
  RECRUITING_FIRST_TURN_BURST_WAIT_MS,
  burstKey,
  scheduleInboundBurstAggregation,
  resetInboundBurstAggregationForTests,
  mergeBurstInbound
};
