/**
 * Sprint 10.3 — Prospect Center verification.
 * Run: node backend/dev/verifySprint10_3.js
 */

require("dotenv").config();

const express = require("express");
const {
  buildProspectCenterReadModel,
  matchesSearch
} = require("../core/prospectCenterReadModel");
const {
  resolveExecutiveFilterPhones,
  buildExecutiveFilterCounts
} = require("../core/executiveFilterResolver");
const prospectCenterRoutes = require("../routes/prospectCenter");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createProspectCenterApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/prospect-center", prospectCenterRoutes);
  return app;
}

async function fetchProspectCenter(app, query = "") {
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/prospect-center${query}`
    );
    const payload = await response.json().catch(() => ({}));
    return { status: response.status, payload };
  } finally {
    server.close();
  }
}

function verifyUnitTests() {
  assert(
    matchesSearch(
      { name: "Maria Lopez", phone: "+15551234567", city: "Miami" },
      "maria"
    ),
    "Search matches name"
  );
  assert(
    !matchesSearch({ name: "Maria Lopez", phone: "+15551234567" }, "zzz"),
    "Search excludes non-matches"
  );
  console.log("✓ Prospect Center search unit tests");
}

async function main() {
  console.log("=== Sprint 10.3 Prospect Center Verification ===\n");

  verifyUnitTests();

  const readModel = await buildProspectCenterReadModel();
  assert(Array.isArray(readModel.items), "Read model returns items array");
  assert(typeof readModel.totalCount === "number", "Read model includes totalCount");
  assert(Array.isArray(readModel.filters), "Read model includes filter counts");
  assert(readModel.filters.some((entry) => entry.id === "all"), "All filter present");

  if (readModel.items.length) {
    const first = readModel.items[0];
    assert(first.phone && first.canonicalMilestone, "Prospect row shape valid");
    assert(
      typeof first.missionControlPriority === "number",
      "Prospect row includes missionControlPriority"
    );
  }
  console.log(`✓ Prospect Center read model (${readModel.items.length} items)`);

  const filtered = await buildProspectCenterReadModel({
    filter: "high-priority"
  });
  const allowedPhones = new Set(
    resolveExecutiveFilterPhones(
      "high-priority",
      [],
      readModel.items.map((item) => ({
        phone: item.phone,
        missionControlPriority: item.missionControlPriority,
        missionControlPriorityTier: item.missionControlPriorityTier,
        canonicalMilestone: item.canonicalMilestone,
        stalledAt: item.stalledAt
      }))
    )
  );
  assert(
    filtered.items.every((item) => allowedPhones.has(item.phone)),
    "High-priority filter applies on read model"
  );
  console.log("✓ Executive filter on read model");

  const counts = buildExecutiveFilterCounts([], []);
  assert(counts.length >= 2, "Filter counts builder returns entries");
  console.log("✓ Executive filter counts");

  const app = createProspectCenterApp();
  const httpAll = await fetchProspectCenter(app);
  assert(httpAll.status === 200, `GET /api/prospect-center expected 200, got ${httpAll.status}`);
  assert(Array.isArray(httpAll.payload.items), "HTTP payload includes items");
  assert(httpAll.payload.generatedAt, "HTTP payload includes generatedAt");
  console.log("✓ Prospect Center HTTP route");

  const httpSearch = await fetchProspectCenter(app, "?q=br");
  assert(httpSearch.status === 200, "Search query returns 200");
  console.log("✓ Prospect Center search query");

  console.log("\n--- Sprint 10.2 regression ---");
  const { spawnSync } = require("child_process");
  const regression = spawnSync(process.execPath, ["backend/dev/verifySprint10_2.js"], {
    stdio: "inherit",
    env: process.env
  });
  assert(regression.status === 0, "Sprint 10.2 verification failed");
  console.log("✓ Sprint 10.2 regression passed");

  console.log("\n=== All Sprint 10.3 checks passed ===");
}

main().catch((error) => {
  console.error("\n✗", error.message);
  process.exit(1);
});
