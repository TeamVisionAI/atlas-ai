/**
 * Graph oauth/access_token must send the JS SDK xd_arbiter redirect_uri.
 * FB.login must not set redirect_uri (SDK uses its internal arbiter).
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const axios = require("axios");

const { exchangeAuthorizationCodeForToken } = require("../core/metaEmbeddedSignupService");

const SDK_OAUTH_REDIRECT_URI =
  "https://staticxx.facebook.com/x/connect/xd_arbiter/?version=46";

test("FB.login omits redirect_uri and Graph exchange sends the SDK xd_arbiter URI", async () => {
  const connectSrc = fs.readFileSync(
    path.join(__dirname, "../../frontend/src/pages/WhatsAppConnect.jsx"),
    "utf8"
  );

  assert.match(connectSrc, /window\.FB\.login\(fbLoginCallback/);
  assert.doesNotMatch(connectSrc, /redirect_uri/);

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
    assert.equal(captured.params.redirect_uri, SDK_OAUTH_REDIRECT_URI);
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
