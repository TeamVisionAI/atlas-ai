#!/usr/bin/env node
/**
 * Vercel Preview uses Vite `--mode staging` so Preview cannot silently inherit
 * production API routing. Production and local `npm run build` stay production mode.
 *
 * Vercel often injects Production-scoped `VITE_API_BASE_URL` into Preview builds.
 * That overrides committed `.env.staging` and causes a synchronous runtime throw in
 * `resolveApiBaseUrl()` before React mounts (blank white page).
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DOCUMENTED_STAGING_API_BASE,
  isProductionRailwayApiUrl
} from "../src/config/apiBaseUrl.js";

export function resolveViteBuildMode(env = process.env) {
  return String(env.VERCEL_ENV || "").trim().toLowerCase() === "preview"
    ? "staging"
    : "production";
}

/**
 * Ensure Preview builds bake a staging-safe API base URL into the bundle.
 * Vite gives process env higher priority than `.env.staging`, so an empty or
 * production-scoped Vercel variable must be corrected before `vite build`.
 */
export function ensurePreviewBuildEnv(env = process.env) {
  if (resolveViteBuildMode(env) !== "staging") {
    return env;
  }

  const configured = String(env.VITE_API_BASE_URL || "").trim();
  if (configured && !isProductionRailwayApiUrl(configured)) {
    return env;
  }

  return {
    ...env,
    VITE_API_BASE_URL: DOCUMENTED_STAGING_API_BASE
  };
}

const invokedDirectly =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const mode = resolveViteBuildMode();
  const buildEnv = ensurePreviewBuildEnv();
  const viteBin = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "node_modules", ".bin", "vite");
  const result = spawnSync(viteBin, ["build", "--mode", mode], {
    stdio: "inherit",
    env: buildEnv
  });
  process.exit(result.status ?? 1);
}
