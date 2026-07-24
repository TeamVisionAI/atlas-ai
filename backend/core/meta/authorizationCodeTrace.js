/**
 * Sprint 12.3 — Authorization code integrity tracing (length + fingerprint, no full code in logs).
 */

const crypto = require("crypto");

function fingerprintAuthorizationCode(code) {
  if (typeof code !== "string" || !code) {
    return {
      codeLength: 0,
      codeFingerprint: null,
      codePreview: null
    };
  }

  const digest = crypto.createHash("sha256").update(code, "utf8").digest("hex");

  return {
    codeLength: code.length,
    codeFingerprint: digest.slice(0, 16),
    codePreview:
      code.length <= 8
        ? "[REDACTED]"
        : `${code.slice(0, 4)}…${code.slice(-4)}`
  };
}

function traceAuthorizationCode(stage, code, extra = {}) {
  return {
    stage,
    ...fingerprintAuthorizationCode(code),
    ...extra
  };
}

function compareAuthorizationCodes(before, after, stage) {
  const beforeTrace = fingerprintAuthorizationCode(before);
  const afterTrace = fingerprintAuthorizationCode(after);

  return {
    stage,
    unchanged: before === after,
    beforeLength: beforeTrace.codeLength,
    afterLength: afterTrace.codeLength,
    beforeFingerprint: beforeTrace.codeFingerprint,
    afterFingerprint: afterTrace.codeFingerprint
  };
}

module.exports = {
  fingerprintAuthorizationCode,
  traceAuthorizationCode,
  compareAuthorizationCodes
};
