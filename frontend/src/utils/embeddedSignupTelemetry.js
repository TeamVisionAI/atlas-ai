/**
 * Safe Embedded Signup handoff telemetry.
 * Never logs authorization codes, tokens, or full Meta payloads.
 */

import { describeAttemptForTelemetry } from "../engines/embeddedSignupHandoff";

const PREFIX = "[whatsapp-embedded-signup]";

function emit(level, event, details = {}) {
  const payload = {
    ts: new Date().toISOString(),
    event,
    ...details
  };

  if (level === "error") {
    console.error(PREFIX, payload);
    return;
  }
  if (level === "warn") {
    console.warn(PREFIX, payload);
    return;
  }
  // info — always emit concise non-secret breadcrumbs (needed for production canary)
  console.info(PREFIX, payload);
}

export function logEmbeddedSignupTelemetry(event, attempt = null, extra = {}) {
  emit("info", event, {
    ...describeAttemptForTelemetry(attempt),
    ...extra
  });
}

export function warnEmbeddedSignupTelemetry(event, attempt = null, extra = {}) {
  emit("warn", event, {
    ...describeAttemptForTelemetry(attempt),
    ...extra
  });
}

export function errorEmbeddedSignupTelemetry(event, attempt = null, extra = {}) {
  emit("error", event, {
    ...describeAttemptForTelemetry(attempt),
    ...extra
  });
}
