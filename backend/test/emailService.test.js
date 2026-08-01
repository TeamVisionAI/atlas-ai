const test = require("node:test");
const assert = require("node:assert/strict");

test("password reset link uses localhost in development", async () => {
  const originalEnv = { ...process.env };
  const captured = [];
  const originalFetch = global.fetch;

  try {
    process.env.NODE_ENV = "development";
    delete process.env.FRONTEND_URL;
    delete process.env.ATLAS_FRONTEND_URL;
    delete process.env.APP_URL;
    process.env.RESEND_API_KEY = "test-key";

    delete require.cache[require.resolve("../config/frontendBaseUrl")];
    delete require.cache[require.resolve("../services/emailService")];

    const emailService = require("../services/emailService");

    global.fetch = async (_url, init) => {
      captured.push(JSON.parse(init.body));
      return { ok: true, status: 200 };
    };

    await emailService.sendPasswordResetEmail({
      email: "user@example.com",
      firstName: "User",
      token: "reset-token-123",
      expiresAt: "2026-08-01T00:00:00.000Z"
    });

    assert.match(
      captured[0].text,
      /http:\/\/localhost:5173\/app\/reset-password\?token=reset-token-123/
    );
  } finally {
    global.fetch = originalFetch;
    process.env = originalEnv;
    delete require.cache[require.resolve("../config/frontendBaseUrl")];
    delete require.cache[require.resolve("../services/emailService")];
  }
});

test("password reset link uses production domain when configured", async () => {
  const originalEnv = { ...process.env };
  const captured = [];
  const originalFetch = global.fetch;

  try {
    process.env.NODE_ENV = "production";
    process.env.FRONTEND_URL = "https://www.teamvisionfinancial.com";
    process.env.RESEND_API_KEY = "test-key";

    delete require.cache[require.resolve("../config/frontendBaseUrl")];
    delete require.cache[require.resolve("../services/emailService")];

    const emailService = require("../services/emailService");

    global.fetch = async (_url, init) => {
      captured.push(JSON.parse(init.body));
      return { ok: true, status: 200 };
    };

    await emailService.sendPasswordResetEmail({
      email: "user@example.com",
      firstName: "User",
      token: "reset-token-123",
      expiresAt: "2026-08-01T00:00:00.000Z"
    });

    assert.match(
      captured[0].text,
      /https:\/\/www\.teamvisionfinancial\.com\/app\/reset-password\?token=reset-token-123/
    );
    assert.doesNotMatch(captured[0].text, /localhost/);
  } finally {
    global.fetch = originalFetch;
    process.env = originalEnv;
    delete require.cache[require.resolve("../config/frontendBaseUrl")];
    delete require.cache[require.resolve("../services/emailService")];
  }
});
