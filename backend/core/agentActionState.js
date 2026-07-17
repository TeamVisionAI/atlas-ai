const fs = require("fs");
const path = require("path");

const STATE_FILE = path.join(__dirname, "../data/agentActionState.json");

function defaultAgentState() {
  return {
    flags: {
      zoom_link_sent: false,
      office_location_sent: false,
      missed_appointment_sent: false
    },
    agentNotes: [],
    outcome: null,
    closureReason: null,
    futureReminder: null,
    followUpDate: null,
    followUpTime: null,
    orientationScheduled: false,
    onboardingUnlocked: false
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

function loadAgentState(phone) {
  if (!phone) {
    return defaultAgentState();
  }

  const store = readStore();
  return {
    ...defaultAgentState(),
    ...(store[phone] || {})
  };
}

function saveAgentState(phone, state) {
  const store = readStore();
  store[phone] = {
    ...defaultAgentState(),
    ...state
  };
  writeStore(store);
  return store[phone];
}

function mergeAgentState(phone, patch) {
  const current = loadAgentState(phone);
  const next = {
    ...current,
    ...patch,
    flags: {
      ...current.flags,
      ...(patch.flags || {})
    }
  };

  return saveAgentState(phone, next);
}

function clearResourceFlags(phone) {
  return mergeAgentState(phone, {
    flags: {
      zoom_link_sent: false,
      office_location_sent: false,
      missed_appointment_sent: false
    }
  });
}

function deleteAgentState(phone) {
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
  defaultAgentState,
  loadAgentState,
  saveAgentState,
  mergeAgentState,
  clearResourceFlags,
  deleteAgentState
};
