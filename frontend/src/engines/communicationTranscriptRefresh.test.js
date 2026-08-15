import test from "node:test";
import assert from "node:assert/strict";
import {
  TRANSCRIPT_REFRESH_INTERVAL_MS,
  TRANSCRIPT_REFRESH_MAX_MS,
  isTerminalTranscriptStatus,
  isInFlightTranscriptStatus,
  mediaNeedsTranscriptRefresh,
  collectionNeedsTranscriptRefresh,
  collectMediaById,
  applyMediaOverlay,
  startTranscriptRefreshPoll
} from "./communicationTranscriptRefresh.js";

const MEDIA_ID = "012fb6cc-9c19-4617-a3c1-3a4de843ff1e";
const PENDING_MEDIA = {
  id: MEDIA_ID,
  mediaKind: "audio",
  fetchStatus: "stored",
  transcodeStatus: "ready",
  transcriptStatus: "pending"
};
const READY_MEDIA = {
  ...PENDING_MEDIA,
  transcriptStatus: "ready",
  transcriptText: "Hola, estoy interesada en buscar trabajo."
};
const FAILED_MEDIA = {
  ...PENDING_MEDIA,
  transcriptStatus: "failed",
  transcriptText: null
};

function itemWithMedia(id, media) {
  return {
    id,
    category: "message",
    content: { text: "[audio message]", media }
  };
}

test("A: pending transcript needs refresh; ready/failed/skipped do not", () => {
  assert.equal(isInFlightTranscriptStatus("pending"), true);
  assert.equal(isInFlightTranscriptStatus("processing"), true);
  assert.equal(isTerminalTranscriptStatus("ready"), true);
  assert.equal(isTerminalTranscriptStatus("failed"), true);
  assert.equal(isTerminalTranscriptStatus("skipped"), true);
  assert.equal(mediaNeedsTranscriptRefresh(PENDING_MEDIA), true);
  assert.equal(mediaNeedsTranscriptRefresh(READY_MEDIA), false);
  assert.equal(mediaNeedsTranscriptRefresh(FAILED_MEDIA), false);
  assert.equal(mediaNeedsTranscriptRefresh({ transcriptStatus: "skipped" }), false);
  assert.equal(mediaNeedsTranscriptRefresh(null), false);
});

test("B: overlay replaces same media id in place — no duplicate message", () => {
  const messages = [
    { id: "log-1", text: "[audio message]", media: PENDING_MEDIA },
    { id: "log-2", text: "Hola", media: null }
  ];
  const payloadItems = [itemWithMedia("log-1", READY_MEDIA)];
  const overlay = collectMediaById(payloadItems);
  const next = applyMediaOverlay(messages, overlay);

  assert.equal(next.length, 2);
  assert.equal(next[0].id, "log-1");
  assert.equal(next[0].media.id, MEDIA_ID);
  assert.equal(next[0].media.transcriptStatus, "ready");
  assert.equal(next[0].media.transcriptText, "Hola, estoy interesada en buscar trabajo.");
  assert.equal(next[1].id, "log-2");
  assert.equal(
    collectionNeedsTranscriptRefresh(next.map((message) => ({ media: message.media }))),
    false
  );
});

test("C: terminal ready stops polling; in-flight keeps polling", () => {
  assert.equal(collectionNeedsTranscriptRefresh([itemWithMedia("a", PENDING_MEDIA)]), true);
  assert.equal(collectionNeedsTranscriptRefresh([itemWithMedia("a", READY_MEDIA)]), false);
});

test("D: failed is terminal and stops polling", () => {
  assert.equal(isTerminalTranscriptStatus("failed"), true);
  assert.equal(collectionNeedsTranscriptRefresh([itemWithMedia("a", FAILED_MEDIA)]), false);
  assert.equal(mediaNeedsTranscriptRefresh(FAILED_MEDIA), false);
});

test("E: cleanup stops timer; conversation change does not leave a live interval", async () => {
  const calls = [];
  let tick = null;
  const stop = startTranscriptRefreshPoll({
    shouldPoll: true,
    refresh: () => {
      calls.push("refresh");
    },
    intervalMs: 10,
    setIntervalFn: (fn) => {
      tick = fn;
      return 7;
    },
    clearIntervalFn: (id) => {
      calls.push(`clear:${id}`);
      tick = null;
    }
  });

  tick();
  await Promise.resolve();
  await Promise.resolve();
  stop();
  assert.equal(calls.includes("refresh"), true);
  assert.equal(calls.includes("clear:7"), true);
  assert.equal(tick, null);
});

test("E: shouldPoll false never starts a timer", () => {
  let started = false;
  const stop = startTranscriptRefreshPoll({
    shouldPoll: false,
    refresh: () => {},
    setIntervalFn: () => {
      started = true;
      return 1;
    }
  });
  stop();
  assert.equal(started, false);
});

test("C: max duration stops polling even if still pending", () => {
  let now = 0;
  let cleared = false;
  let innerTick;
  startTranscriptRefreshPoll({
    shouldPoll: true,
    refresh: () => {},
    intervalMs: 10,
    maxMs: 50,
    now: () => now,
    setIntervalFn: (fn) => {
      innerTick = fn;
      return 9;
    },
    clearIntervalFn: () => {
      cleared = true;
    }
  });
  now = 50;
  innerTick();
  assert.equal(cleared, true);
});

test("F: overlay never inserts a second bubble for the same log/media", () => {
  const messages = [
    { id: "log-1", content: { text: "[audio message]", media: PENDING_MEDIA } }
  ];
  const twice = applyMediaOverlay(
    applyMediaOverlay(messages, collectMediaById([itemWithMedia("log-1", READY_MEDIA)])),
    collectMediaById([itemWithMedia("log-1", READY_MEDIA)])
  );
  assert.equal(twice.length, 1);
  assert.equal(twice[0].id, "log-1");
  assert.equal(twice[0].content.media.transcriptStatus, "ready");
});

test("interval contract is 3s with a 5-minute safety cap", () => {
  assert.equal(TRANSCRIPT_REFRESH_INTERVAL_MS, 3000);
  assert.equal(TRANSCRIPT_REFRESH_MAX_MS, 5 * 60 * 1000);
});
