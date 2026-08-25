import test from "node:test";
import assert from "node:assert/strict";
import {
  applyFinishPayload,
  applyOAuthCode,
  buildExchangePayload,
  clearPersistedHandoffAttempt,
  createEmbeddedSignupAttempt,
  describeAttemptForTelemetry,
  describePartialHandoffTimeout,
  deserializeHandoffAttempt,
  evaluatePostExchangeStatus,
  HANDOFF_SESSION_STORAGE_KEY,
  isPartialHandoffTimeout,
  isStaleAttemptEvent,
  markExchangeCompleted,
  markExchangeStarted,
  markTimeoutExtended,
  persistHandoffAttempt,
  resolveTimeoutAction,
  restoreHandoffAttempt,
  serializeHandoffAttempt
} from "./embeddedSignupHandoff.js";
import {
  isAllowedFacebookOrigin,
  parseEmbeddedSignupPostMessage
} from "../utils/metaEmbeddedSignupEvents.js";

function finish(wabaId = "waba-1", extra = {}) {
  return {
    event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
    wabaId,
    phoneNumberId: extra.phoneNumberId || "phone-1",
    businessId: extra.businessId || "biz-1"
  };
}

test("1. code first → FINISH later → one exchange", () => {
  let attempt = createEmbeddedSignupAttempt();
  let exchanges = 0;

  let result = applyOAuthCode(attempt, "code-aaa");
  attempt = result.attempt;
  assert.equal(result.shouldExchange, false);
  assert.equal(result.waitingFor, "finish");

  result = applyFinishPayload(attempt, finish());
  attempt = result.attempt;
  assert.equal(result.shouldExchange, true);
  if (result.shouldExchange) {
    const started = markExchangeStarted(attempt);
    assert.equal(started.started, true);
    exchanges += 1;
    attempt = started.attempt;
  }

  // Duplicate FINISH must not start a second exchange
  result = applyFinishPayload(attempt, finish());
  assert.equal(result.shouldExchange, false);
  assert.equal(exchanges, 1);
  assert.ok(buildExchangePayload(attempt, "https://app.useatlas-ai.com/app/settings/whatsapp"));
});

test("2. FINISH first → code later → one exchange", () => {
  let attempt = createEmbeddedSignupAttempt();

  let result = applyFinishPayload(attempt, finish());
  attempt = result.attempt;
  assert.equal(result.shouldExchange, false);
  assert.equal(result.waitingFor, "oauth_code");

  result = applyOAuthCode(attempt, "code-bbb");
  assert.equal(result.shouldExchange, true);
  attempt = markExchangeStarted(result.attempt).attempt;
  assert.equal(applyOAuthCode(attempt, "code-bbb").shouldExchange, false);
});

test("3. simultaneous both ready → one exchange POST", () => {
  let attempt = createEmbeddedSignupAttempt();
  attempt = applyOAuthCode(attempt, "code-sim").attempt;
  const finishResult = applyFinishPayload(attempt, finish());
  assert.equal(finishResult.shouldExchange, true);
  const first = markExchangeStarted(finishResult.attempt);
  assert.equal(first.started, true);
  const second = markExchangeStarted(first.attempt);
  assert.equal(second.started, false);
});

test("4. duplicate code → one exchange", () => {
  let attempt = createEmbeddedSignupAttempt();
  attempt = applyFinishPayload(attempt, finish()).attempt;
  const first = applyOAuthCode(attempt, "code-dup");
  assert.equal(first.shouldExchange, true);
  attempt = markExchangeStarted(first.attempt).attempt;
  const second = applyOAuthCode(attempt, "code-dup");
  assert.equal(second.shouldExchange, false);
});

test("5. duplicate FINISH → one exchange", () => {
  let attempt = createEmbeddedSignupAttempt();
  attempt = applyOAuthCode(attempt, "code-dup2").attempt;
  const first = applyFinishPayload(attempt, finish());
  assert.equal(first.shouldExchange, true);
  attempt = markExchangeStarted(first.attempt).attempt;
  const second = applyFinishPayload(attempt, finish("waba-1"));
  assert.equal(second.shouldExchange, false);
});

test("6. rerender simulation does not lose first event", () => {
  let attempt = createEmbeddedSignupAttempt();
  attempt = applyOAuthCode(attempt, "code-persist").attempt;
  // Simulate React remount keeping attemptRef value
  const restored = { ...attempt };
  const result = applyFinishPayload(restored, finish());
  assert.equal(result.shouldExchange, true);
  assert.equal(result.attempt.oauthCode, "code-persist");
});

test("7. timeout after first event extends once; second event can still exchange", () => {
  let attempt = createEmbeddedSignupAttempt();
  attempt = applyFinishPayload(attempt, finish()).attempt;
  assert.equal(resolveTimeoutAction(attempt), "extend");
  attempt = markTimeoutExtended(attempt);
  assert.equal(resolveTimeoutAction(attempt), "timeout");
  // Second event within grace path: code arrives after extend mark
  const withCode = applyOAuthCode(attempt, "code-late");
  assert.equal(withCode.shouldExchange, true);
});

test("8. timeout suppressed once exchange starts", () => {
  let attempt = createEmbeddedSignupAttempt();
  attempt = applyOAuthCode(attempt, "code-x").attempt;
  attempt = applyFinishPayload(attempt, finish()).attempt;
  attempt = markExchangeStarted(attempt).attempt;
  assert.equal(resolveTimeoutAction(attempt), "suppress");
  attempt = markExchangeCompleted(attempt);
  assert.equal(resolveTimeoutAction(attempt), "suppress");
});

test("9. stale prior-attempt event ignored via attempt id check", () => {
  const a = createEmbeddedSignupAttempt();
  const b = createEmbeddedSignupAttempt();
  assert.equal(isStaleAttemptEvent(a, b.attemptId), true);
  assert.equal(isStaleAttemptEvent(a, a.attemptId), false);
});

test("10. invalid message origin ignored; Meta facebook.com hosts allowed", () => {
  assert.equal(isAllowedFacebookOrigin("https://evil.example"), false);
  assert.equal(isAllowedFacebookOrigin("https://attackerfacebook.com"), false);
  assert.equal(isAllowedFacebookOrigin("http://www.facebook.com"), false);
  assert.equal(isAllowedFacebookOrigin("https://www.facebook.com"), true);
  assert.equal(isAllowedFacebookOrigin("https://web.facebook.com"), true);
  assert.equal(isAllowedFacebookOrigin("https://business.facebook.com"), true);
  assert.equal(isAllowedFacebookOrigin("https://m.facebook.com"), true);
});

test("11. exchange payload matches backend contract (code + wabaId)", () => {
  let attempt = createEmbeddedSignupAttempt();
  attempt = applyOAuthCode(attempt, "auth-code").attempt;
  attempt = applyFinishPayload(attempt, finish("waba-tl")).attempt;
  const payload = buildExchangePayload(
    attempt,
    "https://app.useatlas-ai.com/app/settings/whatsapp"
  );
  assert.deepEqual(
    {
      attemptId: payload.attemptId,
      code: payload.code,
      wabaId: payload.wabaId,
      onboardingType: payload.onboardingType,
      redirectUri: payload.redirectUri
    },
    {
      attemptId: attempt.attemptId,
      code: "auth-code",
      wabaId: "waba-tl",
      onboardingType: "whatsapp_business_app",
      redirectUri: "https://app.useatlas-ai.com/app/settings/whatsapp"
    }
  );
  assert.equal(payload.phoneNumberId, "phone-1");
});

test("12. slower mobile ordering: FINISH then delayed code", () => {
  let attempt = createEmbeddedSignupAttempt(1);
  attempt = applyFinishPayload(attempt, finish(), 10).attempt;
  assert.equal(resolveTimeoutAction(attempt), "extend");
  attempt = markTimeoutExtended(attempt);
  // Still waiting — not timed out until grace expires without code
  const late = applyOAuthCode(attempt, "mobile-code", 100_000);
  assert.equal(late.shouldExchange, true);
});

test("parseEmbeddedSignupPostMessage accepts JSON string + business origin payload", () => {
  const parsed = parseEmbeddedSignupPostMessage(
    JSON.stringify({
      type: "WA_EMBEDDED_SIGNUP",
      event: "FINISH",
      data: { waba_id: "w1", phone_number_id: "p1" }
    })
  );
  assert.equal(parsed.wabaId, "w1");
  assert.equal(parsed.phoneNumberId, "p1");
  assert.equal(parseEmbeddedSignupPostMessage({ type: "OTHER" }), null);
});

test("telemetry descriptor never includes oauth code", () => {
  let attempt = createEmbeddedSignupAttempt();
  attempt = applyOAuthCode(attempt, "super-secret-code").attempt;
  const snap = describeAttemptForTelemetry(attempt);
  assert.equal(snap.hasOAuthCode, true);
  assert.equal(Object.values(snap).includes("super-secret-code"), false);
});

test("FINISH without OAuth resolves to partial timeout", () => {
  let attempt = createEmbeddedSignupAttempt();
  attempt = applyFinishPayload(attempt, finish()).attempt;
  assert.equal(describePartialHandoffTimeout(attempt), "missing_oauth");
  assert.equal(isPartialHandoffTimeout(attempt), true);
  attempt = markTimeoutExtended(attempt);
  assert.equal(resolveTimeoutAction(attempt), "timeout");
});

test("OAuth without FINISH resolves to partial timeout", () => {
  let attempt = createEmbeddedSignupAttempt();
  attempt = applyOAuthCode(attempt, "code-only").attempt;
  assert.equal(describePartialHandoffTimeout(attempt), "missing_finish");
  assert.equal(isPartialHandoffTimeout(attempt), true);
});

test("exchange success requires connected status payload", () => {
  assert.equal(
    evaluatePostExchangeStatus({ connected: true, connection: { displayPhoneNumber: "+1" } })
      .verified,
    true
  );
  assert.equal(evaluatePostExchangeStatus({ connected: false }).verified, false);
  assert.equal(evaluatePostExchangeStatus(null).reason, "status_disconnected");
});

test("sessionStorage round-trip preserves handoff without logging secrets", () => {
  const storage = new Map();
  global.sessionStorage = {
    setItem(key, value) {
      storage.set(key, value);
    },
    getItem(key) {
      return storage.get(key) || null;
    },
    removeItem(key) {
      storage.delete(key);
    }
  };

  let attempt = createEmbeddedSignupAttempt(1000);
  attempt = applyOAuthCode(attempt, "secret-code", 1001).attempt;
  attempt = applyFinishPayload(attempt, finish("waba-mobile"), 5000).attempt;
  persistHandoffAttempt(attempt);

  const stored = storage.get(HANDOFF_SESSION_STORAGE_KEY);
  assert.match(String(stored), /secret-code/);

  const restored = restoreHandoffAttempt(6000);
  assert.equal(restored.oauthCode, "secret-code");
  assert.equal(restored.wabaId, "waba-mobile");
  assert.equal(describeAttemptForTelemetry(restored).hasOAuthCode, true);
  assert.equal(Object.values(describeAttemptForTelemetry(restored)).includes("secret-code"), false);

  clearPersistedHandoffAttempt();
  assert.equal(restoreHandoffAttempt(6000), null);

  delete global.sessionStorage;
});

test("mobile-style delayed FINISH then OAuth still exchanges once", () => {
  let attempt = createEmbeddedSignupAttempt(1);
  attempt = applyFinishPayload(attempt, finish(), 50).attempt;
  assert.equal(resolveTimeoutAction(attempt), "extend");
  attempt = markTimeoutExtended(attempt);
  const late = applyOAuthCode(attempt, "mobile-delayed-code", 120_000);
  assert.equal(late.shouldExchange, true);
  const started = markExchangeStarted(late.attempt);
  assert.equal(started.started, true);
  assert.equal(applyOAuthCode(started.attempt, "mobile-delayed-code", 120_001).shouldExchange, false);
});

test("serialize/deserialize drops expired attempts", () => {
  const attempt = createEmbeddedSignupAttempt(0);
  const serialized = serializeHandoffAttempt(attempt);
  assert.equal(deserializeHandoffAttempt(serialized, 999_999), null);
});
