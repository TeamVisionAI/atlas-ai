/**
 * Graph oauth/access_token redirect_uri must equal the frontend FB.login redirect_uri.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const axios = require("axios");

const { exchangeAuthorizationCodeForToken } = require("../core/metaEmbeddedSignupService");

test("exchange redirect_uri equals frontend FB.login redirect_uri", async () => {
  const connectSrc = fs.readFileSync(
    path.join(__dirname, "../../frontend/src/pages/WhatsAppConnect.jsx"),
    "utf8"
  );
  const frontendMatch = connectSrc.match(
    /export const META_EMBEDDED_SIGNUP_REDIRECT_URI =\s*"([^"]+)"/
  );

  assert.ok(frontendMatch, "frontend exports META_EMBEDDED_SIGNUP_REDIRECT_URI");
  assert.match(connectSrc, /redirect_uri: META_EMBEDDED_SIGNUP_REDIRECT_URI/);

  const frontendRedirectUri = frontendMatch[1];
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
    assert.equal(captured.params.redirect_uri, frontendRedirectUri);
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
