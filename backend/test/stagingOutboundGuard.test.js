const test = require("node:test");
const assert = require("node:assert/strict");

const { isStagingOutboundBlocked } = require("../config/stagingOutboundGuard");

test("outbound guard is inactive outside staging", () => {
  assert.equal(isStagingOutboundBlocked({}), false);
  assert.equal(isStagingOutboundBlocked({ ATLAS_ENV: "production" }), false);
  assert.equal(isStagingOutboundBlocked({ ATLAS_ENV: "development" }), false);
});

test("staging outbound defaults to blocked", () => {
  assert.equal(isStagingOutboundBlocked({ ATLAS_ENV: "staging" }), true);
  assert.equal(
    isStagingOutboundBlocked({
      ATLAS_ENV: "staging",
      STAGING_OUTBOUND_COMMUNICATION_ENABLED: "false"
    }),
    true
  );
});

test("staging outbound can be explicitly enabled", () => {
  assert.equal(
    isStagingOutboundBlocked({
      ATLAS_ENV: "staging",
      STAGING_OUTBOUND_COMMUNICATION_ENABLED: "true"
    }),
    false
  );
});

test("WhatsApp authorization and email fail closed when staging outbound is blocked", async () => {
  const originalAtlasEnv = process.env.ATLAS_ENV;
  const originalOutbound = process.env.STAGING_OUTBOUND_COMMUNICATION_ENABLED;
  const originalResend = process.env.RESEND_API_KEY;
  const originalSupabaseUrl = process.env.SUPABASE_URL;
  const originalSupabaseAnon = process.env.SUPABASE_ANON_KEY;
  const originalFetch = global.fetch;

  try {
    process.env.ATLAS_ENV = "staging";
    delete process.env.STAGING_OUTBOUND_COMMUNICATION_ENABLED;
    process.env.RESEND_API_KEY = "test-key";
    process.env.SUPABASE_URL =
      process.env.SUPABASE_URL || "https://abcdefghijklmnopqrst.supabase.co";
    process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "test-anon-key";
    delete require.cache[require.resolve("../config/atlasEnvironment")];
    delete require.cache[require.resolve("../config/stagingOutboundGuard")];
    delete require.cache[require.resolve("../core/whatsappOutboundAuthorizationGate")];
    delete require.cache[require.resolve("../config/frontendBaseUrl")];
    delete require.cache[require.resolve("../services/emailService")];

    const { authorizeWhatsAppOutbound, DELIVERY_STATUSES } = require("../core/whatsappOutboundAuthorizationGate");
    const emailService = require("../services/emailService");

    global.fetch = async () => {
      throw new Error("email fetch must not run in staging");
    };

    const auth = await authorizeWhatsAppOutbound({
      intent: "CONVERSATION_ENGINE_REPLY",
      phone: "+15550100001",
      message: "hello",
      evaluateWindow: async () => ({ open: true })
    });

    assert.equal(auth.status, DELIVERY_STATUSES.BLOCKED_STAGING_OUTBOUND);
    assert.equal(auth.authorized, false);

    const email = await emailService.sendEmail({
      to: "staging.superadmin@atlas.test",
      subject: "test",
      text: "test"
    });
    assert.equal(email.delivered, false);
    assert.equal(email.mode, "staging-blocked");
  } finally {
    global.fetch = originalFetch;
    if (originalAtlasEnv === undefined) delete process.env.ATLAS_ENV;
    else process.env.ATLAS_ENV = originalAtlasEnv;
    if (originalOutbound === undefined) delete process.env.STAGING_OUTBOUND_COMMUNICATION_ENABLED;
    else process.env.STAGING_OUTBOUND_COMMUNICATION_ENABLED = originalOutbound;
    if (originalResend === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalResend;
    if (originalSupabaseUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalSupabaseUrl;
    if (originalSupabaseAnon === undefined) delete process.env.SUPABASE_ANON_KEY;
    else process.env.SUPABASE_ANON_KEY = originalSupabaseAnon;
    delete require.cache[require.resolve("../config/atlasEnvironment")];
    delete require.cache[require.resolve("../config/stagingOutboundGuard")];
    delete require.cache[require.resolve("../core/whatsappOutboundAuthorizationGate")];
    delete require.cache[require.resolve("../config/frontendBaseUrl")];
    delete require.cache[require.resolve("../services/emailService")];
  }
});

test("simulatorGuard mocks external comms when staging outbound is blocked", () => {
  const originalAtlasEnv = process.env.ATLAS_ENV;
  const originalOutbound = process.env.STAGING_OUTBOUND_COMMUNICATION_ENABLED;

  try {
    process.env.ATLAS_ENV = "staging";
    delete process.env.STAGING_OUTBOUND_COMMUNICATION_ENABLED;
    delete require.cache[require.resolve("../config/atlasEnvironment")];
    delete require.cache[require.resolve("../config/stagingOutboundGuard")];
    delete require.cache[require.resolve("../dev/simulatorGuard")];

    const { shouldMockExternalComms } = require("../dev/simulatorGuard");
    assert.equal(shouldMockExternalComms(), true);
  } finally {
    if (originalAtlasEnv === undefined) delete process.env.ATLAS_ENV;
    else process.env.ATLAS_ENV = originalAtlasEnv;
    if (originalOutbound === undefined) delete process.env.STAGING_OUTBOUND_COMMUNICATION_ENABLED;
    else process.env.STAGING_OUTBOUND_COMMUNICATION_ENABLED = originalOutbound;
    delete require.cache[require.resolve("../config/atlasEnvironment")];
    delete require.cache[require.resolve("../config/stagingOutboundGuard")];
    delete require.cache[require.resolve("../dev/simulatorGuard")];
  }
});
