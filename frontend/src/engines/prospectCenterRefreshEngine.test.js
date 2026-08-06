import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "url";
import {
  PROSPECT_CENTER_POLL_INTERVAL_MS,
  canSafeAutoApply,
  countStagedUpdates,
  decideRefreshApply,
  getProspectRowKey,
  mergeOptimisticAcknowledge,
  mergeOptimisticClaim,
  payloadsDiffer,
  preserveScrollPosition,
  shouldLockListReplacement
} from "./prospectCenterRefreshEngine.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function read(relPath) {
  return fs.readFileSync(path.join(__dirname, relPath), "utf8");
}

function item(overrides = {}) {
  return {
    phone: "+10000000001",
    prospectNumber: "TV-000001",
    ownerUserId: "owner-a",
    assignmentStatus: "assigned",
    attentionStatus: "new",
    acknowledgedAt: null,
    missionControlPriority: 1,
    canonicalMilestone: "NEW_LEAD",
    badges: { new: true, unassigned: false, humanAttention: false, aiResponding: false },
    ...overrides
  };
}

function payload(items, extras = {}) {
  return {
    activeFilter: "all",
    search: "",
    filteredCount: items.length,
    totalCount: items.length,
    items,
    ...extras
  };
}

test("1. polling does not reorder during button focus (lock)", () => {
  assert.equal(
    shouldLockListReplacement({ focusedInteractive: true }),
    true
  );

  const decision = decideRefreshApply({
    mode: "background",
    locked: true,
    requestGeneration: 2,
    latestGeneration: 2,
    currentPayload: payload([item()]),
    nextPayload: payload([item({ phone: "+10000000002", prospectNumber: "TV-000002" }), item()])
  });

  assert.equal(decision.action, "stage");
  assert.ok(decision.pending);
});

test("2. polling does not reorder while hovering card (lock)", () => {
  assert.equal(shouldLockListReplacement({ hoveringCard: true }), true);

  const decision = decideRefreshApply({
    mode: "background",
    locked: shouldLockListReplacement({ hoveringCard: true }),
    requestGeneration: 1,
    latestGeneration: 1,
    currentPayload: payload([item({ prospectNumber: "TV-000001" }), item({ phone: "+2", prospectNumber: "TV-000002" })]),
    nextPayload: payload([item({ phone: "+2", prospectNumber: "TV-000002" }), item({ prospectNumber: "TV-000001" })])
  });

  assert.equal(decision.action, "stage");
  assert.notEqual(
    decision.pending.items.map(getProspectRowKey).join("|"),
    "TV-000001|TV-000002"
  );
});

test("3. search text persists independently of staged payload apply", () => {
  const page = read("../pages/ProspectCenter.jsx");
  assert.match(page, /searchInput/);
  assert.match(page, /setSearchInput/);
  assert.match(page, /searchParams\.get\("q"\)/);
  // Apply path must not clear local search input state.
  assert.doesNotMatch(page, /setSearchInput\(""\)/);
  assert.doesNotMatch(page, /setSearchInput\(null\)/);
});

test("4. filters persist via URL search params", () => {
  const page = read("../pages/ProspectCenter.jsx");
  assert.match(page, /searchParams\.get\("filter"\)/);
  assert.match(page, /handleFilterChange/);
  assert.match(page, /setSearchParams/);
});

test("5. scroll position persists across apply", () => {
  let scrollY = 420;
  let applied = false;
  const preserved = preserveScrollPosition(
    () => {
      applied = true;
      scrollY = 0;
    },
    () => 420,
    (y) => {
      scrollY = y;
    }
  );

  assert.equal(applied, true);
  assert.equal(preserved, 420);
  assert.equal(scrollY, 420);
  assert.match(read("../pages/ProspectCenter.jsx"), /preserveScrollPosition/);
});

test("6. open dialog/menu keeps list locked", () => {
  assert.equal(shouldLockListReplacement({ dialogOrMenuOpen: true }), true);
  const decision = decideRefreshApply({
    mode: "background",
    locked: true,
    requestGeneration: 3,
    latestGeneration: 3,
    currentPayload: payload([item()]),
    nextPayload: payload([item({ attentionStatus: "human_required" })])
  });
  assert.equal(decision.action, "stage");
});

test("7. Claim button cannot be double-submitted", () => {
  const page = read("../pages/ProspectCenter.jsx");
  assert.match(page, /actionBusyPhone/);
  assert.match(page, /if \(actionBusyPhone\)/);
  assert.match(page, /disabled=\{busy\}/);
  assert.match(page, /mutationPending/);
});

test("8. stale poll cannot overwrite successful claim", () => {
  const displayed = payload([
    mergeOptimisticClaim(payload([item({ badges: { new: true, unassigned: true } })]), "+10000000001")
      .items[0]
  ]);

  const staleServer = payload([
    item({
      badges: { new: true, unassigned: true, humanAttention: false, aiResponding: false },
      assignmentStatus: "unassigned",
      ownerUserId: null
    })
  ]);

  const decision = decideRefreshApply({
    mode: "background",
    locked: false,
    requestGeneration: 4,
    latestGeneration: 7,
    currentPayload: displayed,
    nextPayload: staleServer
  });

  assert.equal(decision.action, "ignore_stale");
});

test("9. pending update banner count appears when staged", () => {
  const current = payload([item()]);
  const staged = payload([
    item({ attentionStatus: "human_required", badges: { new: true, unassigned: false, humanAttention: true, aiResponding: false } }),
    item({ phone: "+2", prospectNumber: "TV-000002" })
  ]);

  assert.equal(countStagedUpdates(current, staged) >= 1, true);
  const page = read("../pages/ProspectCenter.jsx");
  assert.match(page, /prospectCenterUpdatesAvailable/);
  assert.match(page, /pendingPayload/);
});

test("10. clicking Refresh applies staged results", () => {
  const current = payload([item()]);
  const staged = payload([item({ phone: "+2", prospectNumber: "TV-000002" })]);
  const decision = decideRefreshApply({
    mode: "replace",
    locked: true,
    requestGeneration: 1,
    latestGeneration: 1,
    currentPayload: current,
    nextPayload: staged
  });

  assert.equal(decision.action, "apply");
  assert.equal(decision.payload.items[0].prospectNumber, "TV-000002");

  const page = read("../pages/ProspectCenter.jsx");
  assert.match(page, /handleApplyPendingUpdates/);
  assert.match(page, /prospectCenterApplyUpdates/);
});

test("11. idle page may refresh safely", () => {
  assert.equal(
    canSafeAutoApply({
      locked: false,
      pendingPayload: payload([item()]),
      idleMs: PROSPECT_CENTER_POLL_INTERVAL_MS
    }),
    true
  );
  assert.equal(
    canSafeAutoApply({
      locked: true,
      pendingPayload: payload([item()]),
      idleMs: 60_000
    }),
    false
  );
  assert.equal(
    canSafeAutoApply({
      locked: false,
      pendingPayload: null,
      idleMs: 60_000
    }),
    false
  );
});

test("12. stable prospect ID keys — never list index", () => {
  assert.equal(getProspectRowKey(item()), "TV-000001");
  assert.equal(getProspectRowKey({ phone: "+1555" }), "+1555");
  assert.equal(getProspectRowKey({ id: "uuid-1", phone: "+1" }), "uuid-1");

  const page = read("../pages/ProspectCenter.jsx");
  assert.match(page, /getProspectRowKey/);
  assert.doesNotMatch(page, /key=\{index\}/);
  assert.doesNotMatch(page, /key=\{i\}/);
  assert.doesNotMatch(page, /\.map\(\(item,\s*index\)/);
});

test("13. PR #30 scrolling remains intact", () => {
  const scrollContract = read("./prospectWorkspaceScrollContract.test.js");
  assert.match(scrollContract, /sticky prospect identity header remains disabled/);
  assert.match(scrollContract, /no Prospect Workspace-specific scroll ownership/);
  assert.match(scrollContract, /deep page sections remain in document order/);

  const css = read("../pages/ProspectCenter.css");
  const page = read("../pages/ProspectCenter.jsx");
  // Prospect Center must not introduce a nested scroll owner (PR #30 contract).
  assert.doesNotMatch(css, /prospect-center__scroll-body/);
  assert.doesNotMatch(css, /data-prospect-center-scroll-owner/);
  assert.doesNotMatch(page, /data-prospect-center-scroll-owner/);
  assert.doesNotMatch(css, /\.prospect-center\s*\{[^}]*overflow-y:\s*auto/s);
});

test("14. BR-080 actions still work", () => {
  const page = read("../pages/ProspectCenter.jsx");
  assert.match(page, /acknowledgeProspectLead/);
  assert.match(page, /claimProspectLead/);
  assert.match(page, /onAcknowledge/);
  assert.match(page, /onClaim/);
  assert.match(page, /prospectCenterClaimAcknowledge/);
  assert.match(page, /prospectCenterAcknowledge/);

  const claimed = mergeOptimisticClaim(
    payload([item({ ownerUserId: null, assignmentStatus: "unassigned", badges: { new: true, unassigned: true } })]),
    "+10000000001"
  );
  assert.equal(claimed.items[0].badges.unassigned, false);
  assert.equal(claimed.items[0].assignmentStatus, "assigned");

  const acked = mergeOptimisticAcknowledge(payload([item()]), "+10000000001");
  assert.equal(acked.items[0].badges.new, false);
  assert.equal(acked.items[0].attentionStatus, "acknowledged");
});

test("background poll stages when locked and applies when idle unlock", () => {
  const current = payload([item()]);
  const next = payload([item({ missionControlPriority: 9 })]);
  assert.equal(payloadsDiffer(current, next), true);

  const staged = decideRefreshApply({
    mode: "background",
    locked: true,
    requestGeneration: 1,
    latestGeneration: 1,
    currentPayload: current,
    nextPayload: next
  });
  assert.equal(staged.action, "stage");

  const applied = decideRefreshApply({
    mode: "background",
    locked: false,
    requestGeneration: 1,
    latestGeneration: 1,
    currentPayload: current,
    nextPayload: next
  });
  assert.equal(applied.action, "apply");
});

test("poll interval constant remains 20s and page uses background mode", () => {
  assert.equal(PROSPECT_CENTER_POLL_INTERVAL_MS, 20_000);
  const page = read("../pages/ProspectCenter.jsx");
  assert.match(page, /PROSPECT_CENTER_POLL_INTERVAL_MS/);
  assert.match(page, /mode:\s*["']background["']/);
  assert.match(page, /setLoading\(true\)/);
  // Initial/filter replace may load; background must not flip full-page loading.
  assert.match(page, /mode !== ["']background["']/);
});
