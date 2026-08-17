/**
 * Embedded Signup asset discovery: FINISH WABA ID + GET /{waba_id}/phone_numbers.
 * Never GET /me. Persist to org-scoped whatsapp_integrations. Do not touch env 8080.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const axios = require("axios");

const { parseEmbeddedSignupPostMessage } = require("../core/metaEmbeddedSignupMessageParser");
const {
  COMPLETION_STAGES,
  completeEmbeddedSignupExchange,
  resolveConnectionAssets,
  redactSecretsFromLogDetails,
  buildAssetDiscoveryFailureLogDetails
} = require("../core/metaEmbeddedSignupService");
const { toSafeConnection } = require("../repositories/metaConnectionRepositoryInterface");
const { createTokenEncryption } = require("../core/meta/tokenEncryption");

const ORG_ID = "00000000-0000-4000-8000-000000000001";
const FINISH_WABA_ID = "waba-finish-111";
const FINISH_BUSINESS_ID = "biz-finish-555";
const CLIENT_PHONE_NUMBER_ID = "phone-client-222";
const CLIENT_DISPLAY_PHONE = "+1 305-999-7338";
const ENV_8080_PHONE_NUMBER_ID = "1347188398469744";
const ENV_8080_WABA_ID = "984287654667441";
const SECRET_TOKEN = "EAATESTSECRETTOKENVALUE1234567890";

const SERVICE_SRC = fs.readFileSync(
  path.join(__dirname, "../core/metaEmbeddedSignupService.js"),
  "utf8"
);
const CONNECT_SRC = fs.readFileSync(
  path.join(__dirname, "../../frontend/src/pages/WhatsAppConnect.jsx"),
  "utf8"
);
const FRONTEND_EVENTS_SRC = fs.readFileSync(
  path.join(__dirname, "../../frontend/src/utils/metaEmbeddedSignupEvents.js"),
  "utf8"
);
const ROUTE_SRC = fs.readFileSync(path.join(__dirname, "../routes/metaOnboarding.js"), "utf8");
const MIGRATION_015 = fs.readFileSync(
  path.join(__dirname, "../database/migrations/015_whatsapp_integrations.sql"),
  "utf8"
);

function createMemoryRepo(seed = {}) {
  const connections = structuredClone(seed);
  const tokenEncryption = createTokenEncryption({ key: Buffer.alloc(32, 9) });

  return {
    async getConnection(organizationId) {
      return connections[organizationId] ? { ...connections[organizationId] } : null;
    },
    async saveConnection(organizationId, record) {
      const now = new Date().toISOString();
      connections[organizationId] = {
        organization_id: organizationId,
        business_id: record.business_id || null,
        waba_id: record.waba_id,
        phone_number_id: record.phone_number_id,
        display_phone_number: record.display_phone_number || null,
        business_name: record.business_name || record.verified_name || null,
        verified_name: record.verified_name || record.business_name || null,
        connection_type: record.connection_type || "whatsapp_business_app",
        status: record.status || "connected",
        access_token_encrypted: tokenEncryption.encrypt(record.access_token),
        last_health_status: record.last_health_status || "healthy",
        last_health_checked_at: record.last_health_checked_at || now,
        connected_at: record.connected_at || now,
        last_sync_at: record.last_sync_at || now
      };
      return { ...connections[organizationId] };
    },
    async getDecryptedAccessToken(organizationId) {
      const row = connections[organizationId];
      if (!row?.access_token_encrypted) {
        return null;
      }
      return tokenEncryption.decrypt(row.access_token_encrypted);
    },
    async updateConnection() {
      return null;
    },
    async disconnectConnection() {
      return null;
    },
    getStorageKind() {
      return "memory";
    },
    snapshot() {
      return structuredClone(connections);
    }
  };
}

function graphAxiosError({ status, url, body, params }) {
  const error = new Error(`Request failed with status code ${status}`);
  error.response = { status, data: body };
  error.config = { url, params };
  return error;
}

function installGraphMocks({ phoneNumbers, failPhoneNumbers } = {}) {
  const gets = [];
  const posts = [];
  const originalGet = axios.get;
  const originalPost = axios.post;

  axios.get = async (url, config) => {
    const href = String(url);
    gets.push({ url: href, params: { ...(config?.params || {}) } });

    if (/\/me(?:\?|$)/.test(href) || href.endsWith("/me")) {
      throw new Error("GET /me must not be called for Embedded Signup asset discovery");
    }

    if (href.includes("/oauth/access_token")) {
      return { data: { access_token: SECRET_TOKEN } };
    }

    if (href.includes("/phone_numbers")) {
      if (failPhoneNumbers) {
        throw graphAxiosError({
          status: 400,
          url: href,
          params: config?.params,
          body: failPhoneNumbers
        });
      }

      return { data: { data: phoneNumbers || [] } };
    }

    throw new Error(`Unexpected Graph GET: ${href}`);
  };

  axios.post = async (url, body, config) => {
    posts.push({ url: String(url), headers: { ...(config?.headers || {}) } });
    return { data: { success: true } };
  };

  return {
    gets,
    posts,
    restore() {
      axios.get = originalGet;
      axios.post = originalPost;
    }
  };
}

async function withMetaEnv(fn) {
  const saved = {
    META_APP_ID: process.env.META_APP_ID,
    META_APP_SECRET: process.env.META_APP_SECRET,
    WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID,
    WHATSAPP_BUSINESS_ACCOUNT_ID: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
    QR_CHANNEL_WHATSAPP_E164: process.env.QR_CHANNEL_WHATSAPP_E164
  };

  process.env.META_APP_ID = "test-meta-app-id";
  process.env.META_APP_SECRET = "test-meta-app-secret";
  process.env.WHATSAPP_PHONE_NUMBER_ID = ENV_8080_PHONE_NUMBER_ID;
  process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = ENV_8080_WABA_ID;
  process.env.QR_CHANNEL_WHATSAPP_E164 = "17867528080";

  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("source: FINISH WABA ID is required and GET /me discovery is gone", () => {
  assert.doesNotMatch(SERVICE_SRC, /discoverWhatsAppAssets/);
  assert.doesNotMatch(SERVICE_SRC, /facebook\.com\/\$\{version\}\/me/);
  assert.match(SERVICE_SRC, /\/phone_numbers`/);
  assert.match(CONNECT_SRC, /if \(!code \|\| !wabaId/);
  assert.match(CONNECT_SRC, /businessId: onboardingAssetsRef\.current\.businessId/);
  assert.match(FRONTEND_EVENTS_SRC, /payload\.business_id \|\| payload\.businessId/);
  assert.match(ROUTE_SRC, /businessId/);
  assert.match(ROUTE_SRC, /completeEmbeddedSignupExchange\(/);
  assert.doesNotMatch(SERVICE_SRC, /WHATSAPP_PHONE_NUMBER_ID/);
  assert.doesNotMatch(SERVICE_SRC, /WHATSAPP_BUSINESS_ACCOUNT_ID/);
});

test("FINISH payload provides WABA ID, phone number ID, and business ID", () => {
  const parsed = parseEmbeddedSignupPostMessage({
    type: "WA_EMBEDDED_SIGNUP",
    event: "FINISH",
    data: {
      waba_id: FINISH_WABA_ID,
      phone_number_id: CLIENT_PHONE_NUMBER_ID,
      business_id: FINISH_BUSINESS_ID
    }
  });

  assert.equal(parsed.event, "FINISH");
  assert.equal(parsed.wabaId, FINISH_WABA_ID);
  assert.equal(parsed.phoneNumberId, CLIENT_PHONE_NUMBER_ID);
  assert.equal(parsed.businessId, FINISH_BUSINESS_ID);
});

test("phone discovery uses GET /{waba_id}/phone_numbers and never GET /me", async () => {
  const graph = installGraphMocks({
    phoneNumbers: [
      {
        id: CLIENT_PHONE_NUMBER_ID,
        display_phone_number: CLIENT_DISPLAY_PHONE,
        verified_name: "Niovel Perez Corp."
      }
    ]
  });

  try {
    const assets = await resolveConnectionAssets({
      accessToken: SECRET_TOKEN,
      wabaId: FINISH_WABA_ID,
      phoneNumberId: CLIENT_PHONE_NUMBER_ID,
      businessId: FINISH_BUSINESS_ID
    });

    assert.equal(assets.wabaId, FINISH_WABA_ID);
    assert.equal(assets.phoneNumberId, CLIENT_PHONE_NUMBER_ID);
    assert.equal(assets.displayPhoneNumber, CLIENT_DISPLAY_PHONE);
    assert.equal(assets.businessId, FINISH_BUSINESS_ID);
    assert.equal(assets.businessName, "Niovel Perez Corp.");

    assert.equal(graph.gets.length, 1);
    assert.match(graph.gets[0].url, new RegExp(`/${FINISH_WABA_ID}/phone_numbers$`));
    assert.equal(
      graph.gets.some((request) => /\/me(?:\?|$)/.test(request.url) || request.url.endsWith("/me")),
      false
    );
    assert.equal(
      graph.gets.some((request) => request.url.includes(ENV_8080_WABA_ID)),
      false
    );
  } finally {
    graph.restore();
  }
});

test("successful exchange persists org-scoped connected integration with encrypted token", async () => {
  await withMetaEnv(async () => {
    const repo = createMemoryRepo();
    const graph = installGraphMocks({
      phoneNumbers: [
        {
          id: CLIENT_PHONE_NUMBER_ID,
          display_phone_number: CLIENT_DISPLAY_PHONE,
          verified_name: "Niovel Perez Corp."
        }
      ]
    });

    try {
      const result = await completeEmbeddedSignupExchange({
        organizationId: ORG_ID,
        code: `finish-code-${Date.now()}`,
        wabaId: FINISH_WABA_ID,
        phoneNumberId: CLIENT_PHONE_NUMBER_ID,
        businessId: FINISH_BUSINESS_ID,
        onboardingType: "whatsapp_business_app",
        connectionRepository: repo
      });

      const saved = await repo.getConnection(ORG_ID);

      assert.equal(result.success, true);
      assert.equal(saved.organization_id, ORG_ID);
      assert.equal(saved.business_id, FINISH_BUSINESS_ID);
      assert.equal(saved.waba_id, FINISH_WABA_ID);
      assert.equal(saved.phone_number_id, CLIENT_PHONE_NUMBER_ID);
      assert.equal(saved.display_phone_number, CLIENT_DISPLAY_PHONE);
      assert.equal(saved.business_name, "Niovel Perez Corp.");
      assert.equal(saved.connection_type, "whatsapp_business_app");
      assert.equal(saved.status, "connected");
      assert.ok(saved.connected_at);
      assert.match(saved.access_token_encrypted, /^enc:v1:/);
      assert.equal(await repo.getDecryptedAccessToken(ORG_ID), SECRET_TOKEN);

      const safe = toSafeConnection(saved);
      assert.equal(safe.access_token, undefined);
      assert.equal(safe.accessToken, undefined);
      assert.equal(JSON.stringify(safe).includes(SECRET_TOKEN), false);

      assert.equal(saved.waba_id === ENV_8080_WABA_ID, false);
      assert.equal(saved.phone_number_id === ENV_8080_PHONE_NUMBER_ID, false);

      assert.equal(
        graph.gets.some((request) => /\/me(?:\?|$)/.test(request.url) || request.url.endsWith("/me")),
        false
      );
      assert.equal(
        graph.gets.some((request) => request.url.includes("/phone_numbers")),
        true
      );
      assert.equal(
        graph.posts.some((request) => request.url.includes(`/${FINISH_WABA_ID}/subscribed_apps`)),
        true
      );
    } finally {
      graph.restore();
    }
  });
});

test("Graph 400 logs status/code/message without secrets", async () => {
  await withMetaEnv(async () => {
    const existing = {
      [ORG_ID]: {
        organization_id: ORG_ID,
        business_id: "biz-existing",
        waba_id: "waba-existing-must-not-change",
        phone_number_id: "phone-existing-must-not-change",
        display_phone_number: "+1 786-752-8080",
        business_name: "Existing integration",
        connection_type: "whatsapp_business_app",
        status: "connected",
        access_token_encrypted: "enc:v1:existing-must-not-change",
        connected_at: "2026-01-01T00:00:00.000Z"
      }
    };
    const repo = createMemoryRepo(existing);
    const before = repo.snapshot();
    const logs = [];
    const originalError = console.error;
    console.error = (line) => {
      logs.push(String(line));
    };

    const graph = installGraphMocks({
      failPhoneNumbers: {
        error: {
          message: "(#100) Tried accessing nonexisting field (name) on node type (User)",
          type: "GraphMethodException",
          code: 100,
          error_subcode: 33,
          error_user_msg: "The field does not exist.",
          fbtrace_id: "AxyzTrace"
        },
        access_token: SECRET_TOKEN
      }
    });

    try {
      await assert.rejects(
        () =>
          completeEmbeddedSignupExchange({
            organizationId: ORG_ID,
            code: `graph400-code-${Date.now()}`,
            wabaId: FINISH_WABA_ID,
            phoneNumberId: CLIENT_PHONE_NUMBER_ID,
            connectionRepository: repo
          }),
        (error) => error.publicCode === COMPLETION_STAGES.ASSET_DISCOVERY_FAILED
      );

      const discoveryLog = logs
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .find((entry) => entry?.stage === COMPLETION_STAGES.ASSET_DISCOVERY_FAILED);

      assert.ok(discoveryLog, "ASSET_DISCOVERY_FAILED must be logged");
      assert.equal(discoveryLog.responseStatus, 400);
      assert.equal(discoveryLog.graphErrorCode, 100);
      assert.equal(discoveryLog.graphErrorSubcode, 33);
      assert.match(String(discoveryLog.message), /Tried accessing nonexisting field/);
      assert.match(String(discoveryLog.graphPath), /\/phone_numbers$/);
      assert.equal(discoveryLog.graphResponseBody?.access_token, "[redacted]");
      assert.equal(JSON.stringify(discoveryLog).includes(SECRET_TOKEN), false);
      assert.equal(JSON.stringify(logs).includes(SECRET_TOKEN), false);

      assert.deepEqual(repo.snapshot(), before);
    } finally {
      console.error = originalError;
      graph.restore();
    }
  });
});

test("discovery failure does not overwrite an existing integration", async () => {
  await withMetaEnv(async () => {
    const repo = createMemoryRepo({
      [ORG_ID]: {
        organization_id: ORG_ID,
        waba_id: "keep-this-waba",
        phone_number_id: "keep-this-phone",
        status: "connected",
        access_token_encrypted: "enc:v1:keep",
        connected_at: "2026-02-02T00:00:00.000Z"
      }
    });
    const before = repo.snapshot();
    const graph = installGraphMocks({
      failPhoneNumbers: {
        error: { message: "Unsupported get request", type: "GraphMethodException", code: 100 }
      }
    });

    try {
      await assert.rejects(() =>
        completeEmbeddedSignupExchange({
          organizationId: ORG_ID,
          code: `no-overwrite-${Date.now()}`,
          wabaId: FINISH_WABA_ID,
          connectionRepository: repo
        })
      );

      assert.deepEqual(repo.snapshot(), before);
      assert.equal(repo.snapshot()[ORG_ID].waba_id, "keep-this-waba");
    } finally {
      graph.restore();
    }
  });
});

test("missing FINISH WABA ID fails closed before Graph and does not persist", async () => {
  await withMetaEnv(async () => {
    const repo = createMemoryRepo();
    const graph = installGraphMocks({ phoneNumbers: [] });

    try {
      await assert.rejects(
        () =>
          completeEmbeddedSignupExchange({
            organizationId: ORG_ID,
            code: `missing-waba-${Date.now()}`,
            connectionRepository: repo
          }),
        (error) =>
          error.publicCode === COMPLETION_STAGES.ASSET_DISCOVERY_FAILED && error.statusCode === 422
      );

      assert.equal(graph.gets.length, 0);
      assert.equal(graph.posts.length, 0);
      assert.equal(await repo.getConnection(ORG_ID), null);
    } finally {
      graph.restore();
    }
  });
});

test("redactSecretsFromLogDetails strips tokens but keeps Graph error codes", () => {
  const redacted = redactSecretsFromLogDetails({
    responseStatus: 400,
    graphErrorCode: 100,
    graphResponseBody: {
      error: { message: "bad field", code: 100 },
      access_token: SECRET_TOKEN
    },
    message: `token ${SECRET_TOKEN} leaked`
  });

  assert.equal(redacted.responseStatus, 400);
  assert.equal(redacted.graphErrorCode, 100);
  assert.equal(redacted.graphResponseBody.access_token, "[redacted]");
  assert.equal(redacted.graphResponseBody.error.code, 100);
  assert.match(redacted.message, /\[redacted\]/);
  assert.equal(redacted.message.includes(SECRET_TOKEN), false);
});

test("schema 015 persists encrypted token but has no expiry column", () => {
  assert.match(MIGRATION_015, /access_token_encrypted TEXT/);
  assert.match(MIGRATION_015, /organization_id UUID NOT NULL UNIQUE/);
  assert.match(MIGRATION_015, /status TEXT NOT NULL DEFAULT 'pending'/);
  assert.doesNotMatch(MIGRATION_015, /token_expires/);
  assert.doesNotMatch(MIGRATION_015, /expires_at/);
  assert.doesNotMatch(MIGRATION_015, /expires_in/);
});

test("buildAssetDiscoveryFailureLogDetails includes Graph status and path", () => {
  const error = graphAxiosError({
    status: 400,
    url: `https://graph.facebook.com/v25.0/${FINISH_WABA_ID}/phone_numbers`,
    params: { access_token: SECRET_TOKEN },
    body: {
      error: { message: "Unsupported get request", type: "GraphMethodException", code: 100 }
    }
  });

  const details = buildAssetDiscoveryFailureLogDetails(error, {
    wabaId: FINISH_WABA_ID,
    phoneNumberId: CLIENT_PHONE_NUMBER_ID
  });

  assert.equal(details.responseStatus, 400);
  assert.equal(details.graphErrorCode, 100);
  assert.equal(details.graphHost, "graph.facebook.com");
  assert.equal(details.graphPath, `/v25.0/${FINISH_WABA_ID}/phone_numbers`);
  assert.equal(details.wabaIdPresent, true);
  assert.equal(JSON.stringify(details).includes(SECRET_TOKEN), false);
});
