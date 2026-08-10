/**
 * Sprint 8A.1 — Workflow ownership and milestone persistence.
 * Stores per-prospect workflow state in backend/data/workflowState.json
 * (same pattern as agentActionState.json). Read/write only — no conversation side effects.
 */

const fs = require("fs");
const path = require("path");
const { OWNERSHIP, normalizeOwnership } = require("./workflowConstants");
const {
  normalizePhoneNumber,
  formatPhoneForStorage
} = require("./phoneNormalizer");

const STATE_FILE =
  process.env.ATLAS_WORKFLOW_STATE_FILE ||
  path.join(__dirname, "../data/workflowState.json");

function defaultWorkflowRecord() {
  return {
    /** Persisted override; null = derive from milestoneMapper on read. */
    canonicalMilestone: null,
    workflowOwnership: null,
    needsHumanAttention: false,
    stalledAt: null,
    /** ISO timestamp of last initialization from computed defaults. */
    initializedAt: null,
    /** BR-035 manual agent hold (BR-015 alignment). */
    manualAgentOwnership: false,
    doNotContact: false,
    /** Idempotency key for BR-034 stall episode (last Atlas outbound timestamp). */
    stallEpisodeKey: null,
    /** Sprint 8A.6 — idempotency key for time-based milestone reconciliation. */
    reconcileEpisodeKey: null,
    /** Conversations Center — persisted human handoff reason (pilot). */
    handoffReason: null,
    handoffAt: null,
    humanTakenOverAt: null,
    returnedToAtlasAt: null,
    /**
     * Conversations Center inbox soft state (presentation only).
     * Does not mutate appointments or overwrite interview outcomes.
     */
    inboxArchivedAt: null,
    inboxClosedAt: null,
    inboxCloseReason: null,
    inboxMarkedTestAt: null
  };
}

/**
 * Canonical storage key for ownership silence + TAKE OVER.
 * Prevents +E.164 vs digits-only vs space-mangled path params from splitting HUMAN state.
 */
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

  // Path-param "+" often arrives as leading space after decode.
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

function readStore() {
  try {
    if (!fs.existsSync(STATE_FILE)) {
      return {};
    }

    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function writeStore(store) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(store, null, 2));
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

function loadPersistedWorkflowState(phone) {
  if (!phone) {
    return defaultWorkflowRecord();
  }

  const store = readStore();
  const raw = resolveStoredRecord(store, phone);
  const normalized = {
    ...raw,
    workflowOwnership: raw.workflowOwnership
      ? normalizeOwnership(raw.workflowOwnership)
      : null
  };

  return {
    ...defaultWorkflowRecord(),
    ...normalized
  };
}

function savePersistedWorkflowState(phone, patch) {
  if (!phone) {
    return defaultWorkflowRecord();
  }

  const store = readStore();
  const key = workflowStateKey(phone) || String(phone).trim();
  const current = {
    ...defaultWorkflowRecord(),
    ...resolveStoredRecord(store, phone)
  };

  const next = {
    ...current,
    ...patch,
    workflowOwnership: patch.workflowOwnership
      ? normalizeOwnership(patch.workflowOwnership)
      : current.workflowOwnership
  };

  store[key] = next;

  // Collapse alias keys so inbound storagePhone (+E.164) always sees TAKE OVER.
  for (const alias of candidateWorkflowKeys(phone)) {
    if (alias !== key && store[alias]) {
      delete store[alias];
    }
  }

  writeStore(store);
  return next;
}

/**
 * Merge persisted state with computed defaults (read path).
 * Lazy-initializes storage on first access without changing conversation behavior.
 */
function resolveWorkflowState(phone, computed) {
  const persisted = loadPersistedWorkflowState(phone);

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
    savePersistedWorkflowState(phone, {
      canonicalMilestone,
      workflowOwnership,
      needsHumanAttention,
      stalledAt: persisted.stalledAt,
      initializedAt: new Date().toISOString(),
      manualAgentOwnership: persisted.manualAgentOwnership,
      doNotContact: persisted.doNotContact
    });
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

function deletePersistedWorkflowState(phone) {
  if (!phone) {
    return;
  }

  const store = readStore();
  let changed = false;

  for (const key of candidateWorkflowKeys(phone)) {
    if (store[key]) {
      delete store[key];
      changed = true;
    }
  }

  if (changed) {
    writeStore(store);
  }
}

module.exports = {
  defaultWorkflowRecord,
  workflowStateKey,
  candidateWorkflowKeys,
  loadPersistedWorkflowState,
  savePersistedWorkflowState,
  resolveWorkflowState,
  deletePersistedWorkflowState,
  OWNERSHIP
};
