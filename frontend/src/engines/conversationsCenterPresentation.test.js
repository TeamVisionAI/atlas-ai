/**
 * Conversations Center pilot presentation helpers.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  buildConversationHeaderModel,
  isHumanComposerEnabled,
  conversationsThreadRegionOrder
} from "./conversationsCenterPresentation.js";
import { orderCommunicationsForDisplay } from "./communicationsCenterViewModel.js";

test("header model exposes full copyable phone for authorized detail UI", () => {
  const model = buildConversationHeaderModel({
    name: "Mayra",
    phone: "+13473369274",
    source: "whatsapp",
    ownershipState: "HUMAN",
    appointmentStatus: "none"
  });

  assert.equal(model.phone, "+13473369274");
  assert.equal(model.phoneCopyable, true);
  assert.equal(model.name, "Mayra");
  assert.equal(model.ownershipState, "HUMAN");
  assert.equal(model.source, "whatsapp");
  assert.equal(model.appointmentStatus, "none");
});

test("HUMAN composer enabled only for HUMAN ownership", () => {
  assert.equal(isHumanComposerEnabled("HUMAN"), true);
  assert.equal(isHumanComposerEnabled("ATLAS"), false);
  assert.equal(isHumanComposerEnabled("NEEDS_ATTENTION"), false);
  assert.equal(isHumanComposerEnabled(null), false);
});

test("sticky thread region places composer before timeline", () => {
  assert.deepEqual(conversationsThreadRegionOrder(), [
    "sticky_controls",
    "composer",
    "timeline"
  ]);
});

test("Conversations Center newest-first keeps older messages deterministic below", () => {
  const ordered = orderCommunicationsForDisplay(
    [
      { id: "old", timestampUtc: "2026-08-01T10:00:00.000Z" },
      { id: "mid", timestampUtc: "2026-08-05T10:00:00.000Z" },
      { id: "new", timestampUtc: "2026-08-10T10:00:00.000Z" }
    ],
    { newestFirst: true }
  );
  assert.deepEqual(
    ordered.map((item) => item.id),
    ["new", "mid", "old"]
  );
});
