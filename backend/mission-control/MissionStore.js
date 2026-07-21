/**
 * Release 1.4 — Mission Control persistence.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const STORE_FILE = path.join(__dirname, "../data/missionControl.json");

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
    states: {},
    snapshots: [],
    timeline: [],
    alerts: [],
    healthHistory: [],
    metricsHistory: [],
    analytics: createEmptyAnalytics()
  };
}

function createEmptyAnalytics() {
  return {
    alertsCreated: 0,
    alertsResolved: 0,
    conversationVolume: 0,
    workflowVolume: 0,
    connectorEvents: 0,
    packageEvents: 0,
    snapshotsCreated: 0,
    averageResponseLatencyMs: 0,
    responseSamples: 0,
    totalResponseLatencyMs: 0
  };
}

async function saveState(organizationId, state) {
  const store = readStore();
  store.states[organizationId] = state;
  writeStore(store);
  return state;
}

async function getState(organizationId) {
  return readStore().states[organizationId] || null;
}

async function saveSnapshot(snapshot) {
  const store = readStore();
  store.snapshots.unshift({
    id: crypto.randomUUID(),
    ...snapshot,
    timestamp: snapshot.timestamp || new Date().toISOString()
  });
  store.snapshots = store.snapshots.slice(0, 200);
  store.analytics.snapshotsCreated += 1;
  writeStore(store);
  return snapshot;
}

async function appendTimeline(entry) {
  const store = readStore();
  store.timeline.unshift({
    id: crypto.randomUUID(),
    ...entry,
    timestamp: entry.timestamp || new Date().toISOString()
  });
  store.timeline = store.timeline.slice(0, 500);
  writeStore(store);
  return entry;
}

async function saveAlert(alert) {
  const store = readStore();
  store.alerts.unshift({
    id: alert.id || crypto.randomUUID(),
    ...alert,
    createdAt: alert.createdAt || new Date().toISOString(),
    resolved: alert.resolved || false
  });
  store.alerts = store.alerts.slice(0, 200);
  store.analytics.alertsCreated += 1;
  writeStore(store);
  return alert;
}

async function resolveAlert(alertId) {
  const store = readStore();
  const alert = store.alerts.find((entry) => entry.id === alertId);

  if (!alert || alert.resolved) {
    return null;
  }

  alert.resolved = true;
  alert.resolvedAt = new Date().toISOString();
  store.analytics.alertsResolved += 1;
  writeStore(store);
  return alert;
}

async function appendHealthHistory(entry) {
  const store = readStore();
  store.healthHistory.unshift({
    id: crypto.randomUUID(),
    ...entry,
    timestamp: entry.timestamp || new Date().toISOString()
  });
  store.healthHistory = store.healthHistory.slice(0, 200);
  writeStore(store);
  return entry;
}

async function appendMetricsHistory(entry) {
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

async function updateAnalytics(patch) {
  const store = readStore();
  store.analytics = { ...store.analytics, ...patch };
  writeStore(store);
  return store.analytics;
}

async function recordResponseLatency(latencyMs) {
  const store = readStore();
  store.analytics.responseSamples += 1;
  store.analytics.totalResponseLatencyMs += latencyMs;
  store.analytics.averageResponseLatencyMs = Math.round(
    store.analytics.totalResponseLatencyMs / store.analytics.responseSamples
  );
  writeStore(store);
}

function clearStore() {
  writeStore(createEmptyStore());
}

module.exports = {
  saveState,
  getState,
  saveSnapshot,
  appendTimeline,
  saveAlert,
  resolveAlert,
  appendHealthHistory,
  appendMetricsHistory,
  updateAnalytics,
  recordResponseLatency,
  clearStore,
  readStore,
  createEmptyAnalytics
};
