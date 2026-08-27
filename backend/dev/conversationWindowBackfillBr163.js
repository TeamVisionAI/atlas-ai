/**
 * BR-163 — Audit / apply 24h window archives. Fail closed on null organization_id.
 * Usage:
 *   node backend/dev/conversationWindowBackfillBr163.js
 *   node backend/dev/conversationWindowBackfillBr163.js --apply
 */

require("dotenv").config({ quiet: true });

const { supabase } = require("../services/supabaseService");
const {
  evaluateWindowFromLogs,
  shouldPersistWindowExpiredArchive,
  persistWindowExpiredArchive
} = require("../core/conversationsCenter/conversationWindowInboxEngine");
const {
  INBOX_LIFECYCLE,
  resolveInboxLifecycle,
  isTestProspect
} = require("../core/conversationsCenter/conversationsCenterLifecycle");
const { workflowStateFromProspectRow } = require("../core/workflowStateStore");

const APPLY = process.argv.includes("--apply");

async function loadProspects() {
  const { data, error } = await supabase
    .from("prospects")
    .select("id, phone, name, organization_id, source, entry_method, workflow_state");
  if (error) {
    throw error;
  }
  return data || [];
}

async function loadInboundLogs(organizationId, phones) {
  if (!organizationId || !phones.length) {
    return [];
  }
  const rows = [];
  for (let index = 0; index < phones.length; index += 100) {
    const chunk = phones.slice(index, index + 100);
    const { data, error } = await supabase
      .from("conversation_logs")
      .select("prospect_phone, direction, message, intent, pipeline, created_at, organization_id")
      .eq("organization_id", organizationId)
      .in("prospect_phone", chunk);
    if (error) {
      throw error;
    }
    rows.push(...(data || []));
  }
  return rows;
}

function logsForPhone(rows, phone) {
  return (rows || []).filter((row) => row.prospect_phone === phone);
}

async function main() {
  const prospects = await loadProspects();
  const byOrg = new Map();
  let nullOrg = 0;

  for (const prospect of prospects) {
    const orgId = String(prospect.organization_id || "").trim();
    if (!orgId) {
      nullOrg += 1;
      continue;
    }
    if (!byOrg.has(orgId)) {
      byOrg.set(orgId, []);
    }
    byOrg.get(orgId).push(prospect);
  }

  const summary = [];
  let applyCount = 0;

  for (const [organizationId, rows] of byOrg.entries()) {
    const phones = rows.map((row) => row.phone).filter(Boolean);
    const logs = await loadInboundLogs(organizationId, phones);
    let active = 0;
    let alreadyArchived = 0;
    let expiredActive = 0;
    let skippedTest = 0;
    let skippedClosed = 0;
    const expiredPhones = [];

    for (const prospect of rows) {
      const persisted = workflowStateFromProspectRow(prospect);
      if (isTestProspect(prospect, persisted)) {
        skippedTest += 1;
        continue;
      }
      if (persisted.inboxClosedAt || persisted.inboxMarkedTestAt) {
        skippedClosed += 1;
        continue;
      }
      if (persisted.inboxArchivedAt) {
        alreadyArchived += 1;
        continue;
      }
      const windowEval = evaluateWindowFromLogs(logsForPhone(logs, prospect.phone));
      const lifecycle = resolveInboxLifecycle({
        prospect,
        persisted,
        customerCareWindow: windowEval
      });
      if (lifecycle.lifecycle === INBOX_LIFECYCLE.SCHEDULED) {
        continue;
      }
      if (lifecycle.lifecycle !== INBOX_LIFECYCLE.ARCHIVED) {
        active += 1;
        continue;
      }
      active += 1;
      if (
        shouldPersistWindowExpiredArchive({
          persisted,
          customerCareWindow: windowEval
        })
      ) {
        expiredActive += 1;
        expiredPhones.push(prospect.phone);
        if (APPLY) {
          await persistWindowExpiredArchive({
            phone: prospect.phone,
            organizationId,
            prospectId: prospect.id || null
          });
          applyCount += 1;
        }
      }
    }

    summary.push({
      organizationId,
      prospects: rows.length,
      activeUnarchived: active,
      alreadyArchived,
      expiredActiveOutside24h: expiredActive,
      skippedTest,
      skippedClosed,
      sampleExpiredPhones: expiredPhones.slice(0, 8)
    });
  }

  const payload = {
    apply: APPLY,
    generatedAt: new Date().toISOString(),
    nullOrganizationRows: nullOrg,
    applied: applyCount,
    tenants: summary
  };
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
