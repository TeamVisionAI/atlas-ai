/**
 * BR-192 — dry-run / apply cancel of OPEN follow-ups whose prospect is already terminal.
 * Tenant-scoped. Does not print phones, names, or emails.
 *
 * Usage:
 *   node backend/dev/tools/repairStaleFollowUpsForClosedProspects.js --organization-id <uuid>
 *   node backend/dev/tools/repairStaleFollowUpsForClosedProspects.js --organization-id <uuid> --apply
 */

"use strict";

require("dotenv").config();

const { supabase } = require("../../services/supabaseService");
const followUpRepository = require("../../repositories/followUpRepository");
const followUpApplicationService = require("../../application/followUpApplicationService");
const {
  planStaleFollowUpRepair,
  applyStaleFollowUpRepair
} = require("../../core/followUps/repairStaleClosedProspectFollowUps");

function readArg(argv, flag) {
  const index = argv.indexOf(flag);
  if (index >= 0 && argv[index + 1]) {
    return String(argv[index + 1]).trim();
  }
  return "";
}

async function loadProspect({ organizationId, prospectId, subjectPhone }) {
  if (prospectId && /^[0-9a-f-]{36}$/i.test(prospectId)) {
    const byId = await supabase
      .from("prospects")
      .select("id, phone, current_step, workflow_state")
      .eq("organization_id", organizationId)
      .eq("id", prospectId)
      .maybeSingle();
    if (byId.error) {
      throw byId.error;
    }
    if (byId.data) {
      return byId.data;
    }
  }
  if (!subjectPhone) {
    return null;
  }
  const byPhone = await supabase
    .from("prospects")
    .select("id, phone, current_step, workflow_state")
    .eq("organization_id", organizationId)
    .eq("phone", subjectPhone)
    .maybeSingle();
  if (byPhone.error) {
    throw byPhone.error;
  }
  return byPhone.data || null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const organizationId =
    readArg(process.argv, "--organization-id") || String(process.env.ORGANIZATION_ID || "").trim();
  if (!organizationId) {
    console.error("organization-id is required");
    process.exit(1);
  }

  const report = await planStaleFollowUpRepair({
    organizationId,
    listOpenFollowUps: async (orgId) =>
      followUpRepository.listForOwners({ organizationId: orgId, statuses: ["OPEN"] }),
    loadProspect
  });

  let applied = 0;
  if (apply && report.stale.length) {
    const result = await applyStaleFollowUpRepair(report, {
      cancelOpenById: async (id, closeReason) => {
        const row = await followUpRepository.findById(id, organizationId);
        if (!row) {
          return;
        }
        return followUpApplicationService.cancelOpenFollowUpsForClosedProspect({
          organizationId,
          prospectId: row.entityType === "prospect" ? row.entityId : null,
          subjectPhone: row.subjectPhone || null,
          actorUserId: "system",
          closeReason
        });
      }
    });
    applied = result.applied;
  }

  console.log(
    JSON.stringify(
      {
        organizationId,
        apply,
        scanned: report.scanned,
        stale: report.stale.length,
        keptRecycle: report.keptRecycle.length,
        skipped: report.skipped.length,
        applied
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
