/**
 * Meta WhatsApp Cloud API delivery lifecycle (observability only).
 * Distinct from BR-075 gate statuses on whatsapp_outbound_deliveries.status.
 */

"use strict";

const META_DELIVERY_STATUS = Object.freeze({
  SENT: "sent",
  DELIVERED: "delivered",
  READ: "read",
  FAILED: "failed"
});

const SUCCESS_RANK = Object.freeze({
  [META_DELIVERY_STATUS.SENT]: 1,
  [META_DELIVERY_STATUS.DELIVERED]: 2,
  [META_DELIVERY_STATUS.READ]: 3
});

function normalizeMetaDeliveryStatus(raw) {
  const token = String(raw || "")
    .trim()
    .toLowerCase();

  if (token === "sent") return META_DELIVERY_STATUS.SENT;
  if (token === "delivered") return META_DELIVERY_STATUS.DELIVERED;
  if (token === "read") return META_DELIVERY_STATUS.READ;
  if (token === "failed") return META_DELIVERY_STATUS.FAILED;
  return null;
}

function successRank(status) {
  return SUCCESS_RANK[status] || 0;
}

/**
 * Monotonic merge of Meta lifecycle onto an existing delivery row.
 * Never regresses sent → delivered → read.
 * Failed stamps failure fields; does not demote delivered/read success.
 * Late success after failed may upgrade meta_delivery_status (failure fields retained).
 */
function planMetaDeliveryLifecycleUpdate(current = {}, incoming = {}) {
  const nextStatus = normalizeMetaDeliveryStatus(incoming.status);
  if (!nextStatus) {
    return { apply: false, reason: "UNKNOWN_STATUS", patch: null };
  }

  const providerMessageId = String(incoming.providerMessageId || "").trim();
  if (!providerMessageId) {
    return { apply: false, reason: "MISSING_PROVIDER_MESSAGE_ID", patch: null };
  }

  const eventAt =
    incoming.timestampIso ||
    (incoming.timestampSeconds
      ? new Date(Number(incoming.timestampSeconds) * 1000).toISOString()
      : new Date().toISOString());

  const patch = {
    updated_at: new Date().toISOString()
  };

  const currentMeta = normalizeMetaDeliveryStatus(current.meta_delivery_status);

  if (nextStatus === META_DELIVERY_STATUS.FAILED) {
    patch.failed_at = current.failed_at || eventAt;
    if (incoming.failureCode) {
      patch.failure_code = String(incoming.failureCode).slice(0, 120);
    }
    if (incoming.failureReason) {
      patch.failure_reason = String(incoming.failureReason).slice(0, 500);
    }

    const currentSuccess = successRank(currentMeta);
    if (currentSuccess < SUCCESS_RANK[META_DELIVERY_STATUS.DELIVERED]) {
      patch.meta_delivery_status = META_DELIVERY_STATUS.FAILED;
    }

    return { apply: true, reason: null, patch, providerMessageId };
  }

  // Success path — stamp only the timestamp Meta actually reported.
  // Do not fabricate delivered_at when READ arrives without DELIVERED.
  if (nextStatus === META_DELIVERY_STATUS.SENT) {
    patch.sent_at = current.sent_at || eventAt;
  } else if (nextStatus === META_DELIVERY_STATUS.DELIVERED) {
    patch.delivered_at = current.delivered_at || eventAt;
  } else if (nextStatus === META_DELIVERY_STATUS.READ) {
    patch.read_at = current.read_at || eventAt;
  }

  const incomingRank = successRank(nextStatus);
  const currentRank = successRank(currentMeta);

  if (incomingRank >= currentRank) {
    patch.meta_delivery_status = nextStatus;
  }

  return { apply: true, reason: null, patch, providerMessageId };
}

module.exports = {
  META_DELIVERY_STATUS,
  SUCCESS_RANK,
  normalizeMetaDeliveryStatus,
  successRank,
  planMetaDeliveryLifecycleUpdate
};
