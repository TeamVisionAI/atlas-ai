/**
 * BR-230 hotfix — TikFinity browser POSTs must not be 403'd by the
 * production origin rejector before the webhook secret check.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const express = require("express");

const TEAM_VISION_ORG = "00000000-0000-4000-8000-000000000001";
const SECRET = "test-tikfinity-secret";
const TIKFINITY_ORIGIN = "https://tikfinity.zerody.one";
const TIKFINITY_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

const {
  TIKFINITY_LIVE_EVENT_PATH,
  createAtlasCors,
  createDisallowedOriginRejector,
  isTikfinityLiveEventPath
} = require("../config/corsOptions");
const { createMemoryTiktokLiveEngagementStore } = require("../core/tikfinity/tikfinityLiveEventService");
const createTikfinityLiveEventRouter = require("../routes/tikfinityLiveEvent");
const { safeRequestLogger } = require("../middleware/safeRequestLogger");
const { tenantOperationalGuard } = require("../middleware/tenantOperationalGuard");

function tikfinityBrowserHeaders(extra = {}) {
  return {
    Origin: TIKFINITY_ORIGIN,
    Referer: `${TIKFINITY_ORIGIN}/`,
    "User-Agent": TIKFINITY_UA,
    ...extra
  };
}

function buildHarness() {
  const engagementStore = createMemoryTiktokLiveEngagementStore();
  return {
    engagementStore,
    dependencies: {
      env: { TIKFINITY_WEBHOOK_SECRET: SECRET },
      findOrganization: async (organizationId) =>
        organizationId === TEAM_VISION_ORG ? { id: organizationId } : null,
      engagementStore
    }
  };
}

function buildProductionShapedApp({ dependencies, env, logs }) {
  const app = express();
  app.use(createAtlasCors(env));
  app.use(createDisallowedOriginRejector(env));
  if (logs) {
    app.use((req, res, next) => {
      const original = console.log;
      console.log = (...args) => {
        logs.push(args.map(String).join(" "));
        original.apply(console, args);
      };
      res.on("finish", () => {
        console.log = original;
      });
      next();
    });
  }
  app.use(safeRequestLogger);
  app.use(express.json());
  app.use(tenantOperationalGuard);
  app.use("/api/integrations/tikfinity", createTikfinityLiveEventRouter(dependencies));
  app.post("/api/auth/login", (_req, res) => {
    res.status(200).json({ ok: true, reachedProtectedLogin: true });
  });
  app.post("/api/integrations/tikfinity/other", (_req, res) => {
    res.status(200).json({ ok: true, reachedPrefixSibling: true });
  });
  return app;
}

async function withServer(app, run) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  try {
    await run(port);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function liveEventUrl(port, { secret = SECRET, extra = {} } = {}) {
  const url = new URL(`http://127.0.0.1:${port}${TIKFINITY_LIVE_EVENT_PATH}`);
  if (secret != null) {
    url.searchParams.set("secret", secret);
  }
  url.searchParams.set("organizationId", TEAM_VISION_ORG);
  url.searchParams.set("campaign", "TVA_LIVE_IUL");
  url.searchParams.set("funnel", "IUL_REVIEW");
  url.searchParams.set("command", "IUL");
  url.searchParams.set("value1", extra.value1 || "test_tiktok_user");
  url.searchParams.set("value2", extra.value2 ?? "");
  url.searchParams.set("value3", extra.value3 ?? "");
  return url;
}

async function postLiveEvent(port, { secret = SECRET, extra = {} } = {}) {
  const response = await fetch(liveEventUrl(port, { secret, extra }), {
    method: "POST",
    headers: tikfinityBrowserHeaders({
      "Content-Type": "application/x-www-form-urlencoded"
    }),
    body: ""
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = text;
  }
  return { status: response.status, payload, headers: response.headers };
}

test("root cause: production origin rejector 403s non-allowlisted browser Origin", async () => {
  assert.equal(
    isTikfinityLiveEventPath({ path: TIKFINITY_LIVE_EVENT_PATH }),
    true
  );
  assert.equal(
    isTikfinityLiveEventPath({ path: "/api/integrations/tikfinity/other" }),
    false
  );
  assert.equal(isTikfinityLiveEventPath({ path: "/api/integrations" }), false);

  const env = { NODE_ENV: "production", ATLAS_PUBLIC_URL: "https://api.useatlas-ai.com" };
  const { dependencies } = buildHarness();
  const app = buildProductionShapedApp({ dependencies, env });

  await withServer(app, async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: "POST",
      headers: tikfinityBrowserHeaders({ "Content-Type": "application/json" }),
      body: "{}"
    });
    assert.equal(response.status, 403);
    assert.equal(await response.text(), "Forbidden");
  });
});

test("A) browser-like POST with valid secret => 200, reaches route", async () => {
  const env = { NODE_ENV: "production", ATLAS_PUBLIC_URL: "https://api.useatlas-ai.com" };
  const { engagementStore, dependencies } = buildHarness();
  const app = buildProductionShapedApp({ dependencies, env });

  await withServer(app, async (port) => {
    const result = await postLiveEvent(port);
    assert.equal(result.status, 200);
    assert.deepEqual(result.payload, { ok: true, recorded: true });
    assert.equal(engagementStore.rows.length, 1);
    assert.equal(result.headers.get("access-control-allow-origin"), TIKFINITY_ORIGIN);
  });
});

test("B) browser-like POST wrong secret => 401, not 403", async () => {
  const env = { NODE_ENV: "production", ATLAS_PUBLIC_URL: "https://api.useatlas-ai.com" };
  const { engagementStore, dependencies } = buildHarness();
  const app = buildProductionShapedApp({ dependencies, env });

  await withServer(app, async (port) => {
    const result = await postLiveEvent(port, { secret: "wrong-secret" });
    assert.equal(result.status, 401);
    assert.deepEqual(result.payload, { ok: false, error: "UNAUTHORIZED" });
    assert.equal(engagementStore.rows.length, 0);
  });
});

test("C) missing secret => 401", async () => {
  const env = { NODE_ENV: "production", ATLAS_PUBLIC_URL: "https://api.useatlas-ai.com" };
  const { dependencies } = buildHarness();
  const app = buildProductionShapedApp({ dependencies, env });

  await withServer(app, async (port) => {
    const result = await postLiveEvent(port, { secret: null });
    assert.equal(result.status, 401);
    assert.equal(result.payload.error, "UNAUTHORIZED");
  });
});

test("D) GET still works through the same stack", async () => {
  const env = { NODE_ENV: "production", ATLAS_PUBLIC_URL: "https://api.useatlas-ai.com" };
  const { dependencies } = buildHarness();
  const app = buildProductionShapedApp({ dependencies, env });

  await withServer(app, async (port) => {
    const response = await fetch(liveEventUrl(port), {
      method: "GET",
      headers: tikfinityBrowserHeaders()
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.recorded, true);
  });
});

test("E) unrelated protected POST still 403 for TikFinity Origin", async () => {
  const env = { NODE_ENV: "production", ATLAS_PUBLIC_URL: "https://api.useatlas-ai.com" };
  const { dependencies } = buildHarness();
  const app = buildProductionShapedApp({ dependencies, env });

  await withServer(app, async (port) => {
    const login = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: "POST",
      headers: tikfinityBrowserHeaders({ "Content-Type": "application/json" }),
      body: "{}"
    });
    assert.equal(login.status, 403);

    const sibling = await fetch(
      `http://127.0.0.1:${port}/api/integrations/tikfinity/other`,
      {
        method: "POST",
        headers: tikfinityBrowserHeaders({ "Content-Type": "application/json" }),
        body: "{}"
      }
    );
    assert.equal(sibling.status, 403);
  });
});

test("F) no session/cookie required", async () => {
  const env = { NODE_ENV: "production", ATLAS_PUBLIC_URL: "https://api.useatlas-ai.com" };
  const { dependencies } = buildHarness();
  const app = buildProductionShapedApp({ dependencies, env });

  await withServer(app, async (port) => {
    const result = await postLiveEvent(port);
    assert.equal(result.status, 200);
    assert.equal(result.headers.get("set-cookie"), null);
  });
});

test("G) secret still redacted from logs", async () => {
  const env = { NODE_ENV: "production", ATLAS_PUBLIC_URL: "https://api.useatlas-ai.com" };
  const { dependencies } = buildHarness();
  const logs = [];
  const app = buildProductionShapedApp({ dependencies, env, logs });

  await withServer(app, async (port) => {
    await postLiveEvent(port);
  });
  const joined = logs.join("\n");
  assert.doesNotMatch(joined, new RegExp(SECRET));
  assert.match(joined, /secret=\[redacted\]/);
});

test("H/I) valid event inserts one engagement row and no prospect side effects", async () => {
  const env = { NODE_ENV: "production", ATLAS_PUBLIC_URL: "https://api.useatlas-ai.com" };
  const { engagementStore, dependencies } = buildHarness();
  const app = buildProductionShapedApp({ dependencies, env });

  await withServer(app, async (port) => {
    const result = await postLiveEvent(port, {
      extra: { value1: "test_tiktok_user", value2: "", value3: "" }
    });
    assert.equal(result.status, 200);
    assert.equal(engagementStore.rows.length, 1);
    assert.equal(engagementStore.rows[0].username, "test_tiktok_user");
    assert.equal(engagementStore.rows[0].command, "IUL");
    assert.ok(!Object.prototype.hasOwnProperty.call(engagementStore.rows[0], "prospect_id"));
  });

  const serviceSrc = fs.readFileSync(
    path.join(__dirname, "../core/tikfinity/tikfinityLiveEventService.js"),
    "utf8"
  );
  const routeSrc = fs.readFileSync(
    path.join(__dirname, "../routes/tikfinityLiveEvent.js"),
    "utf8"
  );
  for (const token of ["processRecruitAi", "sendWhatsApp", "createProspect"]) {
    assert.doesNotMatch(serviceSrc, new RegExp(token));
    assert.doesNotMatch(routeSrc, new RegExp(token));
  }
});

test("J) OPTIONS preflight allowed on exact path only", async () => {
  const env = { NODE_ENV: "production", ATLAS_PUBLIC_URL: "https://api.useatlas-ai.com" };
  const { dependencies } = buildHarness();
  const app = buildProductionShapedApp({ dependencies, env });

  await withServer(app, async (port) => {
    const allowed = await fetch(
      `http://127.0.0.1:${port}${TIKFINITY_LIVE_EVENT_PATH}`,
      {
        method: "OPTIONS",
        headers: {
          Origin: TIKFINITY_ORIGIN,
          "Access-Control-Request-Method": "POST"
        }
      }
    );
    assert.ok(allowed.status === 204 || allowed.status === 200);
    assert.equal(allowed.headers.get("access-control-allow-origin"), TIKFINITY_ORIGIN);

    const denied = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: "OPTIONS",
      headers: {
        Origin: TIKFINITY_ORIGIN,
        "Access-Control-Request-Method": "POST"
      }
    });
    assert.notEqual(denied.headers.get("access-control-allow-origin"), TIKFINITY_ORIGIN);
    assert.equal(denied.status, 403);
  });
});

test("production canary shape: valid 200 then wrong secret 401", async () => {
  const env = { NODE_ENV: "production", ATLAS_PUBLIC_URL: "https://api.useatlas-ai.com" };
  const { engagementStore, dependencies } = buildHarness();
  const app = buildProductionShapedApp({ dependencies, env });

  await withServer(app, async (port) => {
    const ok = await postLiveEvent(port, {
      extra: { value1: "test_tiktok_user", value2: "", value3: "" }
    });
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.payload, { ok: true, recorded: true });

    const bad = await postLiveEvent(port, {
      secret: "wrong-secret",
      extra: { value1: "test_tiktok_user", value2: "", value3: "" }
    });
    assert.equal(bad.status, 401);
    assert.deepEqual(bad.payload, { ok: false, error: "UNAUTHORIZED" });
    assert.equal(engagementStore.rows.length, 1);
  });
});
