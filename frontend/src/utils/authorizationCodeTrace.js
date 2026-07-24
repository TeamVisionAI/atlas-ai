/**
 * Sprint 12.3 — Authorization code integrity tracing (length + fingerprint, no full code in logs).
 */

async function digestSha256Hex(value) {
  const data = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function fingerprintAuthorizationCode(code) {
  if (typeof code !== "string" || !code) {
    return {
      codeLength: 0,
      codeFingerprint: null,
      codePreview: null
    };
  }

  const digest = await digestSha256Hex(code);

  return {
    codeLength: code.length,
    codeFingerprint: digest.slice(0, 16),
    codePreview:
      code.length <= 8 ? "[REDACTED]" : `${code.slice(0, 4)}…${code.slice(-4)}`
  };
}

export async function logAuthorizationCodeTrace(debugLabel, stage, code, extra = {}) {
  const trace = await fingerprintAuthorizationCode(code);

  console.log(debugLabel, "authorization_code_trace", {
    stage,
    ...trace,
    ...extra
  });

  return trace;
}
