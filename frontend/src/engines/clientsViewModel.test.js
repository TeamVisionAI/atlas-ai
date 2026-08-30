import test from "node:test";
import assert from "node:assert/strict";
import {
  buildClientStatusLabel,
  matchesClientSearch,
  presentClientHistoryEvent
} from "./clientsViewModel.js";

function translate(key) {
  return key;
}

test("client search matches name, phone, or email", () => {
  const item = { name: "Alex Client", phone: "+15550001111", email: "alex@example.com" };
  assert.equal(matchesClientSearch(item, "alex"), true);
  assert.equal(matchesClientSearch(item, "5550001111"), true);
  assert.equal(matchesClientSearch(item, "example.com"), true);
  assert.equal(matchesClientSearch(item, "recruit"), false);
});

test("history presentation never shows a raw actor UUID", () => {
  const event = presentClientHistoryEvent(
    {
      actor: "41000000-0000-4000-8000-000000000001",
      actorName: "Former teammate",
      at: "2026-08-30T16:00:00.000Z",
      summary: "Promoted to Client"
    },
    translate,
    "en-US"
  );
  assert.equal(event.actorLabel, "Former teammate");
  assert.doesNotMatch(event.actorLabel, /[0-9a-f]{8}-[0-9a-f]{4}/i);
  assert.equal(buildClientStatusLabel("ACTIVE", translate), "clientsStatusActive");
});
