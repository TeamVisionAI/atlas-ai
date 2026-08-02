/**
 * Parse common truthy/falsey environment variable strings.
 */

function parseEnvBoolean(value, { defaultValue = false } = {}) {
  if (value === undefined || value === null) {
    return defaultValue;
  }

  const normalized = String(value).trim().toLowerCase();

  if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on") {
    return true;
  }

  if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") {
    return false;
  }

  return defaultValue;
}

module.exports = {
  parseEnvBoolean
};
