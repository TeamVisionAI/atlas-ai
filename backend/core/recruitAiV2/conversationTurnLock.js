/**
 * BR-237 — One Recruit V2 decision pipeline per organizationId + prospectId.
 * Production: leased Postgres row (survives multiple Railway instances).
 * Tests / missing table: in-process queue (same keying rules).
 */

"use strict";

const crypto = require("crypto");
const { logWhatsAppStage } = require("../whatsappStructuredLogger");

const DEFAULT_TTL_MS = 45_000;
const DEFAULT_WAIT_MS = 40_000;
const POLL_MS = 50;

const memoryQueues = new Map();

function lockKey(organizationId, prospectId) {
  const org = String(organizationId || "").trim();
  const prospect = String(prospectId || "").trim();
  if (!org || !prospect) {
    return null;
  }
  return `${org}::${prospect}`;
}

function resolveLockBackend(env = process.env) {
  const explicit = String(env.ATLAS_CONVERSATION_TURN_LOCK_BACKEND || "")
    .trim()
    .toLowerCase();
  if (explicit === "memory" || explicit === "postgres") {
    return explicit;
  }
  if (
    String(env.NODE_ENV || "").toLowerCase() === "production" &&
    String(env.SUPABASE_URL || "").trim()
  ) {
    return "postgres";
  }
  return "memory";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withMemoryLock(key, fn) {
  const previous = memoryQueues.get(key) || Promise.resolve();
  let release = () => {};
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const next = previous.catch(() => {}).then(() => gate);
  memoryQueues.set(key, next);
  await previous.catch(() => {});
  try {
    return await fn();
  } finally {
    release();
  }
}

function resolveSupabaseClient(dependencies = {}) {
  if (dependencies.supabase) {
    return dependencies.supabase;
  }
  try {
    const { getServiceRoleClient } = require("../../services/backendDbService");
    return getServiceRoleClient();
  } catch {
    return null;
  }
}

async function tryAcquirePostgresLock({
  supabase,
  organizationId,
  prospectId,
  lockToken,
  ttlMs,
  providerMessageId
}) {
  const { data, error } = await supabase.rpc("acquire_atlas_conversation_turn_lock", {
    p_organization_id: organizationId,
    p_prospect_id: prospectId,
    p_lock_token: lockToken,
    p_ttl_ms: ttlMs,
    p_provider_message_id: providerMessageId || null
  });
  if (error) {
    const code = String(error.code || error.message || "");
    if (/does not exist|42P01|42883/i.test(code)) {
      return { acquired: false, missing: true, reason: "LOCK_STORE_MISSING" };
    }
    return { acquired: false, reason: error.message || "LOCK_ACQUIRE_FAILED" };
  }
  const row = data && typeof data === "object" ? data : {};
  return {
    acquired: row.acquired === true,
    reason: row.reason || null,
    lockToken: row.lockToken || lockToken,
    expiresAt: row.expiresAt || null
  };
}

async function releasePostgresLock({
  supabase,
  organizationId,
  prospectId,
  lockToken
}) {
  try {
    await supabase.rpc("release_atlas_conversation_turn_lock", {
      p_organization_id: organizationId,
      p_prospect_id: prospectId,
      p_lock_token: lockToken
    });
  } catch {
    // Best-effort release; lease expiry is the deadlock backstop.
  }
}

async function withPostgresLock(args, fn) {
  const {
    organizationId,
    prospectId,
    providerMessageId = null,
    ttlMs = DEFAULT_TTL_MS,
    waitMs = DEFAULT_WAIT_MS,
    dependencies = {}
  } = args;
  const supabase = resolveSupabaseClient(dependencies);
  if (!supabase) {
    logWhatsAppStage("recruit_ai_v2_turn_lock_fallback_memory", {
      level: "warn",
      organizationId,
      prospectId,
      reason: "SUPABASE_UNAVAILABLE"
    });
    return withMemoryLock(lockKey(organizationId, prospectId), fn);
  }

  const lockToken = crypto.randomUUID();
  const deadline = Date.now() + waitMs;
  let acquired = false;
  let missingStore = false;

  while (Date.now() <= deadline) {
    const attempt = await tryAcquirePostgresLock({
      supabase,
      organizationId,
      prospectId,
      lockToken,
      ttlMs,
      providerMessageId
    });
    if (attempt.missing) {
      missingStore = true;
      break;
    }
    if (attempt.acquired) {
      acquired = true;
      break;
    }
    await sleep(POLL_MS);
  }

  if (missingStore) {
    logWhatsAppStage("recruit_ai_v2_turn_lock_fallback_memory", {
      level: "warn",
      organizationId,
      prospectId,
      reason: "LOCK_STORE_MISSING"
    });
    return withMemoryLock(lockKey(organizationId, prospectId), fn);
  }

  if (!acquired) {
    logWhatsAppStage("recruit_ai_v2_turn_lock_wait_elapsed", {
      level: "warn",
      organizationId,
      prospectId,
      providerMessageId
    });
    return fn();
  }

  try {
    return await fn();
  } finally {
    await releasePostgresLock({
      supabase,
      organizationId,
      prospectId,
      lockToken
    });
  }
}

/**
 * Serialize one conversation turn. Missing org/prospect skips the lock
 * (last-meter still applies). Never locks an organization globally.
 */
async function withConversationTurnLock(args = {}, fn) {
  const organizationId =
    args.organizationId || args.organization_id || null;
  const prospectId = args.prospectId || args.prospect_id || null;
  const key = lockKey(organizationId, prospectId);
  if (!key || typeof fn !== "function") {
    return fn();
  }

  const backend = resolveLockBackend(args.env || process.env);
  if (backend === "memory") {
    return withMemoryLock(key, fn);
  }
  return withPostgresLock(
    {
      organizationId,
      prospectId,
      providerMessageId: args.providerMessageId || null,
      ttlMs: args.ttlMs,
      waitMs: args.waitMs,
      dependencies: args.dependencies || {}
    },
    fn
  );
}

function resetConversationTurnLocksForTests() {
  memoryQueues.clear();
}

module.exports = {
  DEFAULT_TTL_MS,
  DEFAULT_WAIT_MS,
  lockKey,
  resolveLockBackend,
  withConversationTurnLock,
  resetConversationTurnLocksForTests
};
