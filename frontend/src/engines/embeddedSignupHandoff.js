/**
 * Pure Embedded Signup handoff coordinator — testable without React.
 * Collects OAuth code + FINISH assets independently, triggers exchange once.
 */

export const FINISH_EVENTS = Object.freeze(
  new Set([
    "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
    "FINISH",
    "FINISH_ONLY_WABA",
    "FINISH_GRANT_ONLY_API_ACCESS"
  ])
);

export const COMPLETION_TIMEOUT_MS = 120_000;
export const COMPLETION_EXTENSION_MS = 90_000;
export const HANDOFF_SESSION_STORAGE_KEY = "atlas.embedded_signup.handoff.v1";
export const HANDOFF_MAX_AGE_MS = COMPLETION_TIMEOUT_MS + COMPLETION_EXTENSION_MS + 30_000;

let attemptCounter = 0;

export function createEmbeddedSignupAttempt(now = Date.now(), extras = {}) {
  attemptCounter += 1;
  const ownershipMode =
    String(extras?.ownershipMode || "").trim().toLowerCase() === "organization"
      ? "organization"
      : "personal";
  return {
    attemptId: `wa-es-${attemptCounter}-${now}`,
    oauthCode: null,
    wabaId: null,
    phoneNumberId: null,
    businessId: null,
    sessionInfo: null,
    exchangeStarted: false,
    exchangeCompleted: false,
    startedAt: now,
    lastEventAt: now,
    timeoutExtended: false,
    timeoutDeadlineAt: null,
    metaFinishReceived: false,
    oauthReceived: false,
    ownershipMode
  };
}

export function isFinishEvent(eventName) {
  return FINISH_EVENTS.has(String(eventName || ""));
}

/**
 * Apply OAuth code from FB.login callback.
 * @returns {{ attempt: object, waitingFor: string|null, shouldExchange: boolean, ignored: boolean }}
 */
export function applyOAuthCode(attempt, code, now = Date.now()) {
  if (!attempt || attempt.exchangeCompleted) {
    return { attempt, waitingFor: null, shouldExchange: false, ignored: true };
  }

  const nextCode = String(code || "").trim();
  if (!nextCode) {
    return { attempt, waitingFor: null, shouldExchange: false, ignored: true };
  }

  // Duplicate code for same attempt — idempotent; still try exchange if assets ready
  const next = {
    ...attempt,
    oauthCode: nextCode,
    oauthReceived: true,
    lastEventAt: now
  };

  const shouldExchange = Boolean(next.wabaId) && !next.exchangeStarted && !next.exchangeCompleted;
  return {
    attempt: next,
    waitingFor: next.wabaId ? null : "finish",
    shouldExchange,
    ignored: false
  };
}

/**
 * Apply FINISH / session assets from WA_EMBEDDED_SIGNUP postMessage.
 */
export function applyFinishPayload(attempt, payload = {}, now = Date.now()) {
  if (!attempt || attempt.exchangeCompleted) {
    return { attempt, waitingFor: null, shouldExchange: false, ignored: true };
  }

  if (!isFinishEvent(payload.event)) {
    return { attempt, waitingFor: null, shouldExchange: false, ignored: true };
  }

  const next = {
    ...attempt,
    wabaId: payload.wabaId || attempt.wabaId || null,
    phoneNumberId: payload.phoneNumberId || attempt.phoneNumberId || null,
    businessId: payload.businessId || attempt.businessId || null,
    sessionInfo: payload.sessionInfo || attempt.sessionInfo || null,
    metaFinishReceived: true,
    lastEventAt: now
  };

  const shouldExchange =
    Boolean(next.oauthCode && next.wabaId) && !next.exchangeStarted && !next.exchangeCompleted;
  return {
    attempt: next,
    waitingFor: next.oauthCode ? null : "oauth_code",
    shouldExchange,
    ignored: false
  };
}

export function markExchangeStarted(attempt, now = Date.now()) {
  if (!attempt || attempt.exchangeStarted || attempt.exchangeCompleted) {
    return { attempt, started: false };
  }
  return {
    attempt: { ...attempt, exchangeStarted: true, lastEventAt: now },
    started: true
  };
}

export function markExchangeCompleted(attempt, now = Date.now()) {
  if (!attempt) {
    return attempt;
  }
  return {
    ...attempt,
    exchangeStarted: true,
    exchangeCompleted: true,
    lastEventAt: now
  };
}

export function markTimeoutExtended(attempt) {
  if (!attempt) {
    return attempt;
  }
  return { ...attempt, timeoutExtended: true };
}

/**
 * Decide timeout action for an in-progress attempt.
 * @returns {'suppress'|'exchange'|'extend'|'timeout'}
 */
export function resolveTimeoutAction(attempt) {
  if (!attempt || attempt.exchangeCompleted || attempt.exchangeStarted) {
    return "suppress";
  }
  if (attempt.oauthCode && attempt.wabaId) {
    return "exchange";
  }
  if ((attempt.oauthCode || attempt.wabaId) && !attempt.timeoutExtended) {
    return "extend";
  }
  return "timeout";
}

export function buildExchangePayload(attempt, redirectUri) {
  if (!attempt?.oauthCode || !attempt?.wabaId) {
    return null;
  }
  const ownershipMode =
    String(attempt.ownershipMode || "").trim().toLowerCase() === "organization"
      ? "organization"
      : "personal";
  return {
    attemptId: attempt.attemptId,
    code: attempt.oauthCode,
    wabaId: attempt.wabaId,
    phoneNumberId: attempt.phoneNumberId || undefined,
    businessId: attempt.businessId || undefined,
    onboardingType: "whatsapp_business_app",
    redirectUri,
    ownershipMode
  };
}

export function armHandoffTimeoutDeadline(attempt, durationMs = COMPLETION_TIMEOUT_MS, now = Date.now()) {
  if (!attempt) {
    return attempt;
  }
  return {
    ...attempt,
    timeoutDeadlineAt: now + durationMs,
    lastEventAt: now
  };
}

export function isHandoffAttemptExpired(attempt, now = Date.now()) {
  if (!attempt?.timeoutDeadlineAt) {
    return false;
  }
  return now > attempt.timeoutDeadlineAt;
}

/**
 * @returns {'missing_oauth'|'missing_finish'|'missing_both'|'ready'|'complete'|'no_attempt'}
 */
export function describePartialHandoffTimeout(attempt) {
  if (!attempt) {
    return "no_attempt";
  }
  if (attempt.exchangeCompleted) {
    return "complete";
  }
  const hasOAuth = Boolean(attempt.oauthCode);
  const hasFinish = Boolean(attempt.wabaId);
  if (hasOAuth && hasFinish) {
    return "ready";
  }
  if (hasFinish && !hasOAuth) {
    return "missing_oauth";
  }
  if (hasOAuth && !hasFinish) {
    return "missing_finish";
  }
  return "missing_both";
}

export function isPartialHandoffTimeout(attempt) {
  const kind = describePartialHandoffTimeout(attempt);
  return kind === "missing_oauth" || kind === "missing_finish";
}

export function evaluatePostExchangeStatus(statusPayload) {
  if (statusPayload?.connected === true && statusPayload?.connection) {
    return {
      verified: true,
      connection: statusPayload.connection
    };
  }
  return {
    verified: false,
    reason: "status_disconnected"
  };
}

export function serializeHandoffAttempt(attempt) {
  if (!attempt) {
    return null;
  }
  return {
    attemptId: attempt.attemptId,
    oauthCode: attempt.oauthCode,
    wabaId: attempt.wabaId,
    phoneNumberId: attempt.phoneNumberId,
    businessId: attempt.businessId,
    exchangeStarted: Boolean(attempt.exchangeStarted),
    exchangeCompleted: Boolean(attempt.exchangeCompleted),
    startedAt: attempt.startedAt,
    lastEventAt: attempt.lastEventAt,
    timeoutExtended: Boolean(attempt.timeoutExtended),
    timeoutDeadlineAt: attempt.timeoutDeadlineAt,
    metaFinishReceived: Boolean(attempt.metaFinishReceived),
    oauthReceived: Boolean(attempt.oauthReceived)
  };
}

export function deserializeHandoffAttempt(raw, now = Date.now()) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  if (!raw.attemptId || !raw.startedAt) {
    return null;
  }
  if (now - Number(raw.startedAt) > HANDOFF_MAX_AGE_MS) {
    return null;
  }
  if (raw.exchangeCompleted) {
    return null;
  }
  return {
    attemptId: String(raw.attemptId),
    oauthCode: raw.oauthCode || null,
    wabaId: raw.wabaId || null,
    phoneNumberId: raw.phoneNumberId || null,
    businessId: raw.businessId || null,
    sessionInfo: null,
    exchangeStarted: Boolean(raw.exchangeStarted),
    exchangeCompleted: false,
    startedAt: Number(raw.startedAt),
    lastEventAt: Number(raw.lastEventAt) || Number(raw.startedAt),
    timeoutExtended: Boolean(raw.timeoutExtended),
    timeoutDeadlineAt: raw.timeoutDeadlineAt || null,
    metaFinishReceived: Boolean(raw.metaFinishReceived),
    oauthReceived: Boolean(raw.oauthReceived)
  };
}

export function persistHandoffAttempt(attempt) {
  if (typeof sessionStorage === "undefined" || !attempt || attempt.exchangeCompleted) {
    return;
  }
  try {
    sessionStorage.setItem(HANDOFF_SESSION_STORAGE_KEY, JSON.stringify(serializeHandoffAttempt(attempt)));
  } catch {
    // Non-fatal — in-memory handoff still works for the active tab.
  }
}

export function restoreHandoffAttempt(now = Date.now()) {
  if (typeof sessionStorage === "undefined") {
    return null;
  }
  try {
    const raw = sessionStorage.getItem(HANDOFF_SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    return deserializeHandoffAttempt(parsed, now);
  } catch {
    return null;
  }
}

export function clearPersistedHandoffAttempt() {
  if (typeof sessionStorage === "undefined") {
    return;
  }
  try {
    sessionStorage.removeItem(HANDOFF_SESSION_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function isStaleAttemptEvent(attempt, eventAttemptId) {
  if (!attempt || !eventAttemptId) {
    return false;
  }
  return attempt.attemptId !== eventAttemptId;
}

/** Safe observability snapshot — never includes oauth code or tokens. */
export function describeAttemptForTelemetry(attempt) {
  if (!attempt) {
    return { attemptId: null };
  }
  return {
    attemptId: attempt.attemptId,
    ownershipMode: attempt.ownershipMode === "organization" ? "organization" : "personal",
    hasOAuthCode: Boolean(attempt.oauthCode),
    hasWabaId: Boolean(attempt.wabaId),
    hasPhoneNumberId: Boolean(attempt.phoneNumberId),
    hasBusinessId: Boolean(attempt.businessId),
    exchangeStarted: Boolean(attempt.exchangeStarted),
    exchangeCompleted: Boolean(attempt.exchangeCompleted),
    timeoutExtended: Boolean(attempt.timeoutExtended),
    metaFinishReceived: Boolean(attempt.metaFinishReceived),
    oauthReceived: Boolean(attempt.oauthReceived),
    partialHandoff: describePartialHandoffTimeout(attempt),
    startedAt: attempt.startedAt,
    lastEventAt: attempt.lastEventAt
  };
}
