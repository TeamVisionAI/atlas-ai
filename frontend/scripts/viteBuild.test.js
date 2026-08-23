import test from "node:test";
import assert from "node:assert/strict";
import { resolveViteBuildMode, ensurePreviewBuildEnv } from "./viteBuild.mjs";
import { DOCUMENTED_STAGING_API_BASE } from "../src/config/apiBaseUrl.js";

test("Vercel Preview uses staging vite mode", () => {
  assert.equal(resolveViteBuildMode({ VERCEL_ENV: "preview" }), "staging");
  assert.equal(resolveViteBuildMode({ VERCEL_ENV: "PREVIEW" }), "staging");
});

test("production and local builds stay production mode", () => {
  assert.equal(resolveViteBuildMode({}), "production");
  assert.equal(resolveViteBuildMode({ VERCEL_ENV: "production" }), "production");
  assert.equal(resolveViteBuildMode({ VERCEL_ENV: "development" }), "production");
});

test("Preview build replaces empty or production VITE_API_BASE_URL", () => {
  const preview = { VERCEL_ENV: "preview" };

  assert.equal(
    ensurePreviewBuildEnv({ ...preview, VITE_API_BASE_URL: "" }).VITE_API_BASE_URL,
    DOCUMENTED_STAGING_API_BASE
  );
  assert.equal(
    ensurePreviewBuildEnv({
      ...preview,
      VITE_API_BASE_URL: "https://atlas-ai-production-01de.up.railway.app"
    }).VITE_API_BASE_URL,
    DOCUMENTED_STAGING_API_BASE
  );
});

test("Preview build keeps explicit staging VITE_API_BASE_URL", () => {
  const stagingUrl = "https://atlas-ai-staging.up.railway.app";
  const env = ensurePreviewBuildEnv({
    VERCEL_ENV: "preview",
    VITE_API_BASE_URL: stagingUrl
  });

  assert.equal(env.VITE_API_BASE_URL, stagingUrl);
});

test("Production build env is not rewritten", () => {
  const env = ensurePreviewBuildEnv({
    VERCEL_ENV: "production",
    VITE_API_BASE_URL: "https://atlas-ai-production-01de.up.railway.app"
  });

  assert.equal(env.VITE_API_BASE_URL, "https://atlas-ai-production-01de.up.railway.app");
});
