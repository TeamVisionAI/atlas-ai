import test from "node:test";
import assert from "node:assert/strict";
import { resolveNotificationPanelPlacement } from "./notificationBellPlacement.js";

test("desktop sidebar bell opens to the right and stays on screen", () => {
  const placement = resolveNotificationPanelPlacement({
    triggerRect: { top: 72, right: 248, left: 212, bottom: 108 },
    viewportWidth: 1280,
    viewportHeight: 800,
    panelHeight: 360
  });
  assert.equal(placement.left, 256);
  assert.equal(placement.width, 420);
  assert.ok(placement.top >= 8);
  assert.ok(placement.top + 360 <= 800);
});

test("narrow desktop window clamps width and keeps the panel inside the viewport", () => {
  const placement = resolveNotificationPanelPlacement({
    triggerRect: { top: 40, right: 900, left: 864, bottom: 76 },
    viewportWidth: 900,
    viewportHeight: 700,
    panelHeight: 400
  });
  assert.ok(placement.width <= 420);
  assert.ok(placement.left >= 8);
  assert.ok(placement.left + placement.width <= 892);
});

test("mobile width uses the remaining viewport and does not overflow", () => {
  const placement = resolveNotificationPanelPlacement({
    triggerRect: { top: 12, right: 360, left: 324, bottom: 48 },
    viewportWidth: 390,
    viewportHeight: 844,
    panelHeight: 500
  });
  assert.equal(placement.width, 374);
  assert.ok(placement.left >= 8);
  assert.ok(placement.left + placement.width <= 382);
  assert.ok(placement.top + Math.min(500, placement.maxHeight) <= 836);
});
