/**
 * TEMP W-002 — obtain session token for browser reproduction (dev defaults).
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const BACKEND_URL = process.env.ATLAS_BACKEND_URL || "http://localhost:3000";
const EMAIL = process.env.ATLAS_DIAG_EMAIL || "niovel@teamvision.ai";
const PASSWORD =
  process.env.ATLAS_DIAG_PASSWORD ||
  process.env.ATLAS_DEV_DEFAULT_PASSWORD ||
  "Atlas@2026!";

const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD })
});

const body = await response.json().catch(() => ({}));

if (!response.ok) {
  console.error(JSON.stringify({ ok: false, status: response.status, body }));
  process.exit(1);
}

const token = body.token || body.sessionToken || body.accessToken;
process.stdout.write(String(token || ""));
