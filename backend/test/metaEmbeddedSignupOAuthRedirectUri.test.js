/**
 * Embedded Signup Graph oauth/access_token must send only client_id, client_secret, code.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const axios = require("axios");

const { exchangeAuthorizationCodeForToken } = require("../core/metaEmbeddedSignupService");

test("Graph exchange sends only client_id, client_secret, and code", async () => {
  const connectSrc = fs.readFileSync(
    path.join(__dirname, "../../frontend/src/pages/WhatsAppConnect.jsx"),
    "utf8"
  );

  assert.match(connectSrc, /window\.FB\.login\(fbLoginCallback/);
  assert.doesNotMatch(connectSrc, /redirect_uri:/);
  assert.match(connectSrc, /config_id: configId/);
  assert.match(connectSrc, /response_type: "code"/);
  assert.match(connectSrc, /override_default_response_type: true/);
  assert.match(connectSrc, /response\?\.authResponse\?\.code/);

  const originalGet = axios.get;
  const savedEnv = {
    META_APP_ID: process.env.META_APP_ID,
    META_APP_SECRET: process.env.META_APP_SECRET
  };
  let captured = null;

  process.env.META_APP_ID = "test-meta-app-id";
  process.env.META_APP_SECRET = "test-meta-app-secret";

  axios.get = async (url, config) => {
    captured = { url, params: { ...(config?.params || {}) } };
    return { data: { access_token: "test-access-token" } };
  };

  try {
    await exchangeAuthorizationCodeForToken("test-auth-code");

    assert.ok(captured);
    assert.match(captured.url, /\/oauth\/access_token$/);
    assert.deepEqual(Object.keys(captured.params).sort(), [
      "client_id",
      "client_secret",
      "code"
    ]);
    assert.equal(captured.params.client_id, "test-meta-app-id");
    assert.equal(captured.params.client_secret, "test-meta-app-secret");
    assert.equal(captured.params.code, "test-auth-code");
    assert.equal(Object.hasOwn(captured.params, "redirect_uri"), false);
  } finally {
    axios.get = originalGet;

    if (savedEnv.META_APP_ID === undefined) {
      delete process.env.META_APP_ID;
    } else {
      process.env.META_APP_ID = savedEnv.META_APP_ID;
    }

    if (savedEnv.META_APP_SECRET === undefined) {
      delete process.env.META_APP_SECRET;
    } else {
      process.env.META_APP_SECRET = savedEnv.META_APP_SECRET;
    }
  }
});
