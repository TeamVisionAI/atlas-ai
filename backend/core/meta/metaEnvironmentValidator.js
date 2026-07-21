/**
 * Sprint 6.1 — Meta Embedded Signup environment validation.
 */

const { metaLogger } = require("./metaLogger");

const SERVER_ENV_RULES = Object.freeze([
  { key: "META_APP_ID", required: true },
  { key: "META_APP_SECRET", required: true, secret: true },
  { key: "META_EMBEDDED_SIGNUP_CONFIG_ID", required: false, recommended: true },
  { key: "META_GRAPH_API_VERSION", required: false, defaultValue: "v21.0" },
  { key: "META_TOKEN_ENCRYPTION_KEY", required: false, recommended: true },
  { key: "VERIFY_TOKEN", required: false, recommended: true },
  { key: "WHATSAPP_ACCESS_TOKEN", required: false, recommended: true },
  { key: "WHATSAPP_PHONE_NUMBER_ID", required: false, recommended: true },
  { key: "MESSENGER_PAGE_ACCESS_TOKEN", required: false, recommended: true },
  { key: "MESSENGER_PAGE_ID", required: false, recommended: true }
]);

function isPresent(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateMetaEmbeddedSignupEnvironment(options = {}) {
  const strict = Boolean(options.strict);
  const missing = [];
  const warnings = [];

  for (const rule of SERVER_ENV_RULES) {
    const value = process.env[rule.key];

    if (rule.required && !isPresent(value)) {
      missing.push(rule.key);
      continue;
    }

    if (rule.recommended && !isPresent(value)) {
      warnings.push(`${rule.key} is not set (recommended).`);
    }
  }

  const valid = missing.length === 0;

  if (!valid && strict) {
    const error = new Error(`Missing required Meta environment variables: ${missing.join(", ")}`);
    error.code = "META_ENV_INVALID";
    error.missing = missing;
    throw error;
  }

  return {
    valid,
    missing,
    warnings
  };
}

function logMetaEnvironmentWarnings() {
  const result = validateMetaEmbeddedSignupEnvironment({ strict: false });

  for (const warning of result.warnings) {
    metaLogger.warn("env_validation_warning", { message: warning });
  }

  if (result.missing.length) {
    metaLogger.warn("env_validation_missing", {
      missing: result.missing,
      message: "Embedded signup exchange will fail until required Meta env vars are configured."
    });
  }

  return result;
}

module.exports = {
  SERVER_ENV_RULES,
  validateMetaEmbeddedSignupEnvironment,
  logMetaEnvironmentWarnings
};
