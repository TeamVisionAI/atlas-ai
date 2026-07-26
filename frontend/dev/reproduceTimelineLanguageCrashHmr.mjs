/**
 * TEMP W-002 — HMR reproduction: load workspace, invalidate LanguageContext, reload route.
 */
import dotenv from "dotenv";
import { spawn, execSync } from "child_process";
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
const DEBUG_PORT = Number(process.env.ATLAS_CDP_PORT || 9341);
const LANGUAGE_CONTEXT_PATH = path.resolve(__dirname, "../src/i18n/LanguageContext.jsx");

const logSequence = [];

function pushLog(phase, source, text) {
  logSequence.push({ phase, source, text, at: new Date().toISOString() });
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
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
        return;
      }
      if (message.method) this.events.push(message);
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  drainEvents(phase) {
    for (const event of this.events.splice(0)) {
      if (event.method === "Runtime.consoleAPICalled") {
        const parts = (event.params?.args || []).map((arg) =>
          arg.value !== undefined
            ? typeof arg.value === "object"
              ? JSON.stringify(arg.value)
              : String(arg.value)
            : arg.description || ""
        );
        pushLog(phase, `console:${event.params?.type}`, parts.join(" "));
      }
      if (event.method === "Runtime.exceptionThrown") {
        const details = event.params?.exceptionDetails;
        pushLog(
          phase,
          "exception",
          details?.exception?.description || details?.text || "exception"
        );
      }
    }
  }

  async readCapturedLogs(phase) {
    const captured = await this.send("Runtime.evaluate", {
      expression: "window.__atlasCapturedLogs || []",
      returnByValue: true
    });
    for (const line of captured.result?.value || []) {
      pushLog(phase, "page-capture", line);
    }
  }
}

async function setupSession(token) {
  const chrome = spawn(
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    [
      `--remote-debugging-port=${DEBUG_PORT}`,
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--ignore-certificate-errors",
      "about:blank"
    ],
    { stdio: "ignore" }
  );

  for (let i = 0; i < 40; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
      if (response.ok) break;
    } catch {
      // retry
    }
    await sleep(250);
  }

  const createResponse = await fetch(
    `http://127.0.0.1:${DEBUG_PORT}/json/new?about:blank`,
    { method: "PUT" }
  );
  const target = await createResponse.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve);
    ws.addEventListener("error", reject);
  });

  const session = new CdpSession(ws);
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
              args.map((arg) => (typeof arg === "object" ? JSON.stringify(arg) : String(arg))).join(" ")
            );
          } catch {}
          original.apply(console, args);
        };
      });
      localStorage.setItem("atlas_session_token", ${JSON.stringify(token)});
    })();`
  });

  return { chrome, session };
}

async function loadWorkspace(session, phase) {
  const workspaceUrl = `${FRONTEND_URL}/app/prospect-workspace/${encodeURIComponent(PROSPECT_PHONE)}`;
  pushLog(phase, "runner", `navigate ${workspaceUrl}`);
  await session.send("Page.navigate", { url: workspaceUrl });
  await sleep(8000);
  session.drainEvents(phase);
  await session.readCapturedLogs(phase);
}

function printResults() {
  const runtimeLogs = logSequence.filter((entry) =>
    /Atlas i18n runtime|Atlas workspace runtime|must be used within LanguageProvider/i.test(
      entry.text
    )
  );

  console.log("=== FILTERED RUNTIME LOG SEQUENCE (ordered) ===");
  runtimeLogs.forEach((entry, index) => {
    console.log(`${index + 1}. [${entry.phase}] ${entry.text}`);
  });

  console.log("\n=== ALL CAPTURED LINES ===");
  logSequence.forEach((entry, index) => {
    console.log(`${index + 1}. [${entry.phase}/${entry.source}] ${entry.text}`);
  });
}

async function main() {
  const token = await login();
  const { chrome, session } = await setupSession(token);

  try {
    await loadWorkspace(session, "cold-load");

    execSync(`touch "${LANGUAGE_CONTEXT_PATH}"`);
    pushLog("hmr", "runner", "touched LanguageContext.jsx");
    await sleep(3000);
    session.drainEvents("hmr");

    await session.send("Runtime.evaluate", {
      expression: "window.__atlasCapturedLogs = []",
      returnByValue: true
    });

    await loadWorkspace(session, "post-hmr-reload");
  } finally {
    chrome.kill("SIGKILL");
  }

  printResults();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
