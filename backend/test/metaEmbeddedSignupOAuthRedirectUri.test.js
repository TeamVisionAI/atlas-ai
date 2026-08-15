/**
 * Graph oauth/access_token must send the allowlisted Connect-page redirect_uri.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const axios = require("axios");

const {
  STAGING_CONNECT_REDIRECT_URI,
  exchangeAuthorizationCodeForToken,
  resolveEmbeddedSignupOAuthRedirectUri
} = require("../core/metaEmbeddedSignupService");

test("Graph exchange sends allowlisted Connect-page redirect_uri, not xd_arbiter", async () => {
  const connectSrc = fs.readFileSync(
    path.join(__dirname, "../../frontend/src/pages/WhatsAppConnect.jsx"),
    "utf8"
  );

  assert.match(connectSrc, /window\.FB\.login\(fbLoginCallback/);
  assert.doesNotMatch(connectSrc, /redirect_uri:/);
  assert.match(
    connectSrc,
    /redirectUri: `\$\{window\.location\.origin\}\$\{window\.location\.pathname\}`/
  );

  assert.equal(
    resolveEmbeddedSignupOAuthRedirectUri(
      `${STAGING_CONNECT_REDIRECT_URI}/?from=login#ignored`,
      { FRONTEND_URL: "https://atlas-ai-git-feature-atlas-staging-teamvisionfinancial.vercel.app" }
    ),
    STAGING_CONNECT_REDIRECT_URI
  );

  assert.throws(
    () =>
      resolveEmbeddedSignupOAuthRedirectUri("https://evil.example/app/settings/whatsapp", {
        FRONTEND_URL: "https://atlas-ai-git-feature-atlas-staging-teamvisionfinancial.vercel.app"
      }),
    (error) => error.publicCode === "INVALID_REDIRECT_URI"
  );

  const originalGet = axios.get;
  const savedEnv = {
    META_APP_ID: process.env.META_APP_ID,
    META_APP_SECRET: process.env.META_APP_SECRET,
    FRONTEND_URL: process.env.FRONTEND_URL
  };
  let captured = null;

  process.env.META_APP_ID = "test-meta-app-id";
  process.env.META_APP_SECRET = "test-meta-app-secret";
  process.env.FRONTEND_URL =
    "https://atlas-ai-git-feature-atlas-staging-teamvisionfinancial.vercel.app";

  axios.get = async (url, config) => {
    captured = { url, params: { ...(config?.params || {}) } };
    return { data: { access_token: "test-access-token" } };
  };

  try {
    await exchangeAuthorizationCodeForToken("test-auth-code", STAGING_CONNECT_REDIRECT_URI);

    assert.ok(captured);
    assert.match(captured.url, /\/oauth\/access_token$/);
    assert.equal(captured.params.redirect_uri, STAGING_CONNECT_REDIRECT_URI);
    assert.doesNotMatch(String(captured.params.redirect_uri), /staticxx\.facebook\.com/);
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

    if (savedEnv.FRONTEND_URL === undefined) {
      delete process.env.FRONTEND_URL;
    } else {
      process.env.FRONTEND_URL = savedEnv.FRONTEND_URL;
    }
  }
});
