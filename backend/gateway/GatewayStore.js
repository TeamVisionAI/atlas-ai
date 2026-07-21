/**
 * Journey #6 — Gateway persistence for replay, auditing, and troubleshooting.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const STORE_FILE = path.join(__dirname, "../data/gatewayStore.json");

function readStore() {
  try {
    if (!fs.existsSync(STORE_FILE)) {
      return { inbound: [], envelopes: [], outbound: [], errors: [] };
    }

    return JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
  } catch {
    return { inbound: [], envelopes: [], outbound: [], errors: [] };
  }
}

function writeStore(store) {
  fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
  fs.writeFileSync(
    STORE_FILE,
    JSON.stringify({ ...store, updatedAt: new Date().toISOString() }, null, 2)
  );
}

async function saveRawInbound({ channel, rawPayload, correlationId }) {
  const store = readStore();
  const record = {
    id: crypto.randomUUID(),
    channel,
    rawPayload,
    correlationId,
    timestamp: new Date().toISOString()
  };

  store.inbound.unshift(record);
  store.inbound = store.inbound.slice(0, 500);
  writeStore(store);
  return record;
}

async function saveEnvelope({ envelope, correlationId }) {
  const store = readStore();
  const record = {
    id: crypto.randomUUID(),
    envelope,
    correlationId,
    timestamp: new Date().toISOString()
  };

  store.envelopes.unshift(record);
  store.envelopes = store.envelopes.slice(0, 500);
  writeStore(store);
  return record;
}

async function saveOutbound({ envelope, responseText, deliveryStatus, correlationId }) {
  const store = readStore();
  const record = {
    id: crypto.randomUUID(),
    envelope,
    responseText,
    deliveryStatus,
    correlationId,
    timestamp: new Date().toISOString()
  };

  store.outbound.unshift(record);
  store.outbound = store.outbound.slice(0, 500);
  writeStore(store);
  return record;
}

async function saveError({ channel, rawPayload, error, correlationId }) {
  const store = readStore();
  const record = {
    id: crypto.randomUUID(),
    channel,
    rawPayload,
    error: error?.message || String(error),
    correlationId,
    timestamp: new Date().toISOString()
  };

  store.errors.unshift(record);
  store.errors = store.errors.slice(0, 200);
  writeStore(store);
  return record;
}

function clearStore() {
  writeStore({ inbound: [], envelopes: [], outbound: [], errors: [] });
}

module.exports = {
  saveRawInbound,
  saveEnvelope,
  saveOutbound,
  saveError,
  clearStore,
  readStore
};
