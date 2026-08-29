"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  burstKey,
  scheduleInboundBurstAggregation,
  resetInboundBurstAggregationForTests
} = require("../core/whatsappInboundBurstAggregator");

function inbound({
  id,
  phoneNumberId,
  sender = "15551234567",
  body = "hola"
}) {
  return {
    providerMessageId: id,
    phoneNumberId,
    phone: sender,
    whatsappSenderId: sender,
    body,
    text: body
  };
}

test.afterEach(() => {
  resetInboundBurstAggregationForTests();
});

test("BR-167 burst key is receiving-asset + sender, never phone-only", () => {
  const a = burstKey("15551234567", inbound({ id: "a", phoneNumberId: "asset-A" }));
  const b = burstKey("15551234567", inbound({ id: "b", phoneNumberId: "asset-B" }));
  const same = burstKey("15551234567", inbound({ id: "c", phoneNumberId: "asset-A" }));

  assert.notEqual(a, b);
  assert.equal(a, same);
  assert.match(a, /asset-A/);
});

test("same WhatsApp asset + sender rapid fragments aggregate into one logical turn", async () => {
  const first = inbound({ id: "wamid-1", phoneNumberId: "asset-A", body: "Orlando" });
  const second = inbound({ id: "wamid-2", phoneNumberId: "asset-A", body: "Florida" });

  const p1 = scheduleInboundBurstAggregation({
    phone: first.phone,
    text: first.body,
    inbound: first,
    waitMs: 15
  });
  const p2 = scheduleInboundBurstAggregation({
    phone: second.phone,
    text: second.body,
    inbound: second,
    waitMs: 15
  });

  const [r1, r2] = await Promise.all([p1, p2]);
  assert.equal(r1.burst, true);
  assert.equal(r2.burst, true);
  assert.equal(r1.combinedText, "Orlando Florida");
  assert.equal(r2.combinedText, "Orlando Florida");
  assert.equal(r1.anchorProviderMessageId, "wamid-2");
  assert.equal(r2.anchorProviderMessageId, "wamid-2");
});

test("same sender on different WhatsApp assets cannot cross-aggregate", async () => {
  const first = inbound({ id: "wamid-a", phoneNumberId: "asset-A", body: "Miami" });
  const second = inbound({ id: "wamid-b", phoneNumberId: "asset-B", body: "Orlando" });

  const [a, b] = await Promise.all([
    scheduleInboundBurstAggregation({
      phone: first.phone,
      text: first.body,
      inbound: first,
      waitMs: 10
    }),
    scheduleInboundBurstAggregation({
      phone: second.phone,
      text: second.body,
      inbound: second,
      waitMs: 10
    })
  ]);

  assert.equal(a.burst, false);
  assert.equal(b.burst, false);
  assert.equal(a.combinedText, "Miami");
  assert.equal(b.combinedText, "Orlando");
});

test("BR-167 technical/timeout V2 loss is suppressed before legacy CE invocation", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../core/communicationHub.js"),
    "utf8"
  );

  const suppression = source.indexOf("V2_AUTHORING_LOSS_SUPPRESSED");
  const technical = source.indexOf('authoringAttempt.reason === "LIVE_AUTHORING_TECHNICAL_FAILURE"');
  const timeout = source.indexOf('authoringAttempt.reason === "LIVE_AUTHORING_TIMEOUT"');
  const ceInvoke = source.indexOf('logWhatsAppStage("conversation_engine_invoked"');

  assert.ok(suppression > 0);
  assert.ok(technical > 0);
  assert.ok(timeout > 0);
  assert.ok(ceInvoke > suppression);
});
