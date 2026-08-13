/**
 * Conversations transcript bottom-anchoring + live new-message indicator.
 * Presentation only — does not mutate ownership or BR-080.
 */

export const NEAR_BOTTOM_PX = 80;
export const CONVERSATIONS_POLL_MS = 12000;

export function isTranscriptNearBottom(el, thresholdPx = NEAR_BOTTOM_PX) {
  if (!el) {
    return true;
  }
  const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
  return remaining <= thresholdPx;
}

export function shouldForceScrollToLatest({
  opening = false,
  nearBottom = true
} = {}) {
  return Boolean(opening) || Boolean(nearBottom);
}

export function nextNewMessageIndicatorCount({
  previousInboundCount = 0,
  nextInboundCount = 0,
  nearBottom = true,
  opening = false
} = {}) {
  if (opening || nearBottom) {
    return 0;
  }
  return Math.max(0, Number(nextInboundCount || 0) - Number(previousInboundCount || 0));
}

export function accumulateNewMessageCount(currentCount = 0, delta = 0) {
  return Math.max(0, Number(currentCount || 0) + Math.max(0, Number(delta || 0)));
}

export function formatNewMessageIndicatorLabel(
  count,
  {
    one = "New message ↓",
    many = "{count} new messages ↓"
  } = {}
) {
  const n = Math.max(0, Number(count) || 0);
  if (n <= 1) {
    return one;
  }
  return many.replace("{count}", String(n));
}

export function countInboundConversationItems(items = []) {
  return (items || []).filter((item) => {
    const direction = String(item?.direction || "").toLowerCase();
    return direction === "inbound" || direction === "incoming";
  }).length;
}
