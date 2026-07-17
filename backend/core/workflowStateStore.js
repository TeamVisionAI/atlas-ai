/**
 * Sprint 8A.1 — Workflow ownership and milestone persistence.
 * Stores per-prospect workflow state in backend/data/workflowState.json
 * (same pattern as agentActionState.json). Read/write only — no conversation side effects.
 */

const fs = require("fs");
const path = require("path");
const { OWNERSHIP, normalizeOwnership } = require("./workflowConstants");

const STATE_FILE = path.join(__dirname, "../data/workflowState.json");

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
    reconcileEpisodeKey: null
  };
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

function loadPersistedWorkflowState(phone) {
  if (!phone) {
    return defaultWorkflowRecord();
  }

  const store = readStore();
  const raw = store[phone] || {};
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
  const current = {
    ...defaultWorkflowRecord(),
    ...(store[phone] || {})
  };

  const next = {
    ...current,
    ...patch,
    workflowOwnership: patch.workflowOwnership
      ? normalizeOwnership(patch.workflowOwnership)
      : current.workflowOwnership
  };

  store[phone] = next;
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

  if (store[phone]) {
    delete store[phone];
    writeStore(store);
  }
}

module.exports = {
  defaultWorkflowRecord,
  loadPersistedWorkflowState,
  savePersistedWorkflowState,
  resolveWorkflowState,
  deletePersistedWorkflowState,
  OWNERSHIP
};
