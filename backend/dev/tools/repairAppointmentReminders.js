/**
 * BR-191 — repair missing WhatsApp reminder jobs for active future appointments.
 * Tenant-scoped. Does not send past reminders. Does not duplicate existing jobs.
 *
 * Usage:
 *   node backend/dev/tools/repairAppointmentReminders.js --organization-id <uuid>
 */

"use strict";

require("dotenv").config();

const { repairMissingReminders } = require("../../services/appointmentReminderEngine");

function readOrgId(argv) {
  const flag = argv.indexOf("--organization-id");
  if (flag >= 0 && argv[flag + 1]) {
    return String(argv[flag + 1]).trim();
  }
  return String(process.env.ORGANIZATION_ID || "").trim();
}

async function main() {
  const organizationId = readOrgId(process.argv);
  if (!organizationId) {
    console.error("organization-id is required");
    process.exit(1);
  }

  const report = await repairMissingReminders({ organizationId });
  console.log(
    JSON.stringify(
      {
        organizationId: report.organizationId,
        scanned: report.scanned,
        repaired: report.repaired,
        created: report.results.reduce((sum, row) => sum + (row.createdCount || 0), 0)
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
