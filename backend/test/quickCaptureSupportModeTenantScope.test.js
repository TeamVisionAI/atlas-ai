/**
 * Quick Capture tenant scoping under Super Admin Support Mode.
 * Proves effective-org precedence, foreign-org rejection, and tenant-scoped dedupe.
 * Does not write production; does not enable Meta/WhatsApp/live AI.
 */

require("dotenv").config();

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";
process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const http = require("node:http");

const { TEAM_VISION_ORGANIZATION_ID } = require("../core/teamVisionSeedTenant");
const { SAAS_ROLES } = require("../security/saasRoles");
const { ROLES } = require("../security/roles");
const { permissionsForRole } = require("../security/permissions");
const { organizationGuard } = require("../middleware/organizationGuard");
const { resolveEffectiveOrganizationId } = require("../core/effectiveOrganizationContext");
const { getTenantOrganizationId } = require("../services/tenantContextService");

const ORG_A = TEAM_VISION_ORGANIZATION_ID;
const ORG_B = "af8fb707-f26c-4152-ad77-2d079d30bc8a";
const SUPER_ID = "aaaaaaaa-bbbb-cccc-dddd-111111111111";
const ADMIN_A_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const ADMIN_B_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const SHARED_PHONE = "+15555550188";

function authContext(overrides = {}) {
  const role = overrides.role || ROLES.ADMINISTRATOR;
  const saasRole = overrides.saasRole || SAAS_ROLES.ADMIN;
  return {
    userId: overrides.userId || ADMIN_A_ID,
    email: overrides.email || "admin@example.test",
    role,
    saasRole,
    organizationId: overrides.organizationId || ORG_A,
    permissions: overrides.permissions || permissionsForRole(role),
    status: "active"
  };
}

function atlasUserFromContext(context) {
  return {
    id: context.userId,
    email: context.email,
    role: context.role,
    organization_id: context.organizationId,
    organizationId: context.organizationId
  };
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

function installQcMocks({ existingByOrg = {}, sendCalls, forceUniqueViolation = false }) {
  const supabasePath = require.resolve("../services/supabaseService");
  const originalSupabase = require(supabasePath);
  const inserted = [];
  const workflowSaves = [];
  const emits = [];

  const fakeSupabase = {
    from(table) {
      assert.equal(table, "prospects");
      return {
        insert(row) {
          if (forceUniqueViolation) {
            return {
              select() {
                return {
                  async single() {
                    return {
                      data: null,
                      error: { code: "23505", message: "duplicate key value violates unique constraint" }
                    };
                  }
                };
              }
            };
          }

          inserted.push(row);
          const created = {
            id: `qc-${inserted.length}`,
            ...row
          };
          return {
            select() {
              return {
                async single() {
                  return { data: created, error: null };
                }
              };
            }
          };
        }
      };
    }
  };

  require.cache[supabasePath].exports = {
    ...originalSupabase,
    supabase: fakeSupabase,
    findProspectByNormalizedPhoneInOrganization: async (normalizedPhone, organizationId) => {
      const list = existingByOrg[organizationId] || [];
      return (
        list.find(
          (p) =>
            String(p.normalized_phone || "").includes(String(normalizedPhone || "").replace(/\D/g, "").slice(-10)) ||
            String(p.phone || "").includes(String(normalizedPhone || "").replace(/\D/g, "").slice(-10))
        ) || null
      );
    },
    findProspectInOrganization: async (phone, organizationId) => {
      const list = existingByOrg[organizationId] || [];
      return list.find((p) => p.phone === phone) || inserted.find((p) => p.phone === phone && p.organization_id === organizationId) || null;
    }
  };

  const prospectNumberPath = require.resolve("../services/prospectNumberService");
  const originalProspectNumber = require(prospectNumberPath);
  require.cache[prospectNumberPath].exports = {
    ...originalProspectNumber,
    generateNextProspectNumber: async () => "TL-CANARY-0001"
  };

  const assignmentPath = require.resolve("../core/newLeadAssignmentEngine");
  const originalAssignment = require(assignmentPath);
  require.cache[assignmentPath].exports = {
    ...originalAssignment,
    resolveNewLeadAssignment: async ({ organizationId, createdByUserId }) => ({
      organizationId,
      owner_user_id: createdByUserId,
      assignment_status: "assigned",
      assignment_source: "creator"
    }),
    buildNewLeadAttentionFields: (assignment) => ({
      owner_user_id: assignment.owner_user_id,
      assignment_status: assignment.assignment_status,
      assignment_source: assignment.assignment_source,
      attention_status: "new",
      new_lead_received_at: new Date().toISOString()
    })
  };

  const workflowPath = require.resolve("../core/workflowStateStore");
  const originalWorkflow = require(workflowPath);
  require.cache[workflowPath].exports = {
    ...originalWorkflow,
    savePersistedWorkflowState: async (phone, state, options = {}) => {
      workflowSaves.push({ phone, state, options });
      return state;
    }
  };

  const eventPath = require.resolve("../core/eventEngine");
  const originalEvent = require(eventPath);
  require.cache[eventPath].exports = {
    ...originalEvent,
    emit: async (type, context) => {
      emits.push({ type, context });
      return { success: true };
    },
    EVENT_TYPES: originalEvent.EVENT_TYPES
  };

  const guidancePath = require.resolve("../core/quickCaptureRecommendationEngine");
  const originalGuidance = require(guidancePath);
  require.cache[guidancePath].exports = {
    ...originalGuidance,
    buildQuickCaptureGuidance: async () => ({
      recommendedAction: "required_information",
      estimatedMinutes: 5
    })
  };

  const whatsappPath = require.resolve("../services/whatsappService");
  const originalWhatsapp = require(whatsappPath);
  require.cache[whatsappPath].exports = {
    ...originalWhatsapp,
    sendTextMessage: async (...args) => {
      sendCalls.push(args);
      return { success: true };
    }
  };

  // Clear engine module so it picks up mocked deps
  delete require.cache[require.resolve("../core/quickCaptureEngine")];

  return {
    inserted,
    workflowSaves,
    emits,
    restore() {
      require.cache[supabasePath].exports = originalSupabase;
      require.cache[prospectNumberPath].exports = originalProspectNumber;
      require.cache[assignmentPath].exports = originalAssignment;
      require.cache[workflowPath].exports = originalWorkflow;
      require.cache[eventPath].exports = originalEvent;
      require.cache[guidancePath].exports = originalGuidance;
      require.cache[whatsappPath].exports = originalWhatsapp;
      delete require.cache[require.resolve("../core/quickCaptureEngine")];
    }
  };
}

const QC_BODY = {
  first_name: "Team Legacy",
  last_name: "Calendar Canary",
  phone: SHARED_PHONE,
  preferred_language: "english",
  source: "MANUAL"
};

test("1. SUPER_ADMIN + no Support Mode → home org", async () => {
  const sendCalls = [];
  const mocks = installQcMocks({ sendCalls });
  try {
    const { resolveQuickCaptureOrganizationId, createQuickCaptureProspect } = require(
      "../core/quickCaptureEngine"
    );
    const context = authContext({
      userId: SUPER_ID,
      saasRole: SAAS_ROLES.SUPER_ADMIN,
      organizationId: ORG_A,
      email: "support@teamvision.test"
    });
    const resolved = resolveQuickCaptureOrganizationId(atlasUserFromContext(context), {
      organizationId: ORG_A,
      tenantContext: { organizationId: ORG_A },
      effectiveOrganizationId: ORG_A
    });
    assert.equal(resolved.organizationId, ORG_A);

    const result = await createQuickCaptureProspect(QC_BODY, atlasUserFromContext(context), {
      organizationId: ORG_A,
      tenantContext: { organizationId: ORG_A },
      effectiveOrganizationId: ORG_A
    });
    assert.equal(result.status, 201);
    assert.equal(result.body.prospect.organization_id, ORG_A);
    assert.equal(mocks.inserted[0].organization_id, ORG_A);
    assert.equal(mocks.workflowSaves[0].options.organizationId, ORG_A);
    assert.equal(mocks.emits[0].context.payload.organization_id, ORG_A);
  } finally {
    mocks.restore();
  }
});

test("2. SUPER_ADMIN + TL Support Mode → Team Legacy", async () => {
  const sendCalls = [];
  const mocks = installQcMocks({ sendCalls });
  try {
    const { createQuickCaptureProspect } = require("../core/quickCaptureEngine");
    const context = authContext({
      userId: SUPER_ID,
      saasRole: SAAS_ROLES.SUPER_ADMIN,
      organizationId: ORG_A,
      email: "support@teamvision.test"
    });
    const effective = resolveEffectiveOrganizationId(context, { organizationId: ORG_B });
    assert.equal(effective, ORG_B);

    const result = await createQuickCaptureProspect(QC_BODY, atlasUserFromContext(context), {
      organizationId: ORG_B,
      tenantContext: { organizationId: ORG_B, homeOrganizationId: ORG_A },
      effectiveOrganizationId: ORG_B
    });
    assert.equal(result.status, 201);
    assert.equal(result.body.prospect.organization_id, ORG_B);
    assert.equal(mocks.inserted[0].organization_id, ORG_B);
    assert.notEqual(mocks.inserted[0].organization_id, context.organizationId);
  } finally {
    mocks.restore();
  }
});

test("3. ADMIN → own org", async () => {
  const mocks = installQcMocks({ sendCalls: [] });
  try {
    const { createQuickCaptureProspect } = require("../core/quickCaptureEngine");
    const context = authContext({
      userId: ADMIN_B_ID,
      saasRole: SAAS_ROLES.ADMIN,
      organizationId: ORG_B,
      email: "admin@teamlegacy.test"
    });
    const result = await createQuickCaptureProspect(QC_BODY, atlasUserFromContext(context), {
      organizationId: ORG_B,
      tenantContext: { organizationId: ORG_B }
    });
    assert.equal(result.status, 201);
    assert.equal(result.body.prospect.organization_id, ORG_B);
  } finally {
    mocks.restore();
  }
});

test("4. ADMIN foreign org override → 403", async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const context = authContext({
      userId: ADMIN_B_ID,
      saasRole: SAAS_ROLES.ADMIN,
      organizationId: ORG_B
    });
    req.authContext = context;
    req.supportContext = null;
    req.effectiveOrganizationId = ORG_B;
    req.atlasUser = atlasUserFromContext(context);
    next();
  });
  app.use(organizationGuard());
  app.post("/api/prospects/quick-capture", (req, res) => {
    res.json({ organizationId: getTenantOrganizationId(req) });
  });

  await withServer(app, async (port) => {
    const ok = await fetch(`http://127.0.0.1:${port}/api/prospects/quick-capture`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(QC_BODY)
    });
    assert.equal(ok.status, 200);
    const okBody = await ok.json();
    assert.equal(okBody.organizationId, ORG_B);

    const blocked = await fetch(`http://127.0.0.1:${port}/api/prospects/quick-capture`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...QC_BODY, organizationId: ORG_A })
    });
    assert.equal(blocked.status, 403);
    const blockedBody = await blocked.json();
    assert.equal(blockedBody.error, "FORBIDDEN");
  });
});

test("5. support-mode QC prospect + dependent rows all use TL", async () => {
  const sendCalls = [];
  const mocks = installQcMocks({ sendCalls });
  try {
    const { createQuickCaptureProspect } = require("../core/quickCaptureEngine");
    const context = authContext({
      userId: SUPER_ID,
      saasRole: SAAS_ROLES.SUPER_ADMIN,
      organizationId: ORG_A
    });
    const result = await createQuickCaptureProspect(QC_BODY, atlasUserFromContext(context), {
      organizationId: ORG_B,
      tenantContext: { organizationId: ORG_B, homeOrganizationId: ORG_A },
      effectiveOrganizationId: ORG_B
    });
    assert.equal(result.status, 201);
    assert.equal(mocks.inserted[0].organization_id, ORG_B);
    assert.equal(mocks.workflowSaves[0].options.organizationId, ORG_B);
    assert.equal(mocks.emits[0].context.payload.organization_id, ORG_B);
    assert.equal(mocks.emits[0].context.payload.capture_channel, "quick_capture");
  } finally {
    mocks.restore();
  }
});

test("6. same phone in TV and TL remains tenant-isolated", async () => {
  const mocks = installQcMocks({
    sendCalls: [],
    existingByOrg: {
      [ORG_A]: [
        {
          id: "tv-existing",
          phone: SHARED_PHONE,
          normalized_phone: "15555550188",
          organization_id: ORG_A,
          name: "TV Twin"
        }
      ]
    }
  });
  try {
    const { createQuickCaptureProspect, findProspectByNormalizedPhone } = require(
      "../core/quickCaptureEngine"
    );
    const tvHit = await findProspectByNormalizedPhone("15555550188", ORG_A);
    const tlHit = await findProspectByNormalizedPhone("15555550188", ORG_B);
    assert.ok(tvHit);
    assert.equal(tlHit, null);

    const context = authContext({
      userId: SUPER_ID,
      saasRole: SAAS_ROLES.SUPER_ADMIN,
      organizationId: ORG_A
    });
    const result = await createQuickCaptureProspect(QC_BODY, atlasUserFromContext(context), {
      organizationId: ORG_B,
      tenantContext: { organizationId: ORG_B },
      effectiveOrganizationId: ORG_B
    });
    assert.equal(result.status, 201);
    assert.equal(result.body.prospect.organization_id, ORG_B);
    assert.equal(mocks.inserted.length, 1);
    assert.equal(mocks.inserted[0].organization_id, ORG_B);
  } finally {
    mocks.restore();
  }
});

test("7. Quick Capture does not trigger outbound WhatsApp send", async () => {
  const sendCalls = [];
  const mocks = installQcMocks({ sendCalls });
  try {
    const { createQuickCaptureProspect } = require("../core/quickCaptureEngine");
    const context = authContext({
      userId: SUPER_ID,
      saasRole: SAAS_ROLES.SUPER_ADMIN,
      organizationId: ORG_A
    });
    const result = await createQuickCaptureProspect(QC_BODY, atlasUserFromContext(context), {
      organizationId: ORG_B,
      tenantContext: { organizationId: ORG_B },
      effectiveOrganizationId: ORG_B
    });
    assert.equal(result.status, 201);
    assert.equal(sendCalls.length, 0);
  } finally {
    mocks.restore();
  }
});

test("8. appointment tenant-context wiring unchanged", () => {
  const controller = fs.readFileSync(
    path.join(__dirname, "../controllers/appointmentController.js"),
    "utf8"
  );
  const route = fs.readFileSync(path.join(__dirname, "../routes/quickCapture.js"), "utf8");
  assert.match(controller, /req\.tenantContext\.organizationId/);
  assert.match(route, /organizationGuard\(\)/);
  assert.match(route, /getTenantOrganizationId\(req\)/);
  assert.doesNotMatch(route, /createQuickCaptureProspect\(req\.body,\s*req\.atlasUser\)\s*;/);
});

test("route uses canonical tenant helpers (no second Support Mode system)", () => {
  const route = fs.readFileSync(path.join(__dirname, "../routes/quickCapture.js"), "utf8");
  const engine = fs.readFileSync(path.join(__dirname, "../core/quickCaptureEngine.js"), "utf8");
  assert.match(route, /tenantContextService/);
  assert.match(route, /organizationGuard/);
  assert.match(engine, /tenantContext\?\.organizationId/);
  assert.match(engine, /effectiveOrganizationId/);
  assert.match(engine, /buildDuplicateProspectConflict/);
  assert.doesNotMatch(engine, /loadSupportContextForRequest/);
});

test("9. TV phone only + TL Support Mode → not existing; create allowed", async () => {
  const mocks = installQcMocks({
    sendCalls: [],
    existingByOrg: {
      [ORG_A]: [
        {
          id: "tv-only",
          phone: "+17865553001",
          normalized_phone: "17865553001",
          organization_id: ORG_A,
          name: "TV Only"
        }
      ]
    }
  });
  try {
    const { createQuickCaptureProspect, findProspectByNormalizedPhone } = require(
      "../core/quickCaptureEngine"
    );
    assert.equal(await findProspectByNormalizedPhone("17865553001", ORG_B), null);

    const result = await createQuickCaptureProspect(
      {
        ...QC_BODY,
        phone: "+17865553001"
      },
      atlasUserFromContext(
        authContext({
          userId: SUPER_ID,
          saasRole: SAAS_ROLES.SUPER_ADMIN,
          organizationId: ORG_A
        })
      ),
      {
        organizationId: ORG_B,
        tenantContext: { organizationId: ORG_B },
        effectiveOrganizationId: ORG_B
      }
    );
    assert.equal(result.status, 201);
    assert.equal(result.body.prospect.organization_id, ORG_B);
    assert.notEqual(result.body.prospect.id, "tv-only");
  } finally {
    mocks.restore();
  }
});

test("10. after TL copy exists → TL QC detects TL record only", async () => {
  const mocks = installQcMocks({
    sendCalls: [],
    existingByOrg: {
      [ORG_A]: [
        {
          id: "tv-twin",
          phone: SHARED_PHONE,
          normalized_phone: "15555550188",
          organization_id: ORG_A
        }
      ],
      [ORG_B]: [
        {
          id: "tl-twin",
          phone: SHARED_PHONE,
          normalized_phone: "15555550188",
          organization_id: ORG_B
        }
      ]
    }
  });
  try {
    const { createQuickCaptureProspect } = require("../core/quickCaptureEngine");
    const tlConflict = await createQuickCaptureProspect(
      QC_BODY,
      atlasUserFromContext(
        authContext({
          userId: SUPER_ID,
          saasRole: SAAS_ROLES.SUPER_ADMIN,
          organizationId: ORG_A
        })
      ),
      {
        organizationId: ORG_B,
        tenantContext: { organizationId: ORG_B },
        effectiveOrganizationId: ORG_B
      }
    );
    assert.equal(tlConflict.status, 409);
    assert.equal(tlConflict.body.prospect.id, "tl-twin");
    assert.equal(tlConflict.body.prospect.organization_id, ORG_B);

    const tvConflict = await createQuickCaptureProspect(
      QC_BODY,
      atlasUserFromContext(
        authContext({
          userId: SUPER_ID,
          saasRole: SAAS_ROLES.SUPER_ADMIN,
          organizationId: ORG_A
        })
      ),
      {
        organizationId: ORG_A,
        tenantContext: { organizationId: ORG_A },
        effectiveOrganizationId: ORG_A
      }
    );
    assert.equal(tvConflict.status, 409);
    assert.equal(tvConflict.body.prospect.id, "tv-twin");
    assert.equal(tvConflict.body.prospect.organization_id, ORG_A);
  } finally {
    mocks.restore();
  }
});

test("11. legacy global 23505 without same-org hit → no Open Existing foreign prospect", async () => {
  const mocks = installQcMocks({
    sendCalls: [],
    forceUniqueViolation: true,
    existingByOrg: {
      [ORG_A]: [
        {
          id: "tv-foreign",
          phone: SHARED_PHONE,
          normalized_phone: "15555550188",
          organization_id: ORG_A
        }
      ]
    }
  });
  try {
    const { createQuickCaptureProspect } = require("../core/quickCaptureEngine");
    const result = await createQuickCaptureProspect(
      QC_BODY,
      atlasUserFromContext(
        authContext({
          userId: SUPER_ID,
          saasRole: SAAS_ROLES.SUPER_ADMIN,
          organizationId: ORG_A
        })
      ),
      {
        organizationId: ORG_B,
        tenantContext: { organizationId: ORG_B },
        effectiveOrganizationId: ORG_B
      }
    );
    assert.equal(result.status, 500);
    assert.equal(result.body.error, "QUICK_CAPTURE_FAILED");
    assert.equal(result.body.prospect, undefined);
  } finally {
    mocks.restore();
  }
});

test("12. migration 045 scopes phone uniqueness per organization", () => {
  const migration = fs.readFileSync(
    path.join(__dirname, "../database/migrations/045_prospects_phone_unique_per_organization.sql"),
    "utf8"
  );
  assert.match(migration, /DROP INDEX IF EXISTS idx_prospects_normalized_phone/);
  assert.match(migration, /DROP CONSTRAINT IF EXISTS prospects_phone_key/);
  assert.match(migration, /idx_prospects_org_normalized_phone/);
  assert.match(migration, /organization_id, normalized_phone/);
  assert.match(migration, /idx_prospects_org_phone/);
});
