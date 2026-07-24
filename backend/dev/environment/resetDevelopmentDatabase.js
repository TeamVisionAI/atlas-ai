#!/usr/bin/env node
/**
 * Sprint 15.4 — Reset development database while preserving schema.
 */

require("dotenv").config();

const { resetDevelopmentDatabase } = require("./databaseReset");

function hasConfirmFlag(argv) {
  return argv.includes("--confirm");
}

async function main() {
  const summary = await resetDevelopmentDatabase({ confirm: hasConfirmFlag(process.argv) });

  console.log("");
  console.log("Deleted rows (where reported):");
  for (const [table, count] of Object.entries(summary)) {
    console.log(`  ${table}: ${count}`);
  }

  console.log("");
  console.log("-------------------------------------");
  console.log("Development database reset complete");
  console.log("-------------------------------------");
}

if (require.main === module) {
  main().catch((error) => {
    console.error("resetDevelopmentDatabase failed:", error.message);
    console.error("Pass --confirm to proceed.");
    process.exit(1);
  });
}

module.exports = {
  resetDevelopmentDatabase
};
