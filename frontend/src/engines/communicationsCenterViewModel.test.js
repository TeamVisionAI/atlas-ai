import test from "node:test";
import assert from "node:assert/strict";
import {
  filterCommunicationsItems,
  filterConversationLayoutItems,
  isConversationBubbleItem,
  isTechnicalCommunicationsItem,
  resolveConversationBubbleSide,
  buildWarningBadges,
  labelForFlag,
  containsRawPhoneLeak,
  buildCommunicationsCacheKey
} from "./communicationsCenterViewModel.js";

test("filters isolate messages, workflow, appointments, and system/errors", () => {
  const items = [
    { id: "1", category: "message", flags: [] },
    { id: "2", category: "workflow", flags: [] },
    { id: "3", category: "appointment", flags: [] },
    { id: "4", category: "delivery", flags: ["delivery_attention"] },
    { id: "5", category: "message", flags: ["ignored_counteroffer"] }
  ];

  assert.equal(filterCommunicationsItems(items, "messages").length, 2);
  assert.equal(filterCommunicationsItems(items, "workflow").length, 1);
  assert.equal(filterCommunicationsItems(items, "appointments").length, 1);
  assert.ok(
    filterCommunicationsItems(items, "system").some((item) => item.id === "4")
  );
  assert.ok(
    filterCommunicationsItems(items, "system").some((item) => item.id === "5")
  );
});

test("conversation layout hides technical events from the default transcript", () => {
  const items = [
    { id: "1", category: "message", direction: "inbound", actor: { type: "prospect" } },
    { id: "2", category: "workflow", workflow: { before: "A", after: "B" } },
    { id: "3", category: "note", direction: "outbound", actor: { type: "agent" } },
    { id: "4", category: "appointment" },
    { id: "5", category: "delivery", flags: ["delivery_attention"] }
  ];

  assert.equal(filterConversationLayoutItems(items, "messages").length, 2);
  assert.deepEqual(
    filterConversationLayoutItems(items, "messages").map((item) => item.id),
    ["1", "3"]
  );
  assert.equal(filterConversationLayoutItems(items, "appointments").length, 1);
  assert.deepEqual(
    filterConversationLayoutItems(items, "all").map((item) => item.id),
    ["1", "3", "4"]
  );

  assert.equal(isConversationBubbleItem(items[0]), true);
  assert.equal(isTechnicalCommunicationsItem(items[1]), true);
  assert.equal(isTechnicalCommunicationsItem(items[4]), true);

  assert.equal(resolveConversationBubbleSide(items[0]), "inbound");
  assert.equal(resolveConversationBubbleSide(items[2]), "outbound");
  assert.equal(
    resolveConversationBubbleSide({ actor: { type: "atlas" } }),
    "outbound"
  );
});

test("warning badges use plain-language labels", () => {
  const badges = buildWarningBadges({
    flags: ["legacy_phone_correlation", "dual_confirmation", "no_reschedule_path"]
  });
  assert.equal(badges.length, 3);
  assert.equal(labelForFlag("dual_confirmation"), "Duplicate confirmation");
  assert.ok(badges.every((badge) => !badge.label.includes("_")));
});

test("orderCommunicationsForDisplay newest-first is presentation only and deterministic", async () => {
  const { orderCommunicationsForDisplay } = await import(
    "./communicationsCenterViewModel.js"
  );
  const items = [
    { id: "a", timestampUtc: "2026-08-10T10:00:00.000Z" },
    { id: "b", timestampUtc: "2026-08-10T12:00:00.000Z" },
    { id: "c", timestampUtc: "2026-08-10T11:00:00.000Z" },
    { id: "d", timestampUtc: "2026-08-10T12:00:00.000Z" }
  ];

  const ascending = orderCommunicationsForDisplay(items, { newestFirst: false });
  assert.deepEqual(
    ascending.map((item) => item.id),
    ["a", "c", "b", "d"]
  );

  const newest = orderCommunicationsForDisplay(items, { newestFirst: true });
  assert.deepEqual(
    newest.map((item) => item.id),
    ["d", "b", "c", "a"]
  );
  assert.deepEqual(
    items.map((item) => item.id),
    ["a", "b", "c", "d"]
  );
});

test("cache key is prospect-id based, never phone", () => {
  const key = buildCommunicationsCacheKey(
    "00000000-0000-4000-8000-000000000001",
    "29853100-f151-4ca8-b07d-624fd20c6685"
  );
  assert.equal(
    key,
    "communications:00000000-0000-4000-8000-000000000001:29853100-f151-4ca8-b07d-624fd20c6685"
  );
  assert.doesNotMatch(key, /\+\d{10}/);
});

test("UI leak detector catches E.164 and formatted phones", () => {
  assert.equal(containsRawPhoneLeak("advance:+13059997338:x"), true);
  assert.equal(containsRawPhoneLeak("Call (305) 999-7338"), true);
  assert.equal(containsRawPhoneLeak("Contact ***7338"), false);
});
