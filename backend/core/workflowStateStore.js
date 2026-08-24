/**
 * Sprint 8A.1 + BR-135 — Workflow ownership / Conversations soft-state persistence.
 *
 * Production SoR: prospects.workflow_state JSONB (org + prospect scoped).
 * Local development may use an optional file backend when explicitly gated.
 * Production never uses ephemeral JSON as SoR.
 *
 * Soft Conversations Center inbox fields and HUMAN ownership fields must survive
 * unrelated patches and Railway deploy/restart.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { OWNERSHIP, normalizeOwnership } = require("./workflowConstants");
const {
  normalizePhoneNumber,
  formatPhoneForStorage
} = require("./phoneNormalizer");

const DEFAULT_STATE_FILE = path.join(__dirname, "../data/workflowState.json");

/** Soft inbox presentation fields — preserve unless patch explicitly sets them. */
const SOFT_INBOX_FIELDS = Object.freeze([
  "inboxArchivedAt",
  "inboxClosedAt",
  "inboxCloseReason",
  "inboxMarkedTestAt"
]);

/**
 * Conversations messaging unread cursor — not BR-080 / ownership / inbox lifecycle.
 */
const CONVERSATIONS_READ_CURSOR_FIELDS = Object.freeze([
  "conversationsLastReadInboundAt",
  "conversationsLastSeenInboundMessageId"
]);

/**
 * Phase 1 durable runtime fields (BR-135).
 * doNotContact excluded — not competing with other DNC sources in Phase 1.
 */
const DURABLE_RUNTIME_FIELDS = Object.freeze([
  ...SOFT_INBOX_FIELDS,
  ...CONVERSATIONS_READ_CURSOR_FIELDS,
  "workflowOwnership",
  "manualAgentOwnership",
  "needsHumanAttention",
  "handoffReason",
  "handoffAt",
  "humanTakenOverAt",
  "returnedToAtlasAt",
  "returnToAtlasResumeKey",
  "returnToAtlasResumeLastError",
  "returnToAtlasResumeLastAttemptAt",
  "atlasAutomationEnabled",
  "atlasEligibilitySource"
]);

/** In-memory backend for tests / restart simulation. */
const memoryStores = new Map();

function getStateFile() {
  return process.env.ATLAS_WORKFLOW_STATE_FILE || DEFAULT_STATE_FILE;
}

function isProductionRuntime(env = process.env) {
  return String(env.NODE_ENV || "").toLowerCase() === "production";
}

/**
 * database = durable JSONB (default in production)
 * memory = process map (tests)
 * file = local JSON only when NOT production
 */
function resolveWorkflowStateBackend(env = process.env) {
  const explicit = String(env.ATLAS_WORKFLOW_STATE_BACKEND || "")
    .trim()
    .toLowerCase();
  if (explicit === "database" || explicit === "memory" || explicit === "file") {
    if (explicit === "file" && isProductionRuntime(env)) {
      const error = new Error(
        "ATLAS_WORKFLOW_STATE_BACKEND=file is forbidden in production (BR-135)"
      );
      error.code = "WORKFLOW_STATE_EPHEMERAL_FORBIDDEN";
      throw error;
    }
    return explicit;
  }
  return isProductionRuntime(env) ? "database" : "file";
}

function defaultWorkflowRecord() {
  return {
    canonicalMilestone: null,
    workflowOwnership: null,
    needsHumanAttention: false,
    stalledAt: null,
    initializedAt: null,
    manualAgentOwnership: false,
    doNotContact: false,
    stallEpisodeKey: null,
    reconcileEpisodeKey: null,
    handoffReason: null,
    handoffAt: null,
    humanTakenOverAt: null,
    returnedToAtlasAt: null,
    returnToAtlasResumeKey: null,
    returnToAtlasResumeLastError: null,
    returnToAtlasResumeLastAttemptAt: null,
    inboxArchivedAt: null,
    inboxClosedAt: null,
    inboxCloseReason: null,
    inboxMarkedTestAt: null,
    conversationsLastReadInboundAt: null,
    conversationsLastSeenInboundMessageId: null,
    atlasAutomationEnabled: null,
    atlasEligibilitySource: null
  };
}

function workflowStateKey(phone) {
  const raw = String(phone || "").trim();
  if (!raw) {
    return null;
  }
  const normalized = normalizePhoneNumber(raw);
  if (normalized) {
    return formatPhoneForStorage(normalized);
  }
  return raw;
}

function candidateWorkflowKeys(phone) {
  const keys = new Set();
  const raw = String(phone || "").trim();
  if (raw) {
    keys.add(raw);
  }
  const repaired = raw.replace(/^\s+/, "+");
  if (repaired && repaired !== raw) {
    keys.add(repaired);
  }
  const digits = raw.replace(/\D/g, "");
  if (digits) {
    keys.add(digits);
    keys.add(`+${digits}`);
  }
  const canonical = workflowStateKey(phone);
  if (canonical) {
    keys.add(canonical);
  }
  return [...keys];
}

function readFileStore() {
  try {
    const file = getStateFile();
    if (!fs.existsSync(file)) {
      return {};
    }
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function writeFileStore(store) {
  const file = getStateFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, file);
}

function resolveStoredRecord(store, phone) {
  let merged = {};
  for (const key of candidateWorkflowKeys(phone)) {
    const row = store[key];
    if (row && typeof row === "object") {
      merged = { ...merged, ...row };
    }
  }
  return merged;
}

function sanitizeWorkflowPatch(patch = {}) {
  const clean = {};
  for (const [key, value] of Object.entries(patch || {})) {
    if (value !== undefined) {
      clean[key] = value;
    }
  }
  return clean;
}

function preserveDurableRuntimeFields(baseRecord, cleanPatch, next) {
  const out = { ...next };
  for (const field of DURABLE_RUNTIME_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(cleanPatch, field)) {
      if (field === "needsHumanAttention" || field === "manualAgentOwnership") {
        out[field] = Boolean(baseRecord[field]);
      } else if (field === "workflowOwnership") {
        out[field] = baseRecord[field] || null;
      } else {
        out[field] = baseRecord[field] ?? null;
      }
    }
  }
  return out;
}

/** Backward-compatible alias used by existing preserve tests. */
function preserveSoftInboxFields(baseRecord, cleanPatch, next) {
  const out = { ...next };
  for (const field of SOFT_INBOX_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(cleanPatch, field)) {
      out[field] = baseRecord[field] ?? null;
    }
  }
  return out;
}

function normalizeRecord(raw = {}) {
  return {
    ...defaultWorkflowRecord(),
    ...raw,
    workflowOwnership: raw.workflowOwnership
      ? normalizeOwnership(raw.workflowOwnership)
      : null,
    needsHumanAttention: Boolean(raw.needsHumanAttention),
    manualAgentOwnership: Boolean(raw.manualAgentOwnership),
    doNotContact: Boolean(raw.doNotContact),
    atlasAutomationEnabled:
      raw.atlasAutomationEnabled === true
        ? true
        : raw.atlasAutomationEnabled === false
          ? false
          : null,
    atlasEligibilitySource: raw.atlasEligibilitySource
      ? String(raw.atlasEligibilitySource).trim().toUpperCase()
      : null
  };
}

function mergePatchIntoCurrent(current, cleanPatch) {
  let next = {
    ...current,
    ...cleanPatch,
    workflowOwnership: Object.prototype.hasOwnProperty.call(
      cleanPatch,
      "workflowOwnership"
    )
      ? cleanPatch.workflowOwnership
        ? normalizeOwnership(cleanPatch.workflowOwnership)
        : null
      : current.workflowOwnership,
    needsHumanAttention: Object.prototype.hasOwnProperty.call(
      cleanPatch,
      "needsHumanAttention"
    )
      ? Boolean(cleanPatch.needsHumanAttention)
      : Boolean(current.needsHumanAttention),
    manualAgentOwnership: Object.prototype.hasOwnProperty.call(
      cleanPatch,
      "manualAgentOwnership"
    )
      ? Boolean(cleanPatch.manualAgentOwnership)
      : Boolean(current.manualAgentOwnership)
  };
  next = preserveDurableRuntimeFields(current, cleanPatch, next);
  return normalizeRecord(next);
}

function memoryBucketKey() {
  return process.env.ATLAS_WORKFLOW_STATE_MEMORY_KEY || "default";
}

function getMemoryStore() {
  const key = memoryBucketKey();
  if (!memoryStores.has(key)) {
    memoryStores.set(key, new Map());
  }
  return memoryStores.get(key);
}

function clearMemoryWorkflowStateStore() {
  getMemoryStore().clear();
}

async function loadFromMemory(phone) {
  const store = getMemoryStore();
  for (const key of candidateWorkflowKeys(phone)) {
    if (store.has(key)) {
      return normalizeRecord(store.get(key));
    }
  }
  return defaultWorkflowRecord();
}

async function saveToMemory(phone, next) {
  const store = getMemoryStore();
  const key = workflowStateKey(phone) || String(phone).trim();
  for (const alias of candidateWorkflowKeys(phone)) {
    store.delete(alias);
  }
  store.set(key, next);
  return next;
}

async function loadFromFile(phone) {
  const store = readFileStore();
  return normalizeRecord(resolveStoredRecord(store, phone));
}

async function saveToFile(phone, next) {
  const key = workflowStateKey(phone) || String(phone).trim();
  const latestStore = readFileStore();
  latestStore[key] = next;
  for (const alias of candidateWorkflowKeys(phone)) {
    if (alias !== key && latestStore[alias]) {
      delete latestStore[alias];
    }
  }
  writeFileStore(latestStore);
  return next;
}

async function loadFromDatabase(phone, options = {}) {
  const {
    resolveProspectForWorkflowState,
    readWorkflowStateFromProspect
  } = require("./workflowStateDurableRepository");

  const prospect = await resolveProspectForWorkflowState({
    phone,
    organizationId: options.organizationId || null,
    prospectId: options.prospectId || null,
    findProspectByIdFn: options.findProspectByIdFn || null,
    findProspectInOrganizationFn: options.findProspectInOrganizationFn || null,
    findProspectFn: options.findProspectFn || null
  });

  if (!prospect?.id || !prospect.organization_id) {
    // Unknown prospect — empty defaults (not a silent file fallback).
    return defaultWorkflowRecord();
  }

  if (
    options.organizationId &&
    String(prospect.organization_id) !== String(options.organizationId)
  ) {
    const error = new Error("Workflow state org mismatch");
    error.code = "WORKFLOW_STATE_ORG_MISMATCH";
    throw error;
  }

  const raw = await readWorkflowStateFromProspect(prospect);
  return normalizeRecord(raw || {});
}

function normalizePatchForDatabase(cleanPatch = {}) {
  const patch = { ...cleanPatch };
  if (Object.prototype.hasOwnProperty.call(patch, "workflowOwnership")) {
    patch.workflowOwnership = patch.workflowOwnership
      ? normalizeOwnership(patch.workflowOwnership)
      : null;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "needsHumanAttention")) {
    patch.needsHumanAttention = Boolean(patch.needsHumanAttention);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "manualAgentOwnership")) {
    patch.manualAgentOwnership = Boolean(patch.manualAgentOwnership);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "doNotContact")) {
    patch.doNotContact = Boolean(patch.doNotContact);
  }
  return patch;
}

async function saveToDatabase(phone, next, options = {}) {
  const {
    resolveProspectForWorkflowState,
    writeWorkflowStateToProspect
  } = require("./workflowStateDurableRepository");

  const prospect = await resolveProspectForWorkflowState({
    phone,
    organizationId: options.organizationId || null,
    prospectId: options.prospectId || null,
    findProspectByIdFn: options.findProspectByIdFn || null,
    findProspectInOrganizationFn: options.findProspectInOrganizationFn || null,
    findProspectFn: options.findProspectFn || null
  });

  if (!prospect?.id || !prospect.organization_id) {
    const error = new Error(
      "Cannot persist workflow state without org-scoped prospect"
    );
    error.code = "WORKFLOW_STATE_PROSPECT_NOT_FOUND";
    throw error;
  }

  if (
    options.organizationId &&
    String(prospect.organization_id) !== String(options.organizationId)
  ) {
    const error = new Error("Workflow state org mismatch");
    error.code = "WORKFLOW_STATE_ORG_MISMATCH";
    throw error;
  }

  const cleanPatch = options._cleanPatch || {};

  // Wipe / explicit full replace only (deletePersistedWorkflowState).
  if (options._replaceEntireState === true) {
    const finalState = normalizeRecord(next);
    await writeWorkflowStateToProspect({
      prospectId: prospect.id,
      organizationId: prospect.organization_id,
      nextState: finalState,
      mode: "replace",
      supabaseClient: options.supabaseClient || null
    });
    return finalState;
  }

  // Concurrent-safe: only patched keys are written via DB-side JSONB || merge.
  const patch = normalizePatchForDatabase(cleanPatch);
  if (Object.keys(patch).length === 0) {
    return normalizeRecord(prospect.workflow_state || next || {});
  }

  const written = await writeWorkflowStateToProspect({
    prospectId: prospect.id,
    organizationId: prospect.organization_id,
    patch,
    mode: "merge",
    supabaseClient: options.supabaseClient || null
  });

  return normalizeRecord(written?.workflow_state || {});
}

/**
 * @param {string} phone
 * @param {{ organizationId?: string, prospectId?: string, backend?: string }} [options]
 */
/**
 * Read workflow_state from an already-loaded prospect row (no extra DB round-trip).
 * Use for inbox list batching when prospects were loaded via org query.
 */
function workflowStateFromProspectRow(prospect = null) {
  if (!prospect?.id || !prospect?.organization_id) {
    return defaultWorkflowRecord();
  }

  const raw = prospect.workflow_state;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return defaultWorkflowRecord();
  }

  return normalizeRecord({ ...raw });
}

async function loadPersistedWorkflowState(phone, options = {}) {
  if (!phone) {
    return defaultWorkflowRecord();
  }

  const backend = options.backend || resolveWorkflowStateBackend();

  if (backend === "memory") {
    return loadFromMemory(phone);
  }
  if (backend === "file") {
    return loadFromFile(phone);
  }
  if (backend === "database") {
    return loadFromDatabase(phone, options);
  }

  const error = new Error(`Unknown workflow state backend: ${backend}`);
  error.code = "WORKFLOW_STATE_BACKEND_INVALID";
  throw error;
}

/**
 * @param {string} phone
 * @param {object} patch
 * @param {{ organizationId?: string, prospectId?: string, backend?: string }} [options]
 */
async function savePersistedWorkflowState(phone, patch, options = {}) {
  if (!phone) {
    return defaultWorkflowRecord();
  }

  const cleanPatch = sanitizeWorkflowPatch(patch);
  const backend = options.backend || resolveWorkflowStateBackend();
  const current = await loadPersistedWorkflowState(phone, options);
  let next = mergePatchIntoCurrent(current, cleanPatch);

  // Second pass for file/memory: re-load before write.
  if (backend === "file" || backend === "memory") {
    const latest = await loadPersistedWorkflowState(phone, options);
    next = preserveDurableRuntimeFields(latest, cleanPatch, next);
    next = normalizeRecord(next);
    if (backend === "memory") {
      return saveToMemory(phone, next);
    }
    return saveToFile(phone, next);
  }

  if (backend === "database") {
    return saveToDatabase(phone, next, { ...options, _cleanPatch: cleanPatch });
  }

  const error = new Error(`Unknown workflow state backend: ${backend}`);
  error.code = "WORKFLOW_STATE_BACKEND_INVALID";
  throw error;
}

async function resolveWorkflowState(phone, computed, options = {}) {
  const persisted = await loadPersistedWorkflowState(phone, options);

  const canonicalMilestone =
    persisted.canonicalMilestone || computed.canonicalMilestone;

  const workflowOwnership =
    persisted.workflowOwnership || computed.workflowOwnership;

  const needsHumanAttention =
    persisted.needsHumanAttention || computed.needsHumanAttention;

  const shouldInitialize =
    !persisted.initializedAt &&
    phone &&
    canonicalMilestone &&
    workflowOwnership;

  if (shouldInitialize) {
    await savePersistedWorkflowState(
      phone,
      {
        canonicalMilestone,
        workflowOwnership,
        needsHumanAttention,
        stalledAt: persisted.stalledAt,
        initializedAt: new Date().toISOString(),
        manualAgentOwnership: persisted.manualAgentOwnership,
        doNotContact: persisted.doNotContact
      },
      options
    );
  }

  return {
    canonicalMilestone,
    workflowOwnership,
    needsHumanAttention,
    stalledAt: persisted.stalledAt || null,
    source: {
      milestone: persisted.canonicalMilestone ? "persisted" : "computed",
      ownership: persisted.workflowOwnership ? "persisted" : "computed"
    },
    mappedFrom: computed.mappedFrom
  };
}

async function deletePersistedWorkflowState(phone, options = {}) {
  if (!phone) {
    return;
  }

  const backend = options.backend || resolveWorkflowStateBackend();

  if (backend === "memory") {
    const store = getMemoryStore();
    for (const key of candidateWorkflowKeys(phone)) {
      store.delete(key);
    }
    return;
  }

  if (backend === "file") {
    const store = readFileStore();
    let changed = false;
    for (const key of candidateWorkflowKeys(phone)) {
      if (store[key]) {
        delete store[key];
        changed = true;
      }
    }
    if (changed) {
      writeFileStore(store);
    }
    return;
  }

  if (backend === "database") {
    const empty = defaultWorkflowRecord();
    await saveToDatabase(phone, empty, {
      ...options,
      _cleanPatch: empty,
      _replaceEntireState: true
    });
  }
}

module.exports = {
  SOFT_INBOX_FIELDS,
  CONVERSATIONS_READ_CURSOR_FIELDS,
  DURABLE_RUNTIME_FIELDS,
  defaultWorkflowRecord,
  sanitizeWorkflowPatch,
  preserveSoftInboxFields,
  preserveDurableRuntimeFields,
  workflowStateKey,
  candidateWorkflowKeys,
  resolveWorkflowStateBackend,
  isProductionRuntime,
  clearMemoryWorkflowStateStore,
  workflowStateFromProspectRow,
  loadPersistedWorkflowState,
  savePersistedWorkflowState,
  resolveWorkflowState,
  deletePersistedWorkflowState,
  OWNERSHIP
};
