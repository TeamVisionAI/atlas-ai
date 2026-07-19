/**
 * Sprint 6.1 — Structured logger abstraction for Meta onboarding / WhatsApp connection.
 */

function createMetaLogger(component = "meta_onboarding") {
  function write(level, stage, details = {}) {
    const entry = {
      ts: new Date().toISOString(),
      component,
      stage,
      level,
      ...details
    };

    const serialized = JSON.stringify(entry);

    if (level === "error") {
      console.error(serialized);
      return;
    }

    if (level === "warn") {
      console.warn(serialized);
      return;
    }

    console.log(serialized);
  }

  return {
    info(stage, details) {
      write("info", stage, details);
    },
    warn(stage, details) {
      write("warn", stage, details);
    },
    error(stage, details) {
      write("error", stage, details);
    },
    child(childComponent) {
      return createMetaLogger(`${component}:${childComponent}`);
    }
  };
}

const metaLogger = createMetaLogger("meta_onboarding");

module.exports = {
  createMetaLogger,
  metaLogger
};
