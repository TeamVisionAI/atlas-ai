#!/usr/bin/env node
/**
 * Reset Atlas to bootstrap-ready state (zero users, no setup completion marker).
 * Development / installation verification only.
 */

require("dotenv").config();

const { withPostgresTransaction } = require("../environment/databaseConnection");

function assertDevelopmentOnly() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("resetForBootstrap is disabled in production.");
  }
}

async function resetForBootstrap() {
  assertDevelopmentOnly();

  await withPostgresTransaction(async (client) => {
    await client.query("DELETE FROM atlas_sessions");
    await client.query("DELETE FROM atlas_password_reset_tokens");
    await client.query("DELETE FROM atlas_invitation_tokens");
    await client.query("DELETE FROM atlas_platform_settings WHERE key = 'setup_completed_at'");

    await client.query(`
      UPDATE atlas_core_prospects
      SET assigned_agent_id = NULL, owner_user_id = NULL
      WHERE assigned_agent_id IS NOT NULL OR owner_user_id IS NOT NULL
    `);

    await client.query(`
      UPDATE prospects
      SET owner_user_id = NULL, created_by_user_id = NULL
      WHERE owner_user_id IS NOT NULL OR created_by_user_id IS NOT NULL
    `);

    await client.query("UPDATE organizations SET owner_user_id = NULL WHERE owner_user_id IS NOT NULL");
    await client.query("DELETE FROM atlas_users");
  });

  console.log("Bootstrap reset complete — atlas_users is empty and setup marker cleared.");
}

if (require.main === module) {
  resetForBootstrap().catch((error) => {
    console.error("resetForBootstrap failed:", error.message);
    process.exit(1);
  });
}

module.exports = { resetForBootstrap };
