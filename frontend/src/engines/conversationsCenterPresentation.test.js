/**
 * Conversations Center pilot presentation helpers.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  buildConversationHeaderModel,
  resolveEffectiveOwnership,
  isHumanComposerEnabled,
  canTakeOverConversation,
  canReturnConversationToAtlas,
  resolveThreadActionIds,
  resolveLifecycleActionIds,
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
});

test("effectiveOwnership collapses NEEDS_ATTENTION to ATLAS for controls", () => {
  assert.equal(resolveEffectiveOwnership("HUMAN"), "HUMAN");
  assert.equal(resolveEffectiveOwnership("ATLAS"), "ATLAS");
  assert.equal(resolveEffectiveOwnership("NEEDS_ATTENTION"), "ATLAS");
  assert.equal(resolveEffectiveOwnership(null), "ATLAS");
});

test("NEEDS_ATTENTION + effectiveOwnership=ATLAS → actions=['TAKE_OVER'] only", () => {
  const ownershipState = "NEEDS_ATTENTION";
  const effectiveOwnership = resolveEffectiveOwnership(ownershipState);
  assert.equal(effectiveOwnership, "ATLAS");
  assert.deepEqual(
    resolveThreadActionIds({ ownershipState, effectiveOwnership }),
    ["TAKE_OVER"]
  );
  assert.equal(
    resolveThreadActionIds({ ownershipState, effectiveOwnership }).includes(
      "RETURN_TO_ATLAS"
    ),
    false
  );
});

test("HUMAN + any attention flag → RETURN TO ATLAS only", () => {
  const effective = resolveEffectiveOwnership("HUMAN");
  assert.equal(canTakeOverConversation(effective), false);
  assert.equal(canReturnConversationToAtlas(effective), true);
  assert.equal(isHumanComposerEnabled(effective), true);
});

test("ATLAS → TAKE OVER only", () => {
  const effective = resolveEffectiveOwnership("ATLAS");
  assert.equal(canTakeOverConversation(effective), true);
  assert.equal(canReturnConversationToAtlas(effective), false);
  assert.equal(isHumanComposerEnabled(effective), false);
});

test("after TAKE OVER → HUMAN / RETURN only; after RETURN → ATLAS / TAKE OVER only", () => {
  const afterTakeOver = resolveEffectiveOwnership("HUMAN");
  assert.equal(canTakeOverConversation(afterTakeOver), false);
  assert.equal(canReturnConversationToAtlas(afterTakeOver), true);

  const afterReturn = resolveEffectiveOwnership("ATLAS");
  assert.equal(canTakeOverConversation(afterReturn), true);
  assert.equal(canReturnConversationToAtlas(afterReturn), false);

  // Refresh invariant: same mapping from authoritative API ownershipState.
  assert.deepEqual(
    {
      take: canTakeOverConversation(resolveEffectiveOwnership("NEEDS_ATTENTION")),
      ret: canReturnConversationToAtlas(resolveEffectiveOwnership("NEEDS_ATTENTION"))
    },
    { take: true, ret: false }
  );
});

test("lifecycle actions: Active can archive/close/mark-test; Archived can restore", () => {
  assert.deepEqual(resolveLifecycleActionIds({ inboxLifecycle: "ACTIVE" }), [
    "ARCHIVE",
    "CLOSE",
    "MARK_TEST"
  ]);
  assert.deepEqual(resolveLifecycleActionIds({ inboxLifecycle: "ARCHIVED" }), [
    "RESTORE"
  ]);
  assert.deepEqual(resolveLifecycleActionIds({ inboxLifecycle: "SCHEDULED" }), []);
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
