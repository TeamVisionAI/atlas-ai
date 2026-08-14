#!/usr/bin/env node
/**
 * Vercel Preview uses Vite `--mode staging` so Preview cannot silently inherit
 * production API routing. Production and local `npm run build` stay production mode.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function resolveViteBuildMode(env = process.env) {
  return String(env.VERCEL_ENV || "").trim().toLowerCase() === "preview"
    ? "staging"
    : "production";
}

const invokedDirectly =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const mode = resolveViteBuildMode();
  const viteBin = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "node_modules", ".bin", "vite");
  const result = spawnSync(viteBin, ["build", "--mode", mode], {
    stdio: "inherit",
    env: process.env
  });
  process.exit(result.status ?? 1);
}
