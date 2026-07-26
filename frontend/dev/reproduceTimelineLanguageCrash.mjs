/**
 * TEMP W-002 runtime reproduction — captures browser console log sequence.
 * Run from repo root:
 *   ATLAS_DIAG_EMAIL=... ATLAS_DIAG_PASSWORD=... node frontend/dev/reproduceTimelineLanguageCrash.mjs
 * Or set ATLAS_DIAG_EMAIL / ATLAS_DIAG_PASSWORD in .env
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const FRONTEND_URL = process.env.ATLAS_FRONTEND_URL || "https://localhost:5174";
const BACKEND_URL = process.env.ATLAS_BACKEND_URL || "http://localhost:3000";
const PROSPECT_PHONE = process.env.ATLAS_DIAG_PHONE || "sim-ops-00ca4c78";
const DEFAULT_EMAIL = "niovel@teamvision.ai";
const DEFAULT_PASSWORD = "Atlas@2026!";
const EMAIL = process.env.ATLAS_DIAG_EMAIL || DEFAULT_EMAIL;
const PASSWORD =
  process.env.ATLAS_DIAG_PASSWORD ||
  process.env.ATLAS_DEV_DEFAULT_PASSWORD ||
  DEFAULT_PASSWORD;

const logSequence = [];

function pushLog(source, text) {
  logSequence.push({ source, text, at: new Date().toISOString() });
  console.log(`[${source}] ${text}`);
}

async function login() {
  const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD })
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body.message || `Login failed (${response.status})`);
  }

  return body.token || body.sessionToken || body.accessToken;
}

async function main() {
  const { chromium } = await import("playwright");
  const token = await login();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  page.on("console", (msg) => {
    pushLog(`console:${msg.type()}`, msg.text());
  });

  page.on("pageerror", (error) => {
    pushLog("pageerror", error.message);
  });

  await page.goto(`${FRONTEND_URL}/app/login`, { waitUntil: "domcontentloaded" });
  await page.evaluate((sessionToken) => {
    localStorage.setItem("atlas_session_token", sessionToken);
  }, token);

  const workspaceUrl = `${FRONTEND_URL}/app/prospect-workspace/${encodeURIComponent(PROSPECT_PHONE)}`;
  pushLog("runner", `Navigating to ${workspaceUrl}`);

  await page.goto(workspaceUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);

  const runtimeLogs = logSequence
    .map((entry) => entry.text)
    .filter((text) =>
      /LanguageProvider|useLanguage|Workspace mounted|TimelinePanel|must be used within LanguageProvider/i.test(
        text
      )
    );

  console.log("\n=== FILTERED RUNTIME LOG SEQUENCE ===");
  runtimeLogs.forEach((line, index) => {
    console.log(`${index + 1}. ${line}`);
  });

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
