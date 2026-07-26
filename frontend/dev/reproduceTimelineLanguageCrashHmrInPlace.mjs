/**
 * TEMP W-002 — in-session HMR reproduction (no full page reload after HMR).
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
const DEBUG_PORT = Number(process.env.ATLAS_CDP_PORT || 9342);
const LANGUAGE_CONTEXT_PATH = path.resolve(__dirname, "../src/i18n/LanguageContext.jsx");
const TIMELINE_PANEL_PATH = path.resolve(
  __dirname,
  "../src/features/prospect-workspace/components/ProspectTimelinePanel.jsx"
);

const logSequence = [];

function pushLog(phase, source, text) {
  logSequence.push({ phase, source, text });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function login() {
  const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.ATLAS_DIAG_EMAIL || "niovel@teamvision.ai",
      password:
        process.env.ATLAS_DIAG_PASSWORD ||
        process.env.ATLAS_DEV_DEFAULT_PASSWORD ||
        "Atlas@2026!"
    })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || `Login failed (${response.status})`);
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
        message.error ? reject(new Error(message.error.message)) : resolve(message.result);
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

  drain(phase) {
    for (const event of this.events.splice(0)) {
      if (event.method === "Runtime.consoleAPICalled") {
        const parts = (event.params?.args || []).map((arg) =>
          arg.value !== undefined
            ? typeof arg.value === "object"
              ? JSON.stringify(arg.value)
              : String(arg.value)
            : arg.description || ""
        );
        pushLog(phase, "console", parts.join(" "));
      }
      if (event.method === "Runtime.exceptionThrown") {
        const details = event.params?.exceptionDetails;
        pushLog(phase, "exception", details?.exception?.description || details?.text || "exception");
      }
    }
  }

  async readCapture(phase) {
    const captured = await this.send("Runtime.evaluate", {
      expression: "(window.__atlasCapturedLogs || []).slice()",
      returnByValue: true
    });
    for (const line of captured.result?.value || []) {
      pushLog(phase, "capture", line);
    }
  }
}

async function main() {
  const token = await login();
  const workspaceUrl = `${FRONTEND_URL}/app/prospect-workspace/${encodeURIComponent(PROSPECT_PHONE)}`;

  const chrome = spawn(
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    [`--remote-debugging-port=${DEBUG_PORT}`, "--headless=new", "--disable-gpu", "--ignore-certificate-errors", "about:blank"],
    { stdio: "ignore" }
  );

  await sleep(2000);
  const createResponse = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?about:blank`, { method: "PUT" });
  const target = await createResponse.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve);
    ws.addEventListener("error", reject);
  });

  const session = new CdpSession(ws);
  await session.send("Runtime.enable");
  await session.send("Page.enable");
  await session.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
      window.__atlasCapturedLogs = [];
      ["log","info","warn","error"].forEach((level) => {
        const orig = console[level];
        console[level] = (...args) => {
          try {
            window.__atlasCapturedLogs.push(args.map(a => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" "));
          } catch {}
          orig.apply(console, args);
        };
      });
      localStorage.setItem("atlas_session_token", ${JSON.stringify(token)});
    })();`
  });

  try {
    await session.send("Page.navigate", { url: workspaceUrl });
    await sleep(8000);
    session.drain("initial");
    await session.readCapture("initial");

    await session.send("Runtime.evaluate", {
      expression: "window.__atlasCapturedLogs = []",
      returnByValue: true
    });

    execSync(`touch "${LANGUAGE_CONTEXT_PATH}"`);
    await sleep(2500);
    execSync(`touch "${TIMELINE_PANEL_PATH}"`);
    await sleep(2500);

    session.drain("hmr-in-place");
    await session.readCapture("hmr-in-place");

    await session.send("Runtime.evaluate", {
      expression: "window.__atlasCapturedLogs = []",
      returnByValue: true
    });

    await session.send("Runtime.evaluate", {
      expression: `(() => {
        const back = document.querySelector('a.prospect-workspace__back, a[href*="prospect-center"], a[href="/app"]');
        if (back) back.click();
      })()`,
      returnByValue: true
    });
    await sleep(3000);
    session.drain("nav-away");
    await session.readCapture("nav-away");

    await session.send("Runtime.evaluate", {
      expression: "window.__atlasCapturedLogs = []",
      returnByValue: true
    });

    await session.send("Runtime.evaluate", {
      expression: `history.back()`,
      returnByValue: true
    });
    await sleep(5000);
    session.drain("nav-back");
    await session.readCapture("nav-back");
  } finally {
    chrome.kill("SIGKILL");
  }

  const runtime = logSequence.filter((e) =>
    /Atlas i18n runtime|Atlas workspace runtime|must be used within LanguageProvider/i.test(e.text)
  );

  console.log("=== FILTERED RUNTIME LOG SEQUENCE ===");
  runtime.forEach((e, i) => console.log(`${i + 1}. [${e.phase}/${e.source}] ${e.text}`));

  console.log("\n=== ALL ===");
  logSequence.forEach((e, i) => console.log(`${i + 1}. [${e.phase}/${e.source}] ${e.text}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
