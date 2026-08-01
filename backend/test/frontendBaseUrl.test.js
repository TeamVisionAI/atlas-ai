const test = require("node:test");
const assert = require("node:assert/strict");
const {
  FRONTEND_URL_ENV_KEYS,
  DEV_DEFAULT_FRONTEND_URL,
  readConfiguredFrontendUrl,
  resolveFrontendBaseUrl
} = require("../config/frontendBaseUrl");

test("readConfiguredFrontendUrl prefers FRONTEND_URL over legacy aliases", () => {
  const url = readConfiguredFrontendUrl({
    FRONTEND_URL: "https://www.teamvisionfinancial.com/",
    ATLAS_FRONTEND_URL: "https://legacy.example.com",
    APP_URL: "https://app.example.com"
  });

  assert.equal(url, "https://www.teamvisionfinancial.com");
});

test("readConfiguredFrontendUrl accepts ATLAS_FRONTEND_URL and APP_URL aliases", () => {
  assert.equal(
    readConfiguredFrontendUrl({ ATLAS_FRONTEND_URL: "https://atlas.example.com/" }),
    "https://atlas.example.com"
  );
  assert.equal(
    readConfiguredFrontendUrl({ APP_URL: "https://app.example.com" }),
    "https://app.example.com"
  );
});

test("resolveFrontendBaseUrl uses localhost only in non-production", () => {
  assert.equal(resolveFrontendBaseUrl({ NODE_ENV: "development" }), DEV_DEFAULT_FRONTEND_URL);
  assert.equal(
    resolveFrontendBaseUrl({
      NODE_ENV: "development",
      FRONTEND_URL: "http://localhost:5173"
    }),
    "http://localhost:5173"
  );
});

test("resolveFrontendBaseUrl requires explicit URL in production", () => {
  assert.throws(
    () => resolveFrontendBaseUrl({ NODE_ENV: "production" }),
    /FRONTEND_URL is required in production/
  );
});

test("resolveFrontendBaseUrl uses configured production domain", () => {
  assert.equal(
    resolveFrontendBaseUrl({
      NODE_ENV: "production",
      FRONTEND_URL: "https://www.teamvisionfinancial.com"
    }),
    "https://www.teamvisionfinancial.com"
  );
});

test("FRONTEND_URL_ENV_KEYS documents supported variables", () => {
  assert.deepEqual(FRONTEND_URL_ENV_KEYS, ["FRONTEND_URL", "ATLAS_FRONTEND_URL", "APP_URL"]);
});
