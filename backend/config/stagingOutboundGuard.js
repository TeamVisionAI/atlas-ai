/**
 * Single staging outbound communication guard.
 * Default FALSE — staging must not deliver WhatsApp, email, SMS, voice, or calendar writes.
 */

const { resolveAtlasEnv } = require("./atlasEnvironment");

function isEnabledFlag(value) {
  return /^(1|true|yes|on)$/i.test(String(value || "").trim());
}

function isStagingOutboundBlocked(env = process.env) {
  if (resolveAtlasEnv(env) !== "staging") {
    return false;
  }

  return !isEnabledFlag(env.STAGING_OUTBOUND_COMMUNICATION_ENABLED);
}

module.exports = {
  isStagingOutboundBlocked
};
