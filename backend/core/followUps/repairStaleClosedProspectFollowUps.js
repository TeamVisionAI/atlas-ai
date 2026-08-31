/**
 * BR-192 — plan/apply cancel of OPEN follow-ups whose prospect is already terminal.
 * Preserves completed/cancelled history. Skips BR-178 recycle rows
 * (source_event = outcome:not_interested) so an intentional future reminder stays.
 *
 * Dry-run by default. Tenant-scoped. Does not print phones or names.
 */

const { FOLLOW_UP_STATUSES } = require("./constants");
const { isTerminalFollowUpMilestone, resolveFollowUpCloseReason } = require("./prospectClosePolicy");
const { MILESTONES } = require("../workflowConstants");

const RECYCLE_SOURCE_EVENT = "outcome:not_interested";

function prospectLooksTerminal(prospect = {}) {
  const milestone = String(
    prospect.workflow_state?.canonicalMilestone || prospect.canonicalMilestone || ""
  ).toUpperCase();
  const step = String(prospect.current_step || "").toUpperCase();
  if (isTerminalFollowUpMilestone(milestone) || milestone === MILESTONES.CLOSED) {
    return true;
  }
  if (step === "CLOSED" || step === "DO_NOT_CONTACT") {
    return true;
  }
  if (prospect.workflow_state?.doNotContact === true || prospect.doNotContact === true) {
    return true;
  }
  return false;
}

function closeReasonForProspect(prospect = {}) {
  return resolveFollowUpCloseReason({
    targetMilestone:
      prospect.workflow_state?.canonicalMilestone ||
      (String(prospect.current_step || "").toUpperCase() === "DO_NOT_CONTACT"
        ? MILESTONES.DO_NOT_CONTACT
        : MILESTONES.CLOSED),
    outcome: prospect.outcome || prospect.workflow_state?.outcome || null
  });
}

async function planStaleFollowUpRepair({
  organizationId,
  listOpenFollowUps,
  loadProspect
} = {}) {
  if (!organizationId) {
    throw new Error("organizationId is required");
  }
  const open = (await listOpenFollowUps(organizationId)) || [];
  const report = {
    organizationId,
    scanned: open.length,
    stale: [],
    keptRecycle: [],
    skipped: []
  };

  for (const row of open) {
    if (row.status !== FOLLOW_UP_STATUSES.OPEN) {
      report.skipped.push({ id: row.id, reason: "not_open" });
      continue;
    }
    const prospect = await loadProspect({
      organizationId,
      prospectId: row.entityType === "prospect" ? row.entityId : null,
      subjectPhone: row.subjectPhone || (row.entityType === "prospect" ? row.entityId : null)
    });
    if (!prospect) {
      report.skipped.push({ id: row.id, reason: "prospect_not_found" });
      continue;
    }
    if (!prospectLooksTerminal(prospect)) {
      report.skipped.push({ id: row.id, reason: "prospect_not_terminal" });
      continue;
    }
    if (String(row.sourceEvent || "") === RECYCLE_SOURCE_EVENT) {
      report.keptRecycle.push({ id: row.id, reason: "br178_recycle" });
      continue;
    }
    report.stale.push({
      id: row.id,
      closeReason: closeReasonForProspect(prospect)
    });
  }

  return report;
}

async function applyStaleFollowUpRepair(report, { cancelOpenById } = {}) {
  if (!report || !Array.isArray(report.stale)) {
    return { applied: 0 };
  }
  let applied = 0;
  for (const item of report.stale) {
    await cancelOpenById(item.id, item.closeReason);
    applied += 1;
  }
  return { applied };
}

module.exports = {
  RECYCLE_SOURCE_EVENT,
  prospectLooksTerminal,
  closeReasonForProspect,
  planStaleFollowUpRepair,
  applyStaleFollowUpRepair
};
