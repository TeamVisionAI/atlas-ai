import test from "node:test";
import assert from "node:assert/strict";
import { resolveViteBuildMode } from "./viteBuild.mjs";

test("Vercel Preview uses staging vite mode", () => {
  assert.equal(resolveViteBuildMode({ VERCEL_ENV: "preview" }), "staging");
  assert.equal(resolveViteBuildMode({ VERCEL_ENV: "PREVIEW" }), "staging");
});

test("production and local builds stay production mode", () => {
  assert.equal(resolveViteBuildMode({}), "production");
  assert.equal(resolveViteBuildMode({ VERCEL_ENV: "production" }), "production");
  assert.equal(resolveViteBuildMode({ VERCEL_ENV: "development" }), "production");
});
