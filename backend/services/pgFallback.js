/**
 * Postgres fallback for platform operations when Supabase service role is unavailable.
 * Uses the same DATABASE_URL path as migration tooling.
 */

require("dotenv").config();

const { withPostgresTransaction } = require("../dev/environment/databaseConnection");

async function pgQuery(sql, params = []) {
  return withPostgresTransaction(async (client) => {
    const { rows } = await client.query(sql, params);
    return rows;
  });
}

async function pgQueryOne(sql, params = []) {
  const rows = await pgQuery(sql, params);
  return rows[0] || null;
}

function isPgFallbackEnabled() {
  if (process.env.NODE_ENV === "production") {
    return false;
  }

  return (
    !process.env.SUPABASE_SERVICE_ROLE_KEY &&
    (Boolean(process.env.DATABASE_URL) ||
      (Boolean(process.env.SUPABASE_DB_PASSWORD) && Boolean(process.env.SUPABASE_URL)))
  );
}

module.exports = {
  pgQuery,
  pgQueryOne,
  isPgFallbackEnabled,
  withPostgresTransaction
};
