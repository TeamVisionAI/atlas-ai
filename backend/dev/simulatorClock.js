/**
 * Sprint 8A.4a — Simulated clock for dev workflow simulator.
 * When set, stall detection and time-based milestones use this instant instead of Date.now().
 */

let overrideMs = null;

function setSimulatedNow(isoOrMs) {
  if (isoOrMs === null || isoOrMs === undefined) {
    overrideMs = null;
    return null;
  }

  overrideMs = typeof isoOrMs === "number" ? isoOrMs : Date.parse(isoOrMs);

  if (Number.isNaN(overrideMs)) {
    overrideMs = null;
    throw new Error("Invalid simulated time value.");
  }

  return new Date(overrideMs).toISOString();
}

function clearSimulatedNow() {
  overrideMs = null;
}

function getSimulatedNowMs() {
  return overrideMs ?? Date.now();
}

function getSimulatedNowIso() {
  return new Date(getSimulatedNowMs()).toISOString();
}

function isSimulatedClockActive() {
  return overrideMs !== null;
}

module.exports = {
  setSimulatedNow,
  clearSimulatedNow,
  getSimulatedNowMs,
  getSimulatedNowIso,
  isSimulatedClockActive
};
