/**
 * Release 1.3 — Daily Brief persistence.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const STORE_FILE = path.join(__dirname, "../data/dailyBrief.json");

function readStore() {
  try {
    if (!fs.existsSync(STORE_FILE)) {
      return createEmptyStore();
    }

    return JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
  } catch {
    return createEmptyStore();
  }
}

function writeStore(store) {
  fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
  fs.writeFileSync(
    STORE_FILE,
    JSON.stringify({ ...store, updatedAt: new Date().toISOString() }, null, 2)
  );
}

function createEmptyStore() {
  return {
    briefs: {},
    snapshots: [],
    metricsHistory: [],
    generationHistory: [],
    analytics: createEmptyAnalytics()
  };
}

function createEmptyAnalytics() {
  return {
    briefsGenerated: 0,
    briefsFailed: 0,
    totalGenerationTimeMs: 0,
    averageGenerationTimeMs: 0,
    totalRecommendations: 0,
    totalInsights: 0,
    priorityDistribution: { high: 0, medium: 0, low: 0 }
  };
}

async function saveBrief(organizationId, brief) {
  const store = readStore();
  const key = `${organizationId}:${brief.date || brief.generatedAt?.slice(0, 10) || "latest"}`;

  store.briefs[key] = brief;
  store.generationHistory.unshift({
    id: crypto.randomUUID(),
    organizationId,
    briefId: brief.id,
    date: brief.date,
    generatedAt: brief.generatedAt,
    version: brief.version,
    generationTimeMs: brief.generationTimeMs || 0
  });
  store.generationHistory = store.generationHistory.slice(0, 200);

  store.analytics.briefsGenerated += 1;
  if (brief.generationTimeMs) {
    store.analytics.totalGenerationTimeMs += brief.generationTimeMs;
    store.analytics.averageGenerationTimeMs = Math.round(
      store.analytics.totalGenerationTimeMs / store.analytics.briefsGenerated
    );
  }

  if (Array.isArray(brief.recommendations)) {
    store.analytics.totalRecommendations += brief.recommendations.length;
  }

  if (Array.isArray(brief.insights)) {
    store.analytics.totalInsights += brief.insights.length;
  }

  for (const priority of brief.priorities || []) {
    const level = priority.level || "medium";
    if (store.analytics.priorityDistribution[level] !== undefined) {
      store.analytics.priorityDistribution[level] += 1;
    }
  }

  writeStore(store);
  return brief;
}

async function saveSnapshot(snapshot) {
  const store = readStore();
  store.snapshots.unshift({
    id: crypto.randomUUID(),
    ...snapshot,
    timestamp: snapshot.timestamp || new Date().toISOString()
  });
  store.snapshots = store.snapshots.slice(0, 200);
  writeStore(store);
  return snapshot;
}

async function saveMetricsHistory(entry) {
  const store = readStore();
  store.metricsHistory.unshift({
    id: crypto.randomUUID(),
    ...entry,
    timestamp: entry.timestamp || new Date().toISOString()
  });
  store.metricsHistory = store.metricsHistory.slice(0, 200);
  writeStore(store);
  return entry;
}

async function getBrief(organizationId, date) {
  const store = readStore();
  const key = date ? `${organizationId}:${date}` : `${organizationId}:latest`;
  return store.briefs[key] || null;
}

async function getLatestBrief(organizationId) {
  const store = readStore();
  const prefix = `${organizationId}:`;
  const keys = Object.keys(store.briefs)
    .filter((key) => key.startsWith(prefix))
    .sort()
    .reverse();

  return keys.length ? store.briefs[keys[0]] : null;
}

async function listMetricsHistory(organizationId, limit = 30) {
  return readStore()
    .metricsHistory.filter((entry) => entry.organizationId === organizationId)
    .slice(0, limit);
}

async function getAnalytics() {
  return readStore().analytics;
}

async function recordFailure() {
  const store = readStore();
  store.analytics.briefsFailed += 1;
  writeStore(store);
}

function clearStore() {
  writeStore(createEmptyStore());
}

module.exports = {
  saveBrief,
  saveSnapshot,
  saveMetricsHistory,
  getBrief,
  getLatestBrief,
  listMetricsHistory,
  getAnalytics,
  recordFailure,
  clearStore,
  readStore,
  createEmptyAnalytics
};
