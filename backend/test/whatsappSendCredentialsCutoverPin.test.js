/**
 * Cutover pin: org whatsapp_integrations is used for outbound/media-fetch
 * only when it matches the active env phone (and WABA when both are set).
 * Saved rows must not be modified.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  resolveWhatsAppSendCredentials,
  isOrgConnectionEligibleForRouting
} = require("../core/whatsappSendCredentials");
const { fetchWhatsAppAudioBytes } = require("../core/communicationMedia/whatsappMediaFetchService");

const ORG_ID = "00000000-0000-4000-8000-000000000001";
const ENV_8080_PHONE = "1347188398469744";
const ENV_8080_WABA = "984287654667441";
const ORG_7338_PHONE = "3059997338-phone-id";
const ORG_7338_WABA = "3059997338-waba-id";
const ENV_8080_TOKEN = "env-8080-access-token";
const ORG_7338_TOKEN = "org-7338-access-token";

function createTrackingRepo(connection) {
  const row = connection ? structuredClone(connection) : null;
  const mutations = [];

  return {
    async getConnection() {
      return row ? structuredClone(row) : null;
    },
    async findConnectionByPhoneNumberId(phoneNumberId) {
      if (!row || row.status !== "connected") {
        return null;
      }
      if (String(row.phone_number_id) === String(phoneNumberId)) {
        return structuredClone(row);
      }
      return null;
    },
    async getDecryptedAccessToken() {
      if (!row?.access_token_encrypted || row.status !== "connected") {
        return null;
      }
      return ORG_7338_TOKEN;
    },
    async saveConnection() {
      mutations.push("saveConnection");
      throw new Error("saveConnection must not run during credential resolution");
    },
    async updateConnection() {
      mutations.push("updateConnection");
      throw new Error("updateConnection must not run during credential resolution");
    },
    async disconnectConnection() {
      mutations.push("disconnectConnection");
      throw new Error("disconnectConnection must not run during credential resolution");
    },
    mutations,
    snapshot() {
      return row ? structuredClone(row) : null;
    }
  };
}

function connected7338(overrides = {}) {
  return {
    organization_id: ORG_ID,
    status: "connected",
    phone_number_id: ORG_7338_PHONE,
    waba_id: ORG_7338_WABA,
    display_phone_number: "+1 305-999-7338",
    access_token_encrypted: "enc:v1:org-7338",
    connected_at: "2026-08-17T00:00:00.000Z",
    ...overrides
  };
}

async function withEnv(overrides, fn) {
  const keys = [
    "WHATSAPP_ACCESS_TOKEN",
    "WHATSAPP_PHONE_NUMBER_ID",
    "WHATSAPP_BUSINESS_ACCOUNT_ID"
  ];
  const previous = {};
  for (const key of keys) {
    previous[key] = process.env[key];
    if (overrides[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = overrides[key];
    }
  }

  try {
    return await fn();
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
}

test("inbound phone_number_id routes embedded signup even when env pin differs", async () => {
  await withEnv(
    {
      WHATSAPP_ACCESS_TOKEN: ENV_8080_TOKEN,
      WHATSAPP_PHONE_NUMBER_ID: ENV_8080_PHONE,
      WHATSAPP_BUSINESS_ACCOUNT_ID: ENV_8080_WABA
    },
    async () => {
      const repo = createTrackingRepo(connected7338());
      const credentials = await resolveWhatsAppSendCredentials(ORG_ID, {
        connectionRepository: repo,
        phoneNumberId: ORG_7338_PHONE
      });

      assert.equal(credentials.source, "embedded_signup");
      assert.equal(credentials.phoneNumberId, ORG_7338_PHONE);
      assert.equal(credentials.accessToken, ORG_7338_TOKEN);
      assert.deepEqual(repo.mutations, []);
    }
  );
});

test("org 7338 + env 8080 selects environment 8080 credentials", async () => {
  await withEnv(
    {
      WHATSAPP_ACCESS_TOKEN: ENV_8080_TOKEN,
      WHATSAPP_PHONE_NUMBER_ID: ENV_8080_PHONE,
      WHATSAPP_BUSINESS_ACCOUNT_ID: ENV_8080_WABA
    },
    async () => {
      const repo = createTrackingRepo(connected7338());
      const before = repo.snapshot();
      const credentials = await resolveWhatsAppSendCredentials(ORG_ID, {
        connectionRepository: repo
      });

      assert.equal(credentials.source, "environment");
      assert.equal(credentials.phoneNumberId, ENV_8080_PHONE);
      assert.equal(credentials.accessToken, ENV_8080_TOKEN);
      assert.equal(credentials.accessToken === ORG_7338_TOKEN, false);
      assert.deepEqual(repo.snapshot(), before);
      assert.deepEqual(repo.mutations, []);
    }
  );
});

test("org 7338 + env 7338 selects embedded-signup credentials", async () => {
  await withEnv(
    {
      WHATSAPP_ACCESS_TOKEN: ENV_8080_TOKEN,
      WHATSAPP_PHONE_NUMBER_ID: ORG_7338_PHONE,
      WHATSAPP_BUSINESS_ACCOUNT_ID: ORG_7338_WABA
    },
    async () => {
      const repo = createTrackingRepo(connected7338());
      const before = repo.snapshot();
      const credentials = await resolveWhatsAppSendCredentials(ORG_ID, {
        connectionRepository: repo
      });

      assert.equal(credentials.source, "embedded_signup");
      assert.equal(credentials.phoneNumberId, ORG_7338_PHONE);
      assert.equal(credentials.wabaId, ORG_7338_WABA);
      assert.equal(credentials.accessToken, ORG_7338_TOKEN);
      assert.deepEqual(repo.snapshot(), before);
      assert.deepEqual(repo.mutations, []);
    }
  );
});

test("phone matches but conflicting WABA selects environment credentials", async () => {
  await withEnv(
    {
      WHATSAPP_ACCESS_TOKEN: ENV_8080_TOKEN,
      WHATSAPP_PHONE_NUMBER_ID: ORG_7338_PHONE,
      WHATSAPP_BUSINESS_ACCOUNT_ID: ENV_8080_WABA
    },
    async () => {
      const repo = createTrackingRepo(connected7338());
      const credentials = await resolveWhatsAppSendCredentials(ORG_ID, {
        connectionRepository: repo
      });

      assert.equal(credentials.source, "environment");
      assert.equal(credentials.phoneNumberId, ORG_7338_PHONE);
      assert.equal(credentials.accessToken, ENV_8080_TOKEN);
      assert.equal(isOrgConnectionEligibleForRouting(connected7338()), false);
      assert.deepEqual(repo.mutations, []);
    }
  );
});

test("missing env phone ID ignores org row and does not throw", async () => {
  await withEnv(
    {
      WHATSAPP_ACCESS_TOKEN: ENV_8080_TOKEN,
      WHATSAPP_PHONE_NUMBER_ID: undefined,
      WHATSAPP_BUSINESS_ACCOUNT_ID: ENV_8080_WABA
    },
    async () => {
      const repo = createTrackingRepo(connected7338());
      const before = repo.snapshot();
      const credentials = await resolveWhatsAppSendCredentials(ORG_ID, {
        connectionRepository: repo
      });

      assert.equal(credentials, null);
      assert.deepEqual(repo.snapshot(), before);
      assert.deepEqual(repo.mutations, []);
    }
  );
});

test("media-fetch uses the same pinned credential resolution", async () => {
  await withEnv(
    {
      WHATSAPP_ACCESS_TOKEN: ENV_8080_TOKEN,
      WHATSAPP_PHONE_NUMBER_ID: ENV_8080_PHONE,
      WHATSAPP_BUSINESS_ACCOUNT_ID: ENV_8080_WABA
    },
    async () => {
      const repo = createTrackingRepo(connected7338());
      const resolved = [];
      const downloaded = await fetchWhatsAppAudioBytes({
        organizationId: ORG_ID,
        metaMediaId: "media-7338-must-not-win",
        credentialsResolver: async (organizationId) => {
          const credentials = await resolveWhatsAppSendCredentials(organizationId, {
            connectionRepository: repo
          });
          resolved.push(credentials);
          return credentials;
        },
        graphGetJson: async () => ({ url: "https://example.test/audio" }),
        downloadBytes: async () => ({ buffer: Buffer.from("ogg"), mimeType: "audio/ogg" })
      });

      assert.equal(resolved.length, 1);
      assert.equal(resolved[0].source, "environment");
      assert.equal(resolved[0].phoneNumberId, ENV_8080_PHONE);
      assert.equal(resolved[0].accessToken, ENV_8080_TOKEN);
      assert.equal(downloaded.source, "environment");
      assert.deepEqual(repo.mutations, []);
    }
  );
});

test("media-fetch after cutover uses embedded-signup credentials", async () => {
  await withEnv(
    {
      WHATSAPP_ACCESS_TOKEN: ENV_8080_TOKEN,
      WHATSAPP_PHONE_NUMBER_ID: ORG_7338_PHONE,
      WHATSAPP_BUSINESS_ACCOUNT_ID: ORG_7338_WABA
    },
    async () => {
      const repo = createTrackingRepo(connected7338());
      const downloaded = await fetchWhatsAppAudioBytes({
        organizationId: ORG_ID,
        metaMediaId: "media-7338",
        credentialsResolver: (organizationId) =>
          resolveWhatsAppSendCredentials(organizationId, { connectionRepository: repo }),
        graphGetJson: async () => ({ url: "https://example.test/audio" }),
        downloadBytes: async () => ({ buffer: Buffer.from("ogg"), mimeType: "audio/ogg" })
      });

      assert.equal(downloaded.source, "embedded_signup");
      assert.deepEqual(repo.mutations, []);
    }
  );
});

test("rollback env 8080 with leftover org 7338 row returns env credentials", async () => {
  await withEnv(
    {
      WHATSAPP_ACCESS_TOKEN: ENV_8080_TOKEN,
      WHATSAPP_PHONE_NUMBER_ID: ENV_8080_PHONE,
      WHATSAPP_BUSINESS_ACCOUNT_ID: ENV_8080_WABA
    },
    async () => {
      const repo = createTrackingRepo(connected7338());
      const credentials = await resolveWhatsAppSendCredentials(ORG_ID, {
        connectionRepository: repo
      });

      assert.equal(credentials.source, "environment");
      assert.equal(credentials.phoneNumberId, ENV_8080_PHONE);
      assert.equal(repo.snapshot().status, "connected");
      assert.equal(repo.snapshot().phone_number_id, ORG_7338_PHONE);
      assert.deepEqual(repo.mutations, []);
    }
  );
});

test("media-fetch source still resolves through whatsappSendCredentials", () => {
  const fetchSrc = fs.readFileSync(
    path.join(__dirname, "../core/communicationMedia/whatsappMediaFetchService.js"),
    "utf8"
  );
  const outboundSrc = fs.readFileSync(
    path.join(__dirname, "../core/whatsappOutboundPipeline.js"),
    "utf8"
  );
  const pinSrc = fs.readFileSync(path.join(__dirname, "../core/whatsappSendCredentials.js"), "utf8");

  assert.match(fetchSrc, /resolveWhatsAppSendCredentials/);
  assert.match(outboundSrc, /resolveWhatsAppSendCredentials/);
  assert.match(outboundSrc, /inboundPhoneNumberId/);
  assert.match(pinSrc, /findConnectionByPhoneNumberId/);
  assert.match(pinSrc, /isOrgConnectionEligibleForRouting/);
  assert.doesNotMatch(pinSrc, /saveConnection|updateConnection|disconnectConnection/);
});
