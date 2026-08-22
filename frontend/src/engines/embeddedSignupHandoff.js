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

let attemptCounter = 0;

export function createEmbeddedSignupAttempt(now = Date.now()) {
  attemptCounter += 1;
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
    timeoutExtended: false
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
    lastEventAt: now
  };

  const shouldExchange = Boolean(next.wabaId) && !next.exchangeStarted;
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
    lastEventAt: now
  };

  const shouldExchange = Boolean(next.oauthCode && next.wabaId) && !next.exchangeStarted;
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
  return {
    code: attempt.oauthCode,
    wabaId: attempt.wabaId,
    phoneNumberId: attempt.phoneNumberId || undefined,
    businessId: attempt.businessId || undefined,
    onboardingType: "whatsapp_business_app",
    redirectUri
  };
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
    hasOAuthCode: Boolean(attempt.oauthCode),
    hasWabaId: Boolean(attempt.wabaId),
    hasPhoneNumberId: Boolean(attempt.phoneNumberId),
    hasBusinessId: Boolean(attempt.businessId),
    exchangeStarted: Boolean(attempt.exchangeStarted),
    exchangeCompleted: Boolean(attempt.exchangeCompleted),
    timeoutExtended: Boolean(attempt.timeoutExtended),
    startedAt: attempt.startedAt,
    lastEventAt: attempt.lastEventAt
  };
}
