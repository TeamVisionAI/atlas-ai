/**
 * Safe Embedded Signup handoff telemetry.
 * Never logs authorization codes, tokens, or full Meta payloads.
 */

import { describeAttemptForTelemetry } from "../engines/embeddedSignupHandoff";
import { reportEmbeddedSignupStage } from "../services/metaEmbeddedSignupService";

const PREFIX = "[whatsapp-embedded-signup]";

const STAGE_ALIASES = Object.freeze({
  attempt_started: "embedded_signup_client_started",
  oauth_code_received: "embedded_signup_oauth_received",
  finish_received: "embedded_signup_finish_received",
  exchange_triggered: "embedded_signup_exchange_requested",
  exchange_success: "embedded_signup_exchange_completed",
  status_verified: "embedded_signup_status_verified",
  timeout_incomplete: "embedded_signup_partial_timeout",
  timeout_extended_partial: "embedded_signup_partial_timeout",
  status_verify_failed: "embedded_signup_status_verify_failed"
});

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
  console.info(PREFIX, payload);
}

function buildTelemetryContext(attempt, extra = {}) {
  const attemptSnapshot = describeAttemptForTelemetry(attempt);
  return {
    attemptId: attemptSnapshot.attemptId,
    ownershipMode: extra.ownershipMode || attemptSnapshot.ownershipMode || "personal",
    ...attemptSnapshot,
    ...extra
  };
}

function reportStage(event, attempt, extra = {}) {
  const stage = STAGE_ALIASES[event] || event;
  const context = buildTelemetryContext(attempt, extra);
  emit("info", stage, context);
  void reportEmbeddedSignupStage(stage, {
    attemptId: context.attemptId,
    ownershipMode: context.ownershipMode,
    partialHandoff: context.partialHandoff,
    hasOAuthCode: context.hasOAuthCode,
    hasWabaId: context.hasWabaId,
    ...extra
  });
}

export function logEmbeddedSignupTelemetry(event, attempt = null, extra = {}) {
  if (STAGE_ALIASES[event]) {
    reportStage(event, attempt, extra);
    return;
  }
  emit("info", event, buildTelemetryContext(attempt, extra));
}

export function warnEmbeddedSignupTelemetry(event, attempt = null, extra = {}) {
  if (STAGE_ALIASES[event]) {
    reportStage(event, attempt, extra);
    return;
  }
  emit("warn", event, buildTelemetryContext(attempt, extra));
}

export function errorEmbeddedSignupTelemetry(event, attempt = null, extra = {}) {
  if (STAGE_ALIASES[event]) {
    const stage = STAGE_ALIASES[event] || event;
    const context = buildTelemetryContext(attempt, extra);
    emit("error", stage, context);
    void reportEmbeddedSignupStage(stage, {
      attemptId: context.attemptId,
      ownershipMode: context.ownershipMode,
      partialHandoff: context.partialHandoff,
      ...extra
    });
    return;
  }
  emit("error", event, buildTelemetryContext(attempt, extra));
}
