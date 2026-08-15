/**
 * BR-141 — bounded quiet refresh while a visible voice-note transcript is in flight.
 * Parent/thread owns polling so bubbles do not each open their own timer.
 */

export const TRANSCRIPT_REFRESH_INTERVAL_MS = 3000;
export const TRANSCRIPT_REFRESH_MAX_MS = 5 * 60 * 1000;

const TERMINAL = new Set(["ready", "failed", "skipped"]);
const IN_FLIGHT = new Set(["pending", "processing"]);

export function isTerminalTranscriptStatus(status) {
  return TERMINAL.has(String(status || "").trim().toLowerCase());
}

export function isInFlightTranscriptStatus(status) {
  return IN_FLIGHT.has(String(status || "").trim().toLowerCase());
}

export function resolveItemMedia(item) {
  if (!item || typeof item !== "object") {
    return null;
  }
  return item.content?.media || item.media || null;
}

export function mediaNeedsTranscriptRefresh(media) {
  if (!media) {
    return false;
  }
  return isInFlightTranscriptStatus(media.transcriptStatus || media.transcript_status);
}

export function collectionNeedsTranscriptRefresh(items = []) {
  if (!Array.isArray(items)) {
    return false;
  }
  return items.some((item) => mediaNeedsTranscriptRefresh(resolveItemMedia(item)));
}

export function collectMediaById(items = []) {
  const byId = new Map();
  for (const item of items || []) {
    const media = resolveItemMedia(item);
    if (media?.id) {
      byId.set(String(media.id), media);
    }
  }
  return byId;
}

export function applyMediaOverlay(messages = [], overlayById = null) {
  if (!Array.isArray(messages) || !overlayById || overlayById.size === 0) {
    return messages;
  }
  return messages.map((message) => {
    const current = resolveItemMedia(message);
    if (!current?.id) {
      return message;
    }
    const next = overlayById.get(String(current.id));
    if (!next || next === current) {
      return message;
    }
    return {
      ...message,
      media: next,
      content: message.content ? { ...message.content, media: next } : message.content
    };
  });
}

/**
 * Interval poller. Caller owns React state. Cleanup must be called on unmount
 * or when shouldPoll becomes false.
 */
export function startTranscriptRefreshPoll({
  shouldPoll,
  refresh,
  intervalMs = TRANSCRIPT_REFRESH_INTERVAL_MS,
  maxMs = TRANSCRIPT_REFRESH_MAX_MS,
  now = () => Date.now(),
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval
} = {}) {
  if (!shouldPoll || typeof refresh !== "function") {
    return () => {};
  }

  const startedAt = now();
  let inFlight = false;
  let stopped = false;

  const id = setIntervalFn(() => {
    if (stopped) {
      return;
    }
    if (now() - startedAt >= maxMs) {
      stopped = true;
      clearIntervalFn(id);
      return;
    }
    if (inFlight) {
      return;
    }
    inFlight = true;
    Promise.resolve()
      .then(() => refresh())
      .catch(() => {})
      .finally(() => {
        inFlight = false;
      });
  }, intervalMs);

  return () => {
    stopped = true;
    clearIntervalFn(id);
  };
}
