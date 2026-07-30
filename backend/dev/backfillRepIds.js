#!/usr/bin/env node
/**
 * Sprint 12.1 — Safe Rep ID backfill helper.
 *
 * Strategy:
 * 1. Migration 017 adds nullable rep_id — existing users continue email login.
 * 2. Admins assign Rep IDs manually (this script) until Phase 2 UI exists.
 * 3. All writes go through identityWriteService for atlas_users + users dual-write.
 *
 * Usage:
 *   node backend/dev/backfillRepIds.js --report
 *   node backend/dev/backfillRepIds.js --set <userId> <repId>
 *   node backend/dev/backfillRepIds.js --set <userId> <repId> --apply
 *
 * Without --apply, --set runs as a dry-run validation only.
 */

require("dotenv").config();

const { supabase } = require("../services/supabaseService");
const identityWriteService = require("../services/identityWriteService");
const { normalizeRepId } = require("../core/repIdEngine");

function parseArgs(argv) {
  const args = {
    report: argv.includes("--report"),
    apply: argv.includes("--apply"),
    setUserId: null,
    setRepId: null
  };

  const setIndex = argv.indexOf("--set");

  if (setIndex !== -1) {
    args.setUserId = argv[setIndex + 1] || null;
    args.setRepId = argv[setIndex + 2] || null;
  }

  return args;
}

async function fetchUsers() {
  const { data, error } = await supabase
    .from("atlas_users")
    .select("id, email, first_name, last_name, organization_id, role, status, rep_id")
    .order("email", { ascending: true });

  if (error) {
    throw error;
  }

  return data || [];
}

async function reportMissingRepIds() {
  const users = await fetchUsers();
  const missing = users.filter((user) => !user.rep_id);
  const assigned = users.filter((user) => user.rep_id);

  console.log("=== Rep ID Backfill Report ===\n");
  console.log(`Total users:          ${users.length}`);
  console.log(`With Rep ID:          ${assigned.length}`);
  console.log(`Missing Rep ID:       ${missing.length}\n`);

  if (assigned.length) {
    console.log("Assigned:");
    for (const user of assigned) {
      console.log(`  ${user.rep_id}  ${user.email}  (${user.id})`);
    }
    console.log("");
  }

  if (missing.length) {
    console.log("Missing (safe to continue on email login):");
    for (const user of missing) {
      console.log(`  ${user.email}  org=${user.organization_id}  (${user.id})`);
    }
    console.log("");
  }

  console.log("Next step: assign with --set <userId> <repId> --apply");
}

async function setRepId(userId, repId, apply) {
  const normalizedRepId = normalizeRepId(repId);
  const users = await fetchUsers();
  const target = users.find((user) => String(user.id) === String(userId));

  if (!target) {
    throw new Error(`User not found: ${userId}`);
  }

  const conflict = users.find(
    (user) =>
      user.rep_id === normalizedRepId &&
      String(user.organization_id) === String(target.organization_id) &&
      String(user.id) !== String(userId)
  );

  if (conflict) {
    throw new Error(
      `Rep ID ${normalizedRepId} is already assigned to ${conflict.email} in this organization.`
    );
  }

  console.log("=== Rep ID Assignment ===\n");
  console.log(`User:     ${target.email} (${target.id})`);
  console.log(`Org:      ${target.organization_id}`);
  console.log(`Rep ID:   ${normalizedRepId}`);
  console.log(`Mode:     ${apply ? "APPLY" : "DRY RUN"}\n`);

  if (!apply) {
    console.log("Re-run with --apply to persist via identityWriteService.");
    return;
  }

  const updated = await identityWriteService.updateUser(userId, { rep_id: normalizedRepId });
  console.log(`✓ Updated ${updated.email} → rep_id=${updated.rep_id}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.report) {
    await reportMissingRepIds();
    return;
  }

  if (args.setUserId && args.setRepId) {
    await setRepId(args.setUserId, args.setRepId, args.apply);
    return;
  }

  console.log(`Usage:
  node backend/dev/backfillRepIds.js --report
  node backend/dev/backfillRepIds.js --set <userId> <repId> [--apply]`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
