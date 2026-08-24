/**
 * BR-147 — Campaign Intake Code create contract (UI → API → manager).
 * Regression: POST without Content-Type leaves req.body empty → "campaignName is required".
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");

const TEAM_VISION_ORG = "00000000-0000-4000-8000-000000000001";
const TV_PHONE_ID = "1213865645144311";

const {
  createMemoryCampaignIntakeCodeRepository
} = require("../core/campaignIntakeCode/campaignIntakeCodeRepository");
const {
  createCampaignIntakeCodeManagerService
} = require("../core/campaignIntakeCode/campaignIntakeCodeManagerService");
const { ROLES } = require("../security/roles");
const { permissionsForRole } = require("../security/permissions");
const whatsappRepo = require("../repositories/metaWhatsAppConnectionRepository");

const originalGetWhatsAppConnection = whatsappRepo.getWhatsAppConnection;

function adminAuthContext(overrides = {}) {
  return {
    organizationId: overrides.organizationId || TEAM_VISION_ORG,
    user: { id: overrides.userId || "admin-1", role: ROLES.ADMINISTRATOR },
    permissions: permissionsForRole(ROLES.ADMINISTRATOR)
  };
}

function buildManager() {
  const repository = createMemoryCampaignIntakeCodeRepository();
  return createCampaignIntakeCodeManagerService({ repository });
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

async function postJson(port, path, body, { contentType = "application/json" } = {}) {
  const headers = {};
  if (contentType) {
    headers["Content-Type"] = contentType;
  }
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  return { status: response.status, payload };
}

test.beforeEach(() => {
  whatsappRepo.getWhatsAppConnection = async () => ({
    status: "connected",
    phone_number_id: TV_PHONE_ID,
    display_phone_number: "+13055550100"
  });
});

test.afterEach(() => {
  whatsappRepo.getWhatsAppConnection = originalGetWhatsAppConnection;
});

test("express.json leaves req.body empty without Content-Type (UI regression)", async () => {
  const app = express();
  app.use(express.json());
  app.post("/probe", (req, res) => {
    res.json({
      campaignName: req.body?.campaignName ?? null,
      parsed: Boolean(req.body && Object.keys(req.body).length)
    });
  });

  await withServer(app, async (port) => {
    const missing = await postJson(
      port,
      "/probe",
      { campaignName: "TV-IUL-REVIEW-MIAMI-SP-0826" },
      { contentType: null }
    );
    assert.equal(missing.payload.parsed, false);
    assert.equal(missing.payload.campaignName, null);

    const present = await postJson(port, "/probe", {
      campaignName: "TV-IUL-REVIEW-MIAMI-SP-0826"
    });
    assert.equal(present.payload.parsed, true);
    assert.equal(present.payload.campaignName, "TV-IUL-REVIEW-MIAMI-SP-0826");
  });
});

test("createCode accepts RECRUITING campaignName from parsed JSON body", async () => {
  const manager = buildManager();
  const result = await manager.createCode(adminAuthContext(), {
    campaignName: "TV-RECRUIT-MIAMI-SP-0826",
    purpose: "RECRUITING",
    language: "es"
  });
  assert.equal(result.ok, true);
  assert.equal(result.code.campaignName, "TV-RECRUIT-MIAMI-SP-0826");
  assert.equal(result.code.purpose, "RECRUITING");
});

test("createCode accepts IUL campaignName from parsed JSON body", async () => {
  const manager = buildManager();
  const result = await manager.createCode(adminAuthContext(), {
    campaignName: "TV-IUL-REVIEW-MIAMI-SP-0826",
    purpose: "IUL",
    language: "es"
  });
  assert.equal(result.ok, true);
  assert.equal(result.code.campaignName, "TV-IUL-REVIEW-MIAMI-SP-0826");
  assert.equal(result.code.purpose, "IUL");
});

test("create route returns campaignName is required when JSON body is not parsed", async () => {
  const manager = buildManager();
  const app = express();
  app.use(express.json());
  app.post("/api/campaign-intake-codes", async (req, res) => {
    const result = await manager.createCode(adminAuthContext(), req.body || {});
    if (!result.ok) {
      return res.status(400).json({
        error: result.reason,
        message: result.message
      });
    }
    return res.status(201).json({ code: result.code });
  });

  await withServer(app, async (port) => {
    const response = await postJson(
      port,
      "/api/campaign-intake-codes",
      {
        campaignName: "TV-IUL-REVIEW-MIAMI-SP-0826",
        purpose: "IUL",
        language: "es"
      },
      { contentType: null }
    );
    assert.equal(response.status, 400);
    assert.equal(response.payload.message, "campaignName is required");
  });
});
