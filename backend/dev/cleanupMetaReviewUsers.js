#!/usr/bin/env node
/**
 * One-time dev utility — retire historical Meta Review test accounts.
 *
 * Targets timestamped E2E orphans and ad-hoc debug users created before the
 * permanent automation account (meta-review-e2e@teamvisionfinancial.com).
 *
 * Run: node backend/dev/cleanupMetaReviewUsers.js
 * Dry run: node backend/dev/cleanupMetaReviewUsers.js --dry-run
 *
 * Does not modify production services. Preserves audit history — users that
 * cannot be deleted due to FK constraints are archived and sessions revoked.
 */

require("dotenv").config();

const { supabase } = require("../services/supabaseService");
const { revokeAllSessionsForUser } = require("../services/atlasUserService");
const identityWriteService = require("../services/identityWriteService");
const { USER_STATUSES } = require("../security/roles");
const { isMetaReviewModeEnabled } = require("../config/metaReviewMode");
const { REVIEW_USER_FLAG } = require("../services/metaReviewUserService");

const PRESERVED_EMAILS = new Set([
  "review@teamvisionfinancial.com",
  "support@teamvisionfinancial.com",
  "meta-review-e2e@teamvisionfinancial.com"
]);

const EMAIL_DOMAIN = "@teamvisionfinancial.com";

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isHistoricalTestEmail(email) {
  const normalized = normalizeEmail(email);

  if (!normalized.endsWith(EMAIL_DOMAIN) || PRESERVED_EMAILS.has(normalized)) {
    return false;
  }

  const localPart = normalized.slice(0, -EMAIL_DOMAIN.length);

  if (localPart.startsWith("meta-review-e2e-")) {
    return true;
  }

  if (localPart.startsWith("integrations-") || localPart.startsWith("debug-")) {
    return true;
  }

  return false;
}

async function listHistoricalTestUsers() {
  const { data, error } = await supabase
    .from("atlas_users")
    .select("id, email, status, profile_settings, created_at")
    .contains("profile_settings", { [REVIEW_USER_FLAG]: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data || []).filter((row) => isHistoricalTestEmail(row.email));
}

async function deleteUserRow(userId) {
  const { error: usersError } = await supabase.from("users").delete().eq("id", userId);

  if (usersError && usersError.code !== "42P01") {
    return { ok: false, reason: usersError.message, code: usersError.code };
  }

  const { error: atlasError } = await supabase.from("atlas_users").delete().eq("id", userId);

  if (atlasError) {
    return { ok: false, reason: atlasError.message, code: atlasError.code };
  }

  return { ok: true };
}

async function archiveUser(user) {
  const timestamp = new Date().toISOString();

  await identityWriteService.setUserStatus(user.id, USER_STATUSES.ARCHIVED, {
    archived_at: timestamp
  });

  return {
    ok: true,
    action: "archived",
    email: user.email,
    userId: user.id
  };
}

async function retireUser(user, { dryRun = false } = {}) {
  if (dryRun) {
    return { email: user.email, userId: user.id, action: "dry-run" };
  }

  await revokeAllSessionsForUser(user.id);

  const { error: sessionDeleteError } = await supabase
    .from("atlas_sessions")
    .delete()
    .eq("user_id", user.id);

  if (sessionDeleteError && sessionDeleteError.code !== "42P01") {
    console.warn(`[cleanup] session delete warning for ${user.email}:`, sessionDeleteError.message);
  }

  const deleted = await deleteUserRow(user.id);

  if (deleted.ok) {
    return { email: user.email, userId: user.id, action: "deleted" };
  }

  console.warn(
    `[cleanup] delete blocked for ${user.email} (${deleted.code || "error"}): ${deleted.reason} — archiving`
  );

  return archiveUser(user);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  if (!isMetaReviewModeEnabled()) {
    console.warn("[cleanup] META_REVIEW_MODE is not enabled — continuing anyway (dev utility).");
  }

  console.log(`Meta Review historical test user cleanup${dryRun ? " (dry run)" : ""}`);
  console.log("Preserved:", [...PRESERVED_EMAILS].join(", "));

  const candidates = await listHistoricalTestUsers();

  if (!candidates.length) {
    console.log("No historical test users found.");
    return;
  }

  console.log(`Found ${candidates.length} historical test user(s):`);
  for (const user of candidates) {
    console.log(`  - ${user.email} (${user.status}, ${user.id})`);
  }

  const results = [];

  for (const user of candidates) {
    const result = await retireUser(user, { dryRun });
    results.push(result);
    console.log(`${dryRun ? "WOULD" : "DONE"}: ${result.email} → ${result.action}`);
  }

  const deleted = results.filter((row) => row.action === "deleted").length;
  const archived = results.filter((row) => row.action === "archived").length;

  console.log("\nSummary:", {
    candidates: candidates.length,
    deleted,
    archived,
    dryRun
  });
}

main().catch((error) => {
  console.error("[cleanup] fatal:", error.message);
  process.exit(1);
});
