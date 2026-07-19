/**
 * Sprint 6 — WhatsApp Business App Embedded Signup verification.
 * Run: node backend/dev/verifySprint6WhatsAppEmbeddedSignup.js
 */

require("dotenv").config();

const express = require("express");
const {
  isAllowedFacebookOrigin,
  parseEmbeddedSignupPostMessage
} = require("../core/metaEmbeddedSignupMessageParser");
const {
  isAuthorizationCodeUsed,
  markAuthorizationCodeUsed
} = require("../core/metaEmbeddedSignupRateLimit");
const { toSafeConnection } = require("../repositories/metaWhatsAppConnectionRepository");
const { assertRepositoryImplementation } = require("../repositories/metaConnectionRepositoryInterface");
const { createTokenEncryption } = require("../core/meta/tokenEncryption");
const {
  validateMetaEmbeddedSignupEnvironment
} = require("../core/meta/metaEnvironmentValidator");
const { getReconnectFlowPlan } = require("../core/meta/metaReconnectFlow");
const { repository } = require("../repositories/metaWhatsAppConnectionRepository");
const metaOnboardingRoutes = require("../routes/metaOnboarding");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createMetaApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/meta", metaOnboardingRoutes);
  return app;
}

async function postExchange(app, body) {
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/meta/embedded-signup/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    return { status: response.status, payload };
  } finally {
    server.close();
  }
}

function verifyMessageParserTests() {
  assert(!isAllowedFacebookOrigin("https://evil.example"), "Reject invalid event origin");

  assert(
    isAllowedFacebookOrigin("https://www.facebook.com"),
    "Accept www.facebook.com origin"
  );

  const objectPayload = parseEmbeddedSignupPostMessage({
    type: "WA_EMBEDDED_SIGNUP",
    event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
    data: {
      waba_id: "waba-123",
      phone_number_id: "phone-456"
    }
  });

  assert(objectPayload?.wabaId === "waba-123", "Parse object FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING");
  assert(objectPayload?.phoneNumberId === "phone-456", "Parse phone number id from object payload");

  const stringPayload = parseEmbeddedSignupPostMessage(
    JSON.stringify({
      type: "WA_EMBEDDED_SIGNUP",
      event: "FINISH",
      data: { wabaId: "waba-789", phoneNumberId: "phone-999" }
    })
  );

  assert(stringPayload?.wabaId === "waba-789", "Parse string JSON postMessage data");
  assert(
    parseEmbeddedSignupPostMessage("not-json") === null,
    "Ignore invalid JSON postMessage data"
  );

  console.log("✓ Embedded signup postMessage parser");
}

function verifySafeConnectionShape() {
  const safe = toSafeConnection({
    waba_id: "waba-1",
    phone_number_id: "phone-1",
    connection_type: "whatsapp_business_app",
    status: "connected",
    access_token: "secret-token-should-not-leak",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z"
  });

  assert(safe.wabaId === "waba-1", "Safe connection exposes wabaId");
  assert(safe.phoneNumberId === "phone-1", "Safe connection exposes phoneNumberId");
  assert(!Object.prototype.hasOwnProperty.call(safe, "access_token"), "Safe connection hides token");
  assert(!Object.prototype.hasOwnProperty.call(safe, "accessToken"), "Safe connection hides accessToken");
  console.log("✓ Safe connection DTO excludes credentials");
}

function verifyDuplicateCodeProtection() {
  const code = `test-code-${Date.now()}`;
  assert(!isAuthorizationCodeUsed(code), "Fresh code is not marked used");
  markAuthorizationCodeUsed(code);
  assert(isAuthorizationCodeUsed(code), "Used code is detected");
  console.log("✓ Duplicate authorization code protection");
}

async function verifyExchangeValidation() {
  const app = createMetaApp();
  const missingCode = await postExchange(app, {});

  assert(missingCode.status === 400, "Reject missing authorization code");
  assert(missingCode.payload.error === "CODE_REQUIRED", "Missing code error code");

  const invalidType = await postExchange(app, {
    code: "dummy-code",
    onboardingType: "invalid"
  });

  assert(invalidType.status === 400, "Reject invalid onboarding type");
  console.log("✓ Exchange endpoint input validation");
}

async function verifyStatusRoute() {
  const app = createMetaApp();
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/meta/embedded-signup/status`);
    const payload = await response.json();

    assert(response.status === 200, "Status route returns 200");
    assert(typeof payload.connected === "boolean", "Status includes connected flag");
    assert(!JSON.stringify(payload).includes("access_token"), "Status never includes token");
    console.log("✓ Embedded signup status route");
  } finally {
    server.close();
  }
}

function verifyTokenEncryptionRoundTrip() {
  const keyHex = "a".repeat(64);
  const encryption = createTokenEncryption({ key: Buffer.from(keyHex, "hex") });
  const plaintext = "meta-access-token-test";

  const encrypted = encryption.encrypt(plaintext);

  assert(encryption.isEncrypted(encrypted), "Encrypted token uses enc:v1 format");
  assert(encryption.decrypt(encrypted) === plaintext, "Decrypt restores original token");
  assert(encrypted !== plaintext, "Encrypted token differs from plaintext");
  console.log("✓ Token encryption round-trip");
}

function verifyEnvironmentValidator() {
  const saved = {
    META_APP_ID: process.env.META_APP_ID,
    META_APP_SECRET: process.env.META_APP_SECRET
  };

  delete process.env.META_APP_ID;
  delete process.env.META_APP_SECRET;

  try {
    const relaxed = validateMetaEmbeddedSignupEnvironment({ strict: false });
    assert(Array.isArray(relaxed.missing), "Validator returns missing array");
    assert(relaxed.missing.includes("META_APP_ID"), "Detects missing META_APP_ID");
    assert(relaxed.missing.includes("META_APP_SECRET"), "Detects missing META_APP_SECRET");

    let strictFailed = false;

    try {
      validateMetaEmbeddedSignupEnvironment({ strict: true });
    } catch (error) {
      strictFailed = error.code === "META_ENV_INVALID";
    }

    assert(strictFailed, "Strict validator throws META_ENV_INVALID");

    process.env.VITE_META_APP_ID = "vite-only-app-id";
    const viteOnly = validateMetaEmbeddedSignupEnvironment({ strict: false });
    assert(
      viteOnly.missing.includes("META_APP_ID"),
      "VITE_META_APP_ID does not satisfy backend META_APP_ID requirement"
    );
    delete process.env.VITE_META_APP_ID;

    console.log("✓ Meta environment validator");
  } finally {
    if (saved.META_APP_ID) {
      process.env.META_APP_ID = saved.META_APP_ID;
    } else {
      delete process.env.META_APP_ID;
    }

    if (saved.META_APP_SECRET) {
      process.env.META_APP_SECRET = saved.META_APP_SECRET;
    } else {
      delete process.env.META_APP_SECRET;
    }
  }
}

function verifyRepositoryInterface() {
  assertRepositoryImplementation(repository);
  assert(typeof repository.getStorageKind() === "string", "Repository exposes storage kind");
  console.log("✓ Meta connection repository interface");
}

function verifyReconnectFlowTodo() {
  const plan = getReconnectFlowPlan();

  assert(plan.status === "not_implemented", "Reconnect flow is not implemented yet");
  assert(plan.plannedSprint === "6.2+", "Reconnect flow planned for Sprint 6.2+");
  assert(Array.isArray(plan.steps) && plan.steps.length > 0, "Reconnect flow documents manual steps");
  console.log("✓ Reconnect flow TODO stub");
}

async function verifyHealthRoute() {
  const app = createMetaApp();
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/meta/embedded-signup/health`);
    const payload = await response.json();

    assert(response.status === 200, "Health route returns 200");
    assert(typeof payload.status === "string", "Health includes status string");
    assert(typeof payload.healthy === "boolean", "Health includes healthy flag");
    assert(payload.reconnectFlow?.status === "not_implemented", "Health includes reconnect TODO");
    assert(!JSON.stringify(payload).includes("access_token"), "Health never includes token");
    console.log("✓ Embedded signup health route");
  } finally {
    server.close();
  }
}

async function main() {
  console.log("=== Sprint 6 / 6.1 WhatsApp Embedded Signup Verification ===\n");

  verifyMessageParserTests();
  verifySafeConnectionShape();
  verifyDuplicateCodeProtection();
  verifyTokenEncryptionRoundTrip();
  verifyEnvironmentValidator();
  verifyRepositoryInterface();
  verifyReconnectFlowTodo();
  await verifyExchangeValidation();
  await verifyStatusRoute();
  await verifyHealthRoute();

  console.log("\n=== All Sprint 6 / 6.1 embedded signup checks passed ===");
}

main().catch((error) => {
  console.error("\n✗", error.message);
  process.exit(1);
});
