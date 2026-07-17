/**
 * Sprint 8A.4a — Marks execution context as simulator-safe (blocks external I/O).
 */

const { AsyncLocalStorage } = require("async_hooks");

const storage = new AsyncLocalStorage();

function isSimulatorActive() {
  return storage.getStore()?.active === true;
}

function shouldMockExternalComms() {
  const store = storage.getStore();
  if (!store?.active) {
    return false;
  }

  return store.mockExternal !== false;
}

/**
 * Runs fn with simulator guard — WhatsApp/calendar return mocked success.
 */
async function withSimulatorGuard(fn, options = {}) {
  return storage.run(
    {
      active: true,
      mockExternal: options.mockExternal !== false
    },
    fn
  );
}

module.exports = {
  isSimulatorActive,
  shouldMockExternalComms,
  withSimulatorGuard
};
