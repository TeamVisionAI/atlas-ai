#!/usr/bin/env node
/**
 * Sprint 19 — Verify atlas_users and users remain consistent.
 * Run: node backend/dev/verifyIdentityConsistency.js [--repair]
 */

require("dotenv").config();

const identityWriteService = require("../services/identityWriteService");

function parseArgs(argv) {
  return {
    repair: argv.includes("--repair")
  };
}

function printDriftReport(result) {
  console.log("=== Identity Consistency Report ===\n");
  console.log(`atlas_users rows: ${result.atlasCount}`);
  console.log(`users rows:       ${result.usersCount}`);
  console.log(`drift entries:    ${result.drift.length}`);
  console.log(`consistent:       ${result.consistent ? "yes" : "no"}\n`);

  if (!result.drift.length) {
    console.log("✓ No drift detected between atlas_users and users.");
    return;
  }

  for (const entry of result.drift) {
    console.log(`- ${entry.email || entry.userId} (${entry.userId})`);

    for (const issue of entry.issues) {
      console.log(
        `    ${issue.field}: atlas=${JSON.stringify(issue.atlas)} users=${JSON.stringify(issue.users)}`
      );
    }
  }
}

async function main() {
  const { repair } = parseArgs(process.argv);

  if (repair) {
    console.log("Repairing users table from atlas_users source of truth...\n");
    const repairResult = await identityWriteService.repairIdentityFromAtlas();
    console.log(`Repaired rows: ${repairResult.repaired}\n`);
  }

  const result = await identityWriteService.verifyIdentityConsistency();
  printDriftReport(result);

  if (!result.consistent) {
    console.error("\n✗ Identity drift detected.");
    console.error("Run with --repair to sync users from atlas_users, then re-check.");
    process.exit(1);
  }

  console.log("\n=== Identity consistency check passed ===");
}

main().catch((error) => {
  console.error("\n✗ FAIL:", error.message);
  process.exit(1);
});
