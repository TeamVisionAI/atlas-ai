/**
 * Embedded Signup Graph exchange must send the FB.login JS SDK OAuth redirect_uri.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const axios = require("axios");

const {
  META_JS_SDK_OAUTH_REDIRECT_URI,
  resolveEmbeddedSignupOAuthRedirectUri,
  describeOAuthRedirectUriForLogs,
  exchangeAuthorizationCodeForToken
} = require("../core/metaEmbeddedSignupService");

const AUTH_CODE = "AQTESTCODE_embedded_signup_oauth_exchange_value";
const APP_SECRET = "test-meta-app-secret-value";
const ACCESS_TOKEN = "EAATESTTOKEN_should_never_be_logged";

function captureLogs(fn) {
  const original = {
    log: console.log,
    warn: console.warn,
    error: console.error
  };
  const lines = [];

  function sink(...args) {
    lines.push(args.map((value) => String(value)).join(" "));
  }

  console.log = sink;
  console.warn = sink;
  console.error = sink;

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      console.log = original.log;
      console.warn = original.warn;
      console.error = original.error;
    })
    .then((result) => ({ result, lines: lines.join("\n") }));
}

test("JS SDK FB.login OAuth dialog redirect_uri is the XD arbiter without fragment", () => {
  assert.equal(
    resolveEmbeddedSignupOAuthRedirectUri(),
    "https://staticxx.facebook.com/x/connect/xd_arbiter/?version=46"
  );
  assert.equal(META_JS_SDK_OAUTH_REDIRECT_URI, resolveEmbeddedSignupOAuthRedirectUri());
  assert.equal(new URL(META_JS_SDK_OAUTH_REDIRECT_URI).hash, "");
});

test("frontend FB.login does not pass redirect_uri, so exchange uses the SDK dialog URI", () => {
  const connectSrc = fs.readFileSync(
    path.join(__dirname, "../../frontend/src/pages/WhatsAppConnect.jsx"),
    "utf8"
  );
  const sdkSrc = fs.readFileSync(
    path.join(__dirname, "../../frontend/src/hooks/useFacebookSdk.js"),
    "utf8"
  );

  assert.match(connectSrc, /window\.FB\.login\(fbLoginCallback/);
  assert.match(connectSrc, /config_id: configId/);
  assert.match(connectSrc, /response_type: "code"/);
  assert.doesNotMatch(connectSrc, /redirect_uri/);
  assert.doesNotMatch(sdkSrc, /redirect_uri/);
  assert.match(sdkSrc, /window\.FB\.init\(\{/);
});

test("describeOAuthRedirectUriForLogs exposes host/path/query only", () => {
  const described = describeOAuthRedirectUriForLogs(META_JS_SDK_OAUTH_REDIRECT_URI);

  assert.deepEqual(described, {
    redirectUriHost: "staticxx.facebook.com",
    redirectUriPath: "/x/connect/xd_arbiter/",
    redirectUriQuery: "?version=46"
  });
});

test("authorization-code exchange includes the FB.login redirect_uri and does not log secrets", async () => {
  const originalGet = axios.get;
  const savedEnv = {
    META_APP_ID: process.env.META_APP_ID,
    META_APP_SECRET: process.env.META_APP_SECRET
  };

  let captured = null;

  process.env.META_APP_ID = "1023033667266162";
  process.env.META_APP_SECRET = APP_SECRET;

  axios.get = async (url, config) => {
    captured = { url, params: { ...(config?.params || {}) } };
    return { data: { access_token: ACCESS_TOKEN } };
  };

  try {
    const { result, lines } = await captureLogs(() =>
      exchangeAuthorizationCodeForToken(AUTH_CODE)
    );

    assert.equal(result, ACCESS_TOKEN);
    assert.ok(captured);
    assert.match(captured.url, /\/oauth\/access_token$/);
    assert.equal(captured.params.client_id, "1023033667266162");
    assert.equal(captured.params.code, AUTH_CODE);
    assert.equal(captured.params.redirect_uri, META_JS_SDK_OAUTH_REDIRECT_URI);
    assert.equal(captured.params.client_secret, APP_SECRET);

    assert.match(lines, /"requestParams":\["client_id","client_secret","code","redirect_uri"\]/);
    assert.match(lines, /"redirectUriHost":"staticxx\.facebook\.com"/);
    assert.match(lines, /"redirectUriPath":"\/x\/connect\/xd_arbiter\/"/);
    assert.match(lines, /"redirectUriQuery":"\?version=46"/);

    assert.doesNotMatch(lines, new RegExp(APP_SECRET));
    assert.doesNotMatch(lines, new RegExp(ACCESS_TOKEN));
    assert.doesNotMatch(lines, new RegExp(AUTH_CODE));
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
