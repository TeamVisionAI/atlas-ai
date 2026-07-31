#!/usr/bin/env node
/**
 * Sprint 12.5.6 — One-time legacy interview appointment repair utility.
 *
 * Usage:
 *   node backend/dev/repairLegacyInterviewAppointments.js --dry-run --phone=+17862509432 --organization-id=<uuid>
 *   node backend/dev/repairLegacyInterviewAppointments.js --phone=+17862509432 --organization-id=<uuid>
 *   node backend/dev/repairLegacyInterviewAppointments.js --all --organization-id=<uuid> --dry-run
 */

require("dotenv").config();

const { DEFAULT_ORGANIZATION_ID } = require("../modules/prospects/domain/constants");
const { runLegacyInterviewRepair } = require("../application/legacyInterviewRepairService");

function parseArgs(argv) {
  const options = {
    dryRun: argv.includes("--dry-run"),
    all: argv.includes("--all"),
    phone: null,
    organizationId: process.env.ATLAS_DEFAULT_ORGANIZATION_ID || DEFAULT_ORGANIZATION_ID,
    repairActorId: null,
    fallbackAgentId: "00000000-0000-4000-8000-000000000002"
  };

  argv.forEach((arg) => {
    if (arg.startsWith("--phone=")) {
      options.phone = arg.slice("--phone=".length);
    }

    if (arg.startsWith("--organization-id=")) {
      options.organizationId = arg.slice("--organization-id=".length);
    }

    if (arg.startsWith("--repair-actor-id=")) {
      options.repairActorId = arg.slice("--repair-actor-id=".length);
    }
  });

  if (!options.all && !options.phone) {
    throw new Error("Provide --phone=<phone> or --all.");
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await runLegacyInterviewRepair(options);

  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error("[legacy-interview-repair]", error.message);
    process.exit(1);
  });
}

module.exports = { parseArgs };
