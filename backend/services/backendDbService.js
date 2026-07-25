/**
 * Server-side database access that bypasses RLS.
 * Uses Supabase service role when configured, otherwise direct Postgres in development.
 * Frontend clients remain subject to RLS via anon/authenticated roles.
 */

const { createClient } = require("@supabase/supabase-js");
const { isPgFallbackEnabled, pgQueryOne } = require("./pgFallback");

const ALLOWED_INSERT_TABLES = new Set([
  "atlas_audit_log",
  "atlas_login_history"
]);

let serviceRoleClient = null;

function getServiceRoleClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!key || !process.env.SUPABASE_URL) {
    return null;
  }

  if (!serviceRoleClient) {
    serviceRoleClient = createClient(process.env.SUPABASE_URL, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }

  return serviceRoleClient;
}

function assertAllowedTable(table) {
  if (!ALLOWED_INSERT_TABLES.has(table)) {
    throw new Error(`Backend insert not allowed for table: ${table}`);
  }
}

async function insertBackendRow(table, payload, { returning = "id, created_at" } = {}) {
  assertAllowedTable(table);

  const serviceClient = getServiceRoleClient();

  if (serviceClient) {
    const { data, error } = await serviceClient
      .from(table)
      .insert(payload)
      .select(returning)
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  if (isPgFallbackEnabled()) {
    const columns = Object.keys(payload);
    const values = Object.values(payload);
    const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
    const sql = `
      INSERT INTO ${table} (${columns.join(", ")})
      VALUES (${placeholders})
      RETURNING ${returning}
    `;

    return pgQueryOne(sql, values);
  }

  const error = new Error(
    `Backend insert to ${table} requires SUPABASE_SERVICE_ROLE_KEY or DATABASE_URL (development pg fallback).`
  );
  error.code = "BACKEND_DB_PRIVILEGES_MISSING";
  throw error;
}

module.exports = {
  getServiceRoleClient,
  insertBackendRow
};
