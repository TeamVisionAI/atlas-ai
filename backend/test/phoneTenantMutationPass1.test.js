/**
 * Pass 1 — tenant-scoped legacy prospect phone mutations.
 */

require("dotenv").config();

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

const test = require("node:test");
const assert = require("node:assert/strict");

const ORG_A = "00000000-0000-4000-8000-000000000001";
const ORG_B = "00000000-0000-4000-8000-000000000099";
const PHONE = "+17865551234";

function reloadWithSupabaseMock(supabase, modulePaths = []) {
  const servicePath = require.resolve("../services/supabaseService");
  const supabaseJsPath = require.resolve("@supabase/supabase-js");
  const originalCreateClient = require(supabaseJsPath).createClient;

  delete require.cache[servicePath];
  for (const modulePath of modulePaths) {
    delete require.cache[require.resolve(modulePath)];
  }

  require(supabaseJsPath).createClient = () => supabase;

  return {
    servicePath,
    supabaseJsPath,
    originalCreateClient,
    restore() {
      require(supabaseJsPath).createClient = originalCreateClient;
      delete require.cache[servicePath];
      for (const modulePath of modulePaths) {
        delete require.cache[require.resolve(modulePath)];
      }
      require(servicePath);
    }
  };
}

function patchSupabaseServiceExports(overrides, modulePaths = []) {
  const servicePath = require.resolve("../services/supabaseService");
  const original = require(servicePath);

  for (const modulePath of modulePaths) {
    delete require.cache[require.resolve(modulePath)];
  }

  require.cache[servicePath].exports = {
    ...original,
    ...overrides
  };

  return {
    servicePath,
    original,
    restore() {
      require.cache[servicePath].exports = original;
      for (const modulePath of modulePaths) {
        delete require.cache[require.resolve(modulePath)];
      }
    }
  };
}

function buildProspectStore(initialRows = []) {
  const rows = initialRows.map((row) => ({ ...row }));

  function matchRows(filters) {
    return rows.filter((row) =>
      filters.every((filter) => {
        if (filter[0] === "__is_null__") {
          return row[filter[1]] == null;
        }
        return String(row[filter[0]]) === String(filter[1]);
      })
    );
  }

  const supabase = {
    from() {
      return {
        update(updates) {
          const filters = [];
          const builder = {
            eq(column, value) {
              filters.push([column, value]);
              return builder;
            },
            is(column, value) {
              if (value === null) {
                filters.push(["__is_null__", column]);
              }
              return builder;
            },
            select() {
              return {
                async maybeSingle() {
                  const matched = matchRows(filters);

                  if (!matched.length) {
                    return { data: null, error: null };
                  }

                  if (matched.length > 1) {
                    return {
                      data: null,
                      error: { message: "multiple rows", code: "PGRST116" }
                    };
                  }

                  Object.assign(matched[0], updates);
                  return { data: { ...matched[0] }, error: null };
                }
              };
            }
          };
          return builder;
        }
      };
    }
  };

  return { supabase, rows };
}

test("updateProspectInOrganization scopes mutation to phone + organization_id", async () => {
  const { supabase, rows } = buildProspectStore([
    {
      id: "a",
      phone: PHONE,
      organization_id: ORG_A,
      name: "Tenant A",
      current_step: "NEW"
    },
    {
      id: "b",
      phone: PHONE,
      organization_id: ORG_B,
      name: "Tenant B",
      current_step: "NEW"
    }
  ]);

  const mock = reloadWithSupabaseMock(supabase);

  try {
    const { updateProspectInOrganization } = require("../services/supabaseService");

    const updated = await updateProspectInOrganization(PHONE, ORG_A, {
      current_step: "CONFIRMED"
    });

    assert.equal(updated.current_step, "CONFIRMED");
    assert.equal(rows.find((row) => row.organization_id === ORG_A).current_step, "CONFIRMED");
    assert.equal(rows.find((row) => row.organization_id === ORG_B).current_step, "NEW");

    const wrongOrg = await updateProspectInOrganization(PHONE, "00000000-0000-4000-8000-000000000088", {
      current_step: "MISSING"
    });
    assert.equal(wrongOrg, null);
    assert.equal(rows.find((row) => row.organization_id === ORG_A).current_step, "CONFIRMED");

    await assert.rejects(
      () => updateProspectInOrganization(PHONE, null, { current_step: "X" }),
      (error) => error.name === "TenantOrganizationRequiredError"
    );
  } finally {
    mock.restore();
  }
});

test("whatsapp resolver existing-prospect update uses tenant-scoped mutation", async () => {
  const resolver = require("../core/whatsappProspectResolver");
  const supabaseService = require("../services/supabaseService");
  const quickCapture = require("../core/quickCaptureEngine");
  const orgResolver = require("../core/whatsappInboundOrganizationResolver");

  const existing = {
    id: "existing-1",
    phone: PHONE,
    organization_id: ORG_A,
    name: "Existing",
    current_step: "GREETING"
  };

  const calls = [];
  const originalUpdate = supabaseService.updateProspectInOrganization;

  supabaseService.updateProspectInOrganization = async (phone, organizationId, updates) => {
    calls.push({ phone, organizationId, updates });
    return { ...existing, ...updates };
  };
  quickCapture.findProspectByNormalizedPhone = async (_phone, organizationId) =>
    organizationId === ORG_A ? existing : null;
  supabaseService.findProspectInOrganization = async (_phone, organizationId) =>
    organizationId === ORG_A ? existing : null;
  orgResolver.resolveWhatsAppInboundOrganizationId = async () => ({
    organizationId: ORG_A,
    source: "explicit"
  });
  resolver.setQrAttributionServiceForTests({
    matchEligiblePendingInboundScan: async () => ({
      ok: false,
      outcome: "MISS",
      reasonCode: "NO_PENDING_SCAN",
      scan: null,
      campaign: null
    }),
    buildAttributionTouch: () => null,
    consumeMatchedScan: async () => ({ ok: true })
  });

  try {
    await resolver.locateOrCreateWhatsAppProspect({
      phone: "7865551234",
      name: "Existing",
      firstMessage: "hello again",
      correlationBase: "corr-pass1",
      organizationId: ORG_A
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].organizationId, ORG_A);
    assert.equal(calls[0].phone, PHONE);
    assert.equal(calls[0].updates.last_message, "hello again");
  } finally {
    supabaseService.updateProspectInOrganization = originalUpdate;
  }
});

test("newLeadAttention claimLead updates only matching organization row", async () => {
  const { supabase, rows } = buildProspectStore([
    {
      id: "a",
      phone: PHONE,
      organization_id: ORG_A,
      owner_user_id: null,
      assignment_status: "unassigned"
    },
    {
      id: "b",
      phone: PHONE,
      organization_id: ORG_B,
      owner_user_id: null,
      assignment_status: "unassigned"
    }
  ]);

  const servicePath = require.resolve("../services/supabaseService");
  const originalService = require(servicePath);
  require.cache[servicePath].exports = {
    ...originalService,
    supabase
  };

  const userPath = require.resolve("../services/atlasUserService");
  const originalUser = require(userPath);
  require.cache[userPath].exports = {
    ...originalUser,
    findUserById: async () => ({
      id: "agent-1",
      organization_id: ORG_A,
      role: "agent",
      status: "active"
    })
  };

  delete require.cache[require.resolve("../core/newLeadAttentionEngine")];

  try {
    const { claimLead } = require("../core/newLeadAttentionEngine");

    const claimed = await claimLead(
      { id: "a", phone: PHONE, organization_id: ORG_A, assignment_status: "unassigned" },
      { userId: "agent-1", userEmail: "agent@example.com" }
    );

    assert.equal(claimed.prospect.owner_user_id, "agent-1");
    assert.equal(rows.find((row) => row.organization_id === ORG_A).owner_user_id, "agent-1");
    assert.equal(rows.find((row) => row.organization_id === ORG_B).owner_user_id, null);
  } finally {
    delete require.cache[userPath];
    require(userPath);
    delete require.cache[servicePath];
    require(servicePath);
    delete require.cache[require.resolve("../core/newLeadAttentionEngine")];
  }
});

test("prospect workspace profile PATCH uses tenant-scoped update", async () => {
  const prospectA = {
    id: "a",
    phone: PHONE,
    organization_id: ORG_A,
    name: "Tenant A",
    first_name: "Tenant",
    last_name: "A",
    notes: null
  };

  const updates = [];
  const patch = patchSupabaseServiceExports(
    {
      findProspectInOrganization: async (phone, organizationId) => {
        if (phone === PHONE && organizationId === ORG_A) {
          return { ...prospectA };
        }
        return null;
      },
      updateProspectInOrganization: async (phone, organizationId, patchBody) => {
        updates.push({ phone, organizationId, patch: patchBody });
        return { ...prospectA, ...patchBody };
      }
    },
    ["../core/prospectWorkspaceProfileEngine"]
  );

  try {
    const engine = require("../core/prospectWorkspaceProfileEngine");
    const result = await engine.updateProspectWorkspaceProfile(
      PHONE,
      { first_name: "Updated" },
      { organizationId: ORG_A }
    );

    assert.equal(result.ok, true);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].organizationId, ORG_A);
    assert.equal(updates[0].patch.first_name, "Updated");

    const foreign = await engine.updateProspectWorkspaceProfile(
      PHONE,
      { first_name: "Nope" },
      { organizationId: ORG_B }
    );
    assert.equal(foreign.ok, false);
    assert.equal(foreign.status, 404);
  } finally {
    patch.restore();
  }
});

test("appointment syncProspectContact uses tenant-scoped update", async () => {
  const calls = [];
  const patch = patchSupabaseServiceExports(
    {
      updateProspectInOrganization: async (phone, organizationId, patchBody) => {
        calls.push({ phone, organizationId, patch: patchBody });
        return { phone, organization_id: organizationId, ...patchBody };
      }
    },
    ["../application/appointmentApplicationService"]
  );

  try {
    const appointmentService = require("../application/appointmentApplicationService");
    await appointmentService.collectProspectEmail(PHONE, "test@example.com", ORG_A);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].organizationId, ORG_A);
    assert.equal(calls[0].phone, PHONE);
  } finally {
    patch.restore();
  }
});
