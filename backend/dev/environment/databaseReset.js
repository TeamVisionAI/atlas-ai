/**
 * Sprint 15.4 — Development database reset helpers.
 * Clears Atlas Core demo data while preserving schema and auth seed users.
 */

require("dotenv").config();

const { supabase } = require("../../services/supabaseService");
const { MissionControlRepository } = require("../../modules/mission-control/infrastructure/MissionControlRepository");
const { ExecutiveDashboardRepository } = require("../../modules/executive-dashboard/infrastructure/ExecutiveDashboardRepository");
const { DEV_TABLES } = require("./constants");

async function assertAtlasCoreTablesReady() {
  const requiredTables = [
    DEV_TABLES.coreProspects,
    DEV_TABLES.businessEvents,
    DEV_TABLES.timelineEntries,
    DEV_TABLES.missionControlState,
    DEV_TABLES.executiveState
  ];

  for (const tableName of requiredTables) {
    const { error } = await supabase.from(tableName).select("*").limit(1);

    if (error && isMissingTable(error, tableName)) {
      throw new Error(
        `Atlas Core table "${tableName}" was not found. Apply backend/database/migrations/003-007 in Supabase before using development environment tooling.`
      );
    }

    if (error) {
      throw new Error(`Unable to access ${tableName}: ${error.message}`);
    }
  }
}

function assertSafeEnvironment() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to reset database while NODE_ENV=production.");
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY are required.");
  }
}

function isMissingTable(error, tableName) {
  if (!error) {
    return false;
  }

  return (
    error.code === "42P01" ||
    String(error.message || "").includes(tableName) ||
    String(error.message || "").includes("does not exist")
  );
}

async function deleteAllRows(tableName, idColumn = "id") {
  const sentinel =
    idColumn === "organization_id"
      ? "00000000-0000-0000-0000-000000000000"
      : "00000000-0000-0000-0000-000000000000";

  const { error, count } = await supabase
    .from(tableName)
    .delete({ count: "exact" })
    .neq(idColumn, sentinel);

  if (error && !isMissingTable(error, tableName)) {
    throw new Error(`Failed to clear ${tableName}: ${error.message}`);
  }

  return count ?? 0;
}

/**
 * Ordered reset steps. Supabase REST does not expose multi-table SQL transactions;
 * we treat this as a logical transaction and abort on the first failure.
 */
async function resetDevelopmentDatabase({ confirm = false } = {}) {
  assertSafeEnvironment();

  if (!confirm) {
    throw new Error("Refusing to reset without confirm: true or --confirm flag.");
  }

  await assertAtlasCoreTablesReady();

  const missionControlRepository = new MissionControlRepository();
  const executiveDashboardRepository = new ExecutiveDashboardRepository();
  const summary = {};

  const steps = [
    {
      name: "missionControlRepository.clear()",
      run: async () => {
        await missionControlRepository.clear();
      }
    },
    {
      name: DEV_TABLES.missionControlProspects,
      run: async () => {
        summary[DEV_TABLES.missionControlProspects] = await deleteAllRows(
          DEV_TABLES.missionControlProspects,
          "prospect_id"
        );
      }
    },
    {
      name: "executiveDashboardRepository.clear()",
      run: async () => {
        await executiveDashboardRepository.clear();
      }
    },
    {
      name: DEV_TABLES.timelineEntries,
      run: async () => {
        summary[DEV_TABLES.timelineEntries] = await deleteAllRows(DEV_TABLES.timelineEntries);
      }
    },
    {
      name: DEV_TABLES.businessEvents,
      run: async () => {
        summary[DEV_TABLES.businessEvents] = await deleteAllRows(DEV_TABLES.businessEvents);
      }
    },
    {
      name: DEV_TABLES.coreProspects,
      run: async () => {
        summary[DEV_TABLES.coreProspects] = await deleteAllRows(DEV_TABLES.coreProspects);
      }
    },
    {
      name: DEV_TABLES.conversationLogs,
      run: async () => {
        summary[DEV_TABLES.conversationLogs] = await deleteAllRows(DEV_TABLES.conversationLogs);
      }
    },
    {
      name: DEV_TABLES.workflowEvents,
      run: async () => {
        summary[DEV_TABLES.workflowEvents] = await deleteAllRows(DEV_TABLES.workflowEvents);
      }
    },
    {
      name: DEV_TABLES.legacyProspects,
      run: async () => {
        summary[DEV_TABLES.legacyProspects] = await deleteAllRows(DEV_TABLES.legacyProspects, "phone");
      }
    }
  ];

  for (const step of steps) {
    await step.run();
  }

  return summary;
}

module.exports = {
  assertSafeEnvironment,
  assertAtlasCoreTablesReady,
  resetDevelopmentDatabase,
  deleteAllRows
};
