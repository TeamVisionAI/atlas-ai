import test from "node:test";
import assert from "node:assert/strict";
import {
  DOCUMENTED_PRODUCTION_API_BASE,
  isProductionRailwayApiUrl,
  resolveApiBaseUrl
} from "./apiBaseUrl.js";

test("local DEV still uses empty proxy base", () => {
  assert.equal(
    resolveApiBaseUrl({
      DEV: true,
      VITE_ATLAS_ENV: "staging",
      VITE_API_BASE_URL: "https://atlas-ai-staging.up.railway.app"
    }),
    ""
  );
});

test("production fallback remains when VITE_ATLAS_ENV is unset", () => {
  assert.equal(resolveApiBaseUrl({ DEV: false }), DOCUMENTED_PRODUCTION_API_BASE);
  assert.equal(
    resolveApiBaseUrl({
      DEV: false,
      VITE_API_BASE_URL: "https://custom.example.com/"
    }),
    "https://custom.example.com"
  );
});

test("staging build fails closed without VITE_API_BASE_URL", () => {
  assert.throws(
    () =>
      resolveApiBaseUrl({
        DEV: false,
        VITE_ATLAS_ENV: "staging"
      }),
    /requires VITE_API_BASE_URL/
  );
});

test("staging build fails closed when API host is production Railway", () => {
  assert.equal(isProductionRailwayApiUrl(DOCUMENTED_PRODUCTION_API_BASE), true);
  assert.throws(
    () =>
      resolveApiBaseUrl({
        DEV: false,
        VITE_ATLAS_ENV: "staging",
        VITE_API_BASE_URL: DOCUMENTED_PRODUCTION_API_BASE
      }),
    /must not point at production Railway/
  );
});

test("staging build accepts an explicit non-production API URL", () => {
  assert.equal(
    resolveApiBaseUrl({
      DEV: false,
      VITE_ATLAS_ENV: "staging",
      VITE_API_BASE_URL: "https://atlas-ai-staging.up.railway.app/"
    }),
    "https://atlas-ai-staging.up.railway.app"
  );
  assert.equal(
    resolveApiBaseUrl({
      DEV: false,
      VITE_ATLAS_ENV: "staging",
      VITE_API_BASE_URL: "https://atlas-ai-staging-staging.up.railway.app/"
    }),
    "https://atlas-ai-staging-staging.up.railway.app"
  );
});
