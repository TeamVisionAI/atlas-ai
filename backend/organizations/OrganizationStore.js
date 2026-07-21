/**
 * Release 1.2 — Organization Console persistence.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const STORE_FILE = path.join(__dirname, "../data/organizationConsole.json");

function readStore() {
  try {
    if (!fs.existsSync(STORE_FILE)) {
      return {
        organizations: {},
        validationHistory: [],
        configurationHistory: [],
        analytics: createEmptyAnalytics()
      };
    }

    return JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
  } catch {
    return {
      organizations: {},
      validationHistory: [],
      configurationHistory: [],
      analytics: createEmptyAnalytics()
    };
  }
}

function writeStore(store) {
  fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
  fs.writeFileSync(
    STORE_FILE,
    JSON.stringify({ ...store, updatedAt: new Date().toISOString() }, null, 2)
  );
}

function createEmptyAnalytics() {
  return {
    organizations: 0,
    activePackages: 0,
    enabledConnectors: 0,
    offices: 0,
    users: 0,
    languages: 0,
    configurationVersions: 0,
    validationResults: 0
  };
}

async function saveOrganization(record) {
  const store = readStore();
  store.organizations[record.id] = record;
  writeStore(store);
  return record;
}

async function getOrganization(organizationId) {
  return readStore().organizations[organizationId] || null;
}

async function deleteOrganization(organizationId) {
  const store = readStore();

  if (!store.organizations[organizationId]) {
    return false;
  }

  delete store.organizations[organizationId];
  writeStore(store);
  return true;
}

async function listOrganizations() {
  return Object.values(readStore().organizations);
}

async function appendValidationResult(result) {
  const store = readStore();
  store.validationHistory.unshift({
    id: crypto.randomUUID(),
    ...result,
    timestamp: new Date().toISOString()
  });
  store.validationHistory = store.validationHistory.slice(0, 200);
  store.analytics.validationResults += 1;
  writeStore(store);
}

async function appendConfigurationHistory(entry) {
  const store = readStore();
  store.configurationHistory.unshift({
    id: crypto.randomUUID(),
    ...entry,
    timestamp: new Date().toISOString()
  });
  store.configurationHistory = store.configurationHistory.slice(0, 200);
  store.analytics.configurationVersions += 1;
  writeStore(store);
}

async function updateAnalytics(patch) {
  const store = readStore();
  store.analytics = { ...store.analytics, ...patch };
  writeStore(store);
  return store.analytics;
}

function clearStore() {
  writeStore({
    organizations: {},
    validationHistory: [],
    configurationHistory: [],
    analytics: createEmptyAnalytics()
  });
}

module.exports = {
  saveOrganization,
  getOrganization,
  deleteOrganization,
  listOrganizations,
  appendValidationResult,
  appendConfigurationHistory,
  updateAnalytics,
  clearStore,
  readStore,
  createEmptyAnalytics
};
