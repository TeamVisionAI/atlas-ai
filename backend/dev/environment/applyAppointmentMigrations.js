#!/usr/bin/env node
/**
 * Sprint 12.5.6 — Apply appointment migrations (013 + 018 + 019) to Supabase.
 */

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { withPostgresTransaction } = require("./databaseConnection");

const MIGRATIONS_DIR = path.join(__dirname, "../../database/migrations");
const APPOINTMENT_MIGRATIONS = [
  "013_atlas_appointments.sql",
  "018_appointment_owner_rep_id.sql",
  "019_atlas_appointments_baseline_repair.sql"
];

function loadSql(fileName) {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, fileName), "utf8");
}

async function applyAppointmentMigrations() {
  const applied = [];

  await withPostgresTransaction(async (client) => {
    for (const file of APPOINTMENT_MIGRATIONS) {
      console.log(`Applying ${file}`);
      await client.query(loadSql(file));
      applied.push(file);
    }
  });

  return applied;
}

async function main() {
  const applied = await applyAppointmentMigrations();
  console.log(JSON.stringify({ applied }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error("[applyAppointmentMigrations]", error.message);
    process.exit(1);
  });
}

module.exports = { applyAppointmentMigrations, APPOINTMENT_MIGRATIONS };
