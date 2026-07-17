/**
 * Sprint 8A.4a — Enforces sim- phone prefix for workflow simulator mutations.
 */

const {
  SIMULATOR_PHONE_PREFIX,
  isSimulatorProspect
} = require("../core/productionProspectFilter");

function isSimulatorPhone(phone) {
  return isSimulatorProspect(phone);
}

function assertSimulatorPhone(phone) {
  if (!isSimulatorPhone(phone)) {
    const error = new Error(
      `Simulator only allows phones with prefix "${SIMULATOR_PHONE_PREFIX}". Received: ${phone}`
    );
    error.code = "SIM_PHONE_REQUIRED";
    throw error;
  }
}

function createSimulatorPhone(suffix = "") {
  const token = suffix || `${Date.now()}`;
  return `${SIMULATOR_PHONE_PREFIX}${token}`.replace(/[^a-zA-Z0-9-_]/g, "-");
}

module.exports = {
  SIM_PHONE_PREFIX: SIMULATOR_PHONE_PREFIX,
  isSimulatorPhone,
  assertSimulatorPhone,
  createSimulatorPhone
};
