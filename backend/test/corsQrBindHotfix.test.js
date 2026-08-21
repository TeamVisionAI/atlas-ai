/**
 * CORS allowlist + blocked-origin hardening (QR public bind hotfix).
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const express = require("express");
const cors = require("cors");

const {
  normalizeOrigin,
  buildAllowedOrigins,
  buildCorsOptions,
  createDisallowedOriginRejector
} = require("../config/corsOptions");

const {
  createMemoryQrChannelRepository
} = require("../core/qrChannel/memoryQrChannelRepository");
const {
  createQrCampaignService
} = require("../core/qrChannel/qrCampaignService");
const {
  CAR_MAGNET_V1,
  NATURAL_WHATSAPP_PREFILL
} = require("../core/qrChannel/constants");
const qrGoRouter = require("../routes/qrGo");

test("normalizeOrigin strips path/trailing slash; keeps scheme/host/port", () => {
  assert.equal(
    normalizeOrigin("https://atlas-ai-production-01de.up.railway.app/go/abc"),
    "https://atlas-ai-production-01de.up.railway.app"
  );
  assert.equal(
    normalizeOrigin("https://atlas-ai-production-01de.up.railway.app/"),
    "https://atlas-ai-production-01de.up.railway.app"
  );
  assert.equal(
    normalizeOrigin("http://localhost:5173/app"),
    "http://localhost:5173"
  );
  assert.equal(normalizeOrigin(""), null);
  assert.equal(normalizeOrigin("not a url"), null);
});

test("1. Origin from ATLAS_PUBLIC_URL is allowlisted", () => {
  const origins = buildAllowedOrigins({
    ATLAS_PUBLIC_URL: "https://atlas-ai-production-01de.up.railway.app/go/x"
  });
  assert.ok(
    origins.includes("https://atlas-ai-production-01de.up.railway.app")
  );
});

test("2–3. teamvisionfinancial.com and localhost remain allowed", () => {
  const origins = buildAllowedOrigins({ ATLAS_PUBLIC_URL: "" });
  assert.ok(origins.includes("https://teamvisionfinancial.com"));
  assert.ok(origins.includes("https://www.teamvisionfinancial.com"));
  assert.ok(origins.includes("http://localhost:5173"));
});

test("Atlas public and app hosts are allowlisted by default", () => {
  const origins = buildAllowedOrigins({ ATLAS_PUBLIC_URL: "" });
  assert.ok(origins.includes("https://useatlas-ai.com"));
  assert.ok(origins.includes("https://www.useatlas-ai.com"));
  assert.ok(origins.includes("https://app.useatlas-ai.com"));
});

test("ATLAS_CORS_ORIGINS still merges", () => {
  const origins = buildAllowedOrigins({
    ATLAS_PUBLIC_URL: "https://atlas.example",
    ATLAS_CORS_ORIGINS: "https://extra.example.com, https://other.example/"
  });
  assert.ok(origins.includes("https://atlas.example"));
  assert.ok(origins.includes("https://extra.example.com"));
  assert.ok(origins.includes("https://other.example"));
});

function invokeOriginCallback(options, origin) {
  return new Promise((resolve, reject) => {
    options.origin(origin, (err, allow) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(allow);
    });
  });
}

test("4. malicious origin denied via callback(null, false) — no throw", async () => {
  const options = buildCorsOptions({
    NODE_ENV: "production",
    ATLAS_PUBLIC_URL: "https://atlas-ai-production-01de.up.railway.app"
  });
  const allow = await invokeOriginCallback(
    options,
    "https://evil.example.com"
  );
  assert.equal(allow, false);
});

test("5. missing Origin remains allowed", async () => {
  const options = buildCorsOptions({
    NODE_ENV: "production",
    ATLAS_PUBLIC_URL: "https://atlas-ai-production-01de.up.railway.app"
  });
  assert.equal(await invokeOriginCallback(options, undefined), true);
  assert.equal(await invokeOriginCallback(options, null), true);
  assert.equal(await invokeOriginCallback(options, ""), true);
});

test("production ATLAS_PUBLIC_URL origin is allowed by callback", async () => {
  const publicOrigin = "https://atlas-ai-production-01de.up.railway.app";
  const options = buildCorsOptions({
    NODE_ENV: "production",
    ATLAS_PUBLIC_URL: `${publicOrigin}/`
  });
  assert.equal(await invokeOriginCallback(options, publicOrigin), true);
  assert.equal(
    await invokeOriginCallback(options, "https://www.teamvisionfinancial.com"),
    true
  );
});

async function seedCarMagnet(repo) {
  const service = createQrCampaignService({
    repository: repo,
    env: {
      QR_CHANNEL_BIND_SECRET: "cors-hotfix-secret",
      QR_CHANNEL_WHATSAPP_E164: "17867528080"
    }
  });
  const seeded = await service.seedCampaign({
    orgId: CAR_MAGNET_V1.orgId,
    ownerUserId: CAR_MAGNET_V1.ownerUserId,
    campaignKey: `cors_hotfix_${Date.now()}`,
    name: "Car Recruiting Test",
    source: CAR_MAGNET_V1.source,
    campaignType: CAR_MAGNET_V1.campaignType,
    defaultConversationGoal: "interview",
    whatsappE164: "17867528080"
  });
  assert.equal(seeded.ok, true);
  return { service, seeded };
}

test("6. POST /go bind with Origin=ATLAS_PUBLIC_URL reaches route → 302 wa.me", async () => {
  const publicOrigin = "https://atlas-ai-production-01de.up.railway.app";
  const repo = createMemoryQrChannelRepository();
  const { service, seeded } = await seedCarMagnet(repo);
  qrGoRouter.setTestService(service);

  const env = {
    NODE_ENV: "production",
    ATLAS_PUBLIC_URL: publicOrigin
  };
  const app = express();
  let sawGlobal500 = false;
  app.use(cors(buildCorsOptions(env)));
  app.use(createDisallowedOriginRejector(env));
  app.use("/go", qrGoRouter);
  app.use((err, req, res, next) => {
    sawGlobal500 = true;
    res.status(500).json({ error: "Internal server error" });
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  try {
    const getRes = await fetch(`http://127.0.0.1:${port}/go/${seeded.publicToken}`, {
      headers: { Origin: publicOrigin }
    });
    assert.equal(getRes.status, 200);
    const html = await getRes.text();
    const scanId = html.match(/name="scanId" value="([^"]+)"/)[1];
    const bindMac = html.match(/name="bindMac" value="([^"]+)"/)[1];

    const postRes = await fetch(
      `http://127.0.0.1:${port}/go/${seeded.publicToken}/bind`,
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          Origin: publicOrigin
        },
        body: new URLSearchParams({
          scanId,
          bindMac,
          phone: "3055550199"
        }),
        redirect: "manual"
      }
    );
    assert.equal(sawGlobal500, false);
    assert.equal(postRes.status, 302);
    const location = postRes.headers.get("location");
    assert.match(location, /^https:\/\/wa\.me\/17867528080\?text=/);
    assert.equal(
      decodeURIComponent(location.split("text=")[1]),
      NATURAL_WHATSAPP_PREFILL
    );
    assert.doesNotMatch(
      postRes.headers.get("content-type") || "",
      /application\/json/
    );
  } finally {
    qrGoRouter.setTestService(null);
    await new Promise((resolve) => server.close(resolve));
  }
});

test("7. POST /go bind with disallowed Origin → 403, no 500, no bind side effects", async () => {
  const publicOrigin = "https://atlas-ai-production-01de.up.railway.app";
  const repo = createMemoryQrChannelRepository();
  const { service, seeded } = await seedCarMagnet(repo);
  qrGoRouter.setTestService(service);

  const env = {
    NODE_ENV: "production",
    ATLAS_PUBLIC_URL: publicOrigin
  };
  const app = express();
  let sawGlobal500 = false;
  app.use(cors(buildCorsOptions(env)));
  app.use(createDisallowedOriginRejector(env));
  app.use("/go", qrGoRouter);
  app.use((err, req, res, next) => {
    sawGlobal500 = true;
    res.status(500).json({ error: "Internal server error" });
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  try {
    const getRes = await fetch(`http://127.0.0.1:${port}/go/${seeded.publicToken}`);
    assert.equal(getRes.status, 200);
    const html = await getRes.text();
    const scanId = html.match(/name="scanId" value="([^"]+)"/)[1];
    const bindMac = html.match(/name="bindMac" value="([^"]+)"/)[1];
    const scansBefore = await repo.listScansByCampaign?.(seeded.campaign.id);
    const beforeCount = Array.isArray(scansBefore)
      ? scansBefore.length
      : (await repo.findScanById(scanId))
        ? 1
        : 0;

    const postRes = await fetch(
      `http://127.0.0.1:${port}/go/${seeded.publicToken}/bind`,
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          Origin: "https://evil.example.com"
        },
        body: new URLSearchParams({
          scanId,
          bindMac,
          phone: "3055550198"
        }),
        redirect: "manual"
      }
    );

    assert.equal(sawGlobal500, false);
    assert.equal(postRes.status, 403);
    const bodyText = await postRes.text();
    assert.doesNotMatch(bodyText, /Internal server error/);
    assert.notEqual(
      postRes.headers.get("access-control-allow-origin"),
      "https://evil.example.com"
    );

    const scanAfter = await repo.findScanById(scanId);
    assert.equal(scanAfter.status, "pending_phone");
    assert.equal(scanAfter.bound_phone_normalized, null);
    void beforeCount;
  } finally {
    qrGoRouter.setTestService(null);
    await new Promise((resolve) => server.close(resolve));
  }
});

test("execution gates remain OFF", () => {
  assert.notEqual(process.env.RECRUIT_AI_V2_EXECUTION_ENABLED, "true");
  assert.notEqual(process.env.RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED, "true");
});
