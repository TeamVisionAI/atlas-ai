/**
 * Sprint 15.5 — Resolve Postgres connection for dev migration tooling.
 * Requires DATABASE_URL or SUPABASE_DB_PASSWORD + SUPABASE_URL.
 */

require("dotenv").config();

const { Client } = require("pg");

function extractProjectRef(supabaseUrl) {
  if (!supabaseUrl) {
    return null;
  }

  try {
    return new URL(supabaseUrl).hostname.split(".")[0];
  } catch {
    return null;
  }
}

function buildCandidateUrls() {
  if (process.env.DATABASE_URL) {
    return [process.env.DATABASE_URL];
  }

  const password = process.env.SUPABASE_DB_PASSWORD;
  const projectRef = extractProjectRef(process.env.SUPABASE_URL);

  if (!password || !projectRef) {
    return [];
  }

  const encodedPassword = encodeURIComponent(password);
  const regions = [
    "us-east-1",
    "us-west-1",
    "eu-west-1",
    "ap-southeast-1",
    "sa-east-1"
  ];

  const candidates = [
    `postgresql://postgres:${encodedPassword}@db.${projectRef}.supabase.co:5432/postgres`
  ];

  for (const region of regions) {
    candidates.push(
      `postgresql://postgres.${projectRef}:${encodedPassword}@aws-0-${region}.pooler.supabase.com:6543/postgres`
    );
  }

  return candidates;
}

async function connectPostgres() {
  const candidates = buildCandidateUrls();

  if (!candidates.length) {
    throw new Error(
      "Database connection required. Set DATABASE_URL or SUPABASE_DB_PASSWORD with SUPABASE_URL."
    );
  }

  let lastError;

  for (const connectionString of candidates) {
    const client = new Client({
      connectionString,
      ssl: { rejectUnauthorized: false }
    });

    try {
      await client.connect();
      return client;
    } catch (error) {
      lastError = error;
      await client.end().catch(() => {});
    }
  }

  throw new Error(`Unable to connect to Supabase Postgres: ${lastError?.message || "unknown error"}`);
}

async function withPostgresTransaction(runner) {
  const client = await connectPostgres();

  try {
    await client.query("BEGIN");
    const result = await runner(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end().catch(() => {});
  }
}

module.exports = {
  buildCandidateUrls,
  connectPostgres,
  withPostgresTransaction
};
