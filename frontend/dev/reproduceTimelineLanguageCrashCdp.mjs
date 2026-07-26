/**
 * TEMP W-002 — reproduce via Chrome CDP (no Playwright dependency).
 * Reads credentials from .env / ATLAS_DIAG_* (same as reproduceTimelineLanguageCrash.mjs).
 */
import dotenv from "dotenv";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const FRONTEND_URL = process.env.ATLAS_FRONTEND_URL || "https://localhost:5174";
const BACKEND_URL = process.env.ATLAS_BACKEND_URL || "http://localhost:3000";
const PROSPECT_PHONE = process.env.ATLAS_DIAG_PHONE || "+17867528080";
const EMAIL = process.env.ATLAS_DIAG_EMAIL || "niovel@teamvision.ai";
const PASSWORD =
  process.env.ATLAS_DIAG_PASSWORD ||
  process.env.ATLAS_DEV_DEFAULT_PASSWORD ||
  "Atlas@2026!";
const DEBUG_PORT = Number(process.env.ATLAS_CDP_PORT || 9334);

const logSequence = [];

function pushLog(source, text) {
  logSequence.push({ source, text, at: new Date().toISOString() });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function chromePath() {
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "google-chrome",
    "chromium"
  ];
  return candidates[0];
}

async function waitForCdp(port, attempts = 40) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) {
        return await response.json();
      }
    } catch {
      // retry
    }
    await sleep(250);
  }
  throw new Error(`CDP not ready on port ${port}`);
}

class CdpSession {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];

    ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) {
          reject(new Error(message.error.message));
        } else {
          resolve(message.result);
        }
        return;
      }
      if (message.method) {
        this.events.push(message);
      }
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  drainConsoleEvents() {
    for (const event of this.events.splice(0)) {
      if (event.method === "Runtime.consoleAPICalled") {
        const parts = (event.params?.args || []).map((arg) => {
          if (arg.value !== undefined) {
            return typeof arg.value === "object"
              ? JSON.stringify(arg.value)
              : String(arg.value);
          }
          return arg.description || arg.type || "";
        });
        pushLog(`console:${event.params?.type || "log"}`, parts.join(" "));
      }
      if (event.method === "Runtime.exceptionThrown") {
        const details = event.params?.exceptionDetails;
        const text =
          details?.exception?.description ||
          details?.text ||
          "Runtime exception";
        pushLog("exception", text);
      }
    }
  }
}

async function main() {
  const token = await login();
  const workspaceUrl = `${FRONTEND_URL}/app/prospect-workspace/${encodeURIComponent(PROSPECT_PHONE)}`;

  const chrome = spawn(
    chromePath(),
    [
      `--remote-debugging-port=${DEBUG_PORT}`,
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--ignore-certificate-errors",
      "about:blank"
    ],
    { stdio: "ignore" }
  );

  let session;
  try {
    await waitForCdp(DEBUG_PORT);

    const bootstrapUrl = "about:blank";
    const createResponse = await fetch(
      `http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent(bootstrapUrl)}`,
      { method: "PUT" }
    );
    const target = await createResponse.json();
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve);
      ws.addEventListener("error", reject);
    });

    session = new CdpSession(ws);
    await session.send("Network.enable");
    await session.send("Network.setCacheDisabled", { cacheDisabled: true });
    await session.send("Runtime.enable");
    await session.send("Page.enable");
    await session.send("Log.enable");

    await session.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `(() => {
        window.__atlasCapturedLogs = [];
        ["log", "info", "warn", "error"].forEach((level) => {
          const original = console[level];
          console[level] = (...args) => {
            try {
              window.__atlasCapturedLogs.push(
                args
                  .map((arg) =>
                    typeof arg === "object" ? JSON.stringify(arg) : String(arg)
                  )
                  .join(" ")
              );
            } catch {
              // ignore serialization failures
            }
            original.apply(console, args);
          };
        });
        localStorage.setItem("atlas_session_token", ${JSON.stringify(token)});
      })();`
    });

    await session.send("Page.navigate", { url: workspaceUrl });
    await sleep(8000);
    session.drainConsoleEvents();

    const captured = await session.send("Runtime.evaluate", {
      expression: "window.__atlasCapturedLogs || []",
      returnByValue: true
    });

    for (const line of captured.result?.value || []) {
      pushLog("page-capture", line);
    }
  } finally {
    if (session) {
      session.drainConsoleEvents();
    }
    chrome.kill("SIGKILL");
  }

  const runtimeLogs = logSequence
    .map((entry) => entry.text)
    .filter((text) =>
      /Atlas i18n runtime|Atlas workspace runtime|must be used within LanguageProvider/i.test(
        text
      )
    );

  console.log("=== FILTERED RUNTIME LOG SEQUENCE ===");
  runtimeLogs.forEach((line, index) => {
    console.log(`${index + 1}. ${line}`);
  });

  console.log("\n=== ALL CAPTURED CONSOLE LINES ===");
  logSequence.forEach((entry, index) => {
    console.log(`${index + 1}. [${entry.source}] ${entry.text}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
