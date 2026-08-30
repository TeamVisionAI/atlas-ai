import test from "node:test";
import assert from "node:assert/strict";
import {
  playAgentNotificationChime,
  shouldPlayIncomingChime
} from "./agentNotificationSound.js";

test("historical and initial loads stay silent", () => {
  const incoming = [
    { id: "n1", readAt: null, eventType: "NEW_APPOINTMENT" },
    { id: "n2", readAt: "2026-08-30T00:00:00.000Z", eventType: "NEEDS_ATTENTION" }
  ];
  assert.equal(
    shouldPlayIncomingChime({
      soundEnabled: true,
      previousIds: [],
      incoming,
      isInitialLoad: true
    }),
    false
  );
  assert.equal(
    shouldPlayIncomingChime({
      soundEnabled: true,
      previousIds: ["n1", "n2"],
      incoming,
      isInitialLoad: false
    }),
    false
  );
  assert.equal(
    shouldPlayIncomingChime({
      soundEnabled: false,
      previousIds: ["n1"],
      incoming: [{ id: "n3", readAt: null }],
      isInitialLoad: false
    }),
    false
  );
});

test("new unread high-value event may chime when sound is on", () => {
  assert.equal(
    shouldPlayIncomingChime({
      soundEnabled: true,
      previousIds: ["n1"],
      incoming: [
        { id: "n1", readAt: null },
        { id: "n3", readAt: null, eventType: "NEW_APPOINTMENT" }
      ],
      isInitialLoad: false
    }),
    true
  );
  assert.equal(
    shouldPlayIncomingChime({
      soundEnabled: true,
      previousIds: ["n1"],
      incoming: [{ id: "n4", readAt: "2026-08-30T00:00:00.000Z" }],
      isInitialLoad: false
    }),
    false
  );
});

test("chime is one-shot and never loops", () => {
  const stops = [];
  const closes = [];
  const result = playAgentNotificationChime({
    audioContextFactory: function FakeAudioContext() {
      this.currentTime = 0;
      this.state = "running";
      this.createOscillator = () => ({
        type: "sine",
        frequency: { value: 0 },
        connect() {},
        start() {},
        stop(at) {
          stops.push(at);
        },
        onended: null
      });
      this.createGain = () => ({
        gain: { value: 0 },
        connect() {}
      });
      this.destination = {};
      this.close = () => {
        closes.push(true);
      };
    }
  });
  assert.equal(result.played, true);
  assert.equal(stops.length, 1);
  assert.ok(stops[0] <= 0.2);
});
