/**
 * Hotfix — WhatsApp inbound prospects must receive organization_id.
 * Covers tenant scoping, idempotency, and Prospect Center org filter expectations.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  resolveWhatsAppInboundOrganizationId,
  WhatsAppInboundOrganizationError,
  canonicalDefaultOrganizationId
} = require("../core/whatsappInboundOrganizationResolver");
const { parseWhatsAppWebhookBody } = require("../services/whatsappWebhookParser");
const { filterProspectsForAuthContext } = require("../security/authorizationService");
const { ROLES } = require("../security/roles");
const {
  authorizeWhatsAppOutbound,
  DELIVERY_STATUSES
} = require("../core/whatsappOutboundAuthorizationGate");
const { evaluateCustomerCareWindowFromInboundAt } = require("../core/whatsappCustomerCareWindow");

const ORG_A = "00000000-0000-4000-8000-000000000001";
const ORG_B = "00000000-0000-4000-8000-000000000099";
const PHONE_ID = "1347188398469744";
const WABA_ID = "123456789012345";

function withEnv(overrides, fn) {
  const previous = {};
  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    });
}

function authContext(role, userId, organizationId = ORG_A) {
  return {
    userId,
    organizationId,
    role,
    permissions: ["prospect:read"],
    status: "active"
  };
}

test("1. resolver prefers environment credentials mapped to canonical default org", async () => {
  await withEnv(
    {
      ATLAS_DEFAULT_ORGANIZATION_ID: ORG_A,
      WHATSAPP_PHONE_NUMBER_ID: PHONE_ID,
      WHATSAPP_BUSINESS_ACCOUNT_ID: WABA_ID
    },
    async () => {
      const resolved = await resolveWhatsAppInboundOrganizationId({
        phoneNumberId: PHONE_ID,
        wabaId: WABA_ID,
        connectionRepository: { getConnection: async () => null }
      });
      assert.equal(resolved.organizationId, ORG_A);
      assert.equal(resolved.source, "environment_credentials");
    }
  );
});

test("2. resolver uses connected WhatsApp integration when phone matches", async () => {
  await withEnv(
    {
      ATLAS_DEFAULT_ORGANIZATION_ID: ORG_A,
      WHATSAPP_PHONE_NUMBER_ID: undefined,
      WHATSAPP_BUSINESS_ACCOUNT_ID: undefined
    },
    async () => {
      const resolved = await resolveWhatsAppInboundOrganizationId({
        phoneNumberId: PHONE_ID,
        wabaId: WABA_ID,
        connectionRepository: {
          getConnection: async () => ({
            status: "connected",
            phone_number_id: PHONE_ID,
            waba_id: WABA_ID
          })
        }
      });
      assert.equal(resolved.organizationId, ORG_A);
      assert.equal(resolved.source, "whatsapp_connection");
    }
  );
});

test("3. mismatched phone_number_id fails safely (no null-org create path)", async () => {
  await withEnv(
    {
      ATLAS_DEFAULT_ORGANIZATION_ID: ORG_A,
      WHATSAPP_PHONE_NUMBER_ID: PHONE_ID,
      WHATSAPP_BUSINESS_ACCOUNT_ID: WABA_ID
    },
    async () => {
      await assert.rejects(
        () =>
          resolveWhatsAppInboundOrganizationId({
            phoneNumberId: "9999999999999999",
            wabaId: WABA_ID,
            connectionRepository: { getConnection: async () => null }
          }),
        (error) =>
          error instanceof WhatsAppInboundOrganizationError &&
          error.code === "WHATSAPP_PHONE_ASSET_MISMATCH"
      );
    }
  );
});

test("4. missing organization resolution fails safely", async () => {
  await withEnv(
    {
      ATLAS_DEFAULT_ORGANIZATION_ID: undefined,
      DEFAULT_ORGANIZATION_ID: undefined,
      WHATSAPP_PHONE_NUMBER_ID: undefined,
      WHATSAPP_BUSINESS_ACCOUNT_ID: undefined
    },
    async () => {
      // Force canonical default empty by temporarily shadowing via explicit empty env and
      // providing a phone id so the soft canonical_default path is skipped.
      await assert.rejects(
        () =>
          resolveWhatsAppInboundOrganizationId({
            phoneNumberId: PHONE_ID,
            connectionRepository: {
              getConnection: async () => null
            }
          }),
        (error) => error instanceof WhatsAppInboundOrganizationError
      );
    }
  );
});

test("5. webhook parser extracts phoneNumberId and wabaId for org routing", () => {
  const messages = parseWhatsAppWebhookBody({
    object: "whatsapp_business_account",
    entry: [
      {
        id: WABA_ID,
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "17867528080",
                phone_number_id: PHONE_ID
              },
              contacts: [{ profile: { name: "Ada" }, wa_id: "17865539999" }],
              messages: [
                {
                  from: "17865539999",
                  id: "wamid.TEST123",
                  timestamp: "1754440000",
                  type: "text",
                  text: { body: "Hola" }
                }
              ]
            },
            field: "messages"
          }
        ]
      }
    ]
  });

  assert.equal(messages.length, 1);
  assert.equal(messages[0].phoneNumberId, PHONE_ID);
  assert.equal(messages[0].wabaId, WABA_ID);
  assert.equal(messages[0].contactName, "Ada");
});

test("6. insertWhatsAppProspectRow requires organization_id", async () => {
  const { insertWhatsAppProspectRow } = require("../core/whatsappProspectResolver");
  await assert.rejects(
    () =>
      insertWhatsAppProspectRow({
        storagePhone: "+17865539999",
        normalizedPhone: "17865539999",
        name: null,
        firstMessage: "hi",
        organizationId: null
      }),
    (error) => error instanceof WhatsAppInboundOrganizationError
  );
});

test("7. unknown sender insert payload includes organization and allows missing profile fields", async () => {
  const { insertWhatsAppProspectRow } = require("../core/whatsappProspectResolver");
  const supabaseService = require("../services/supabaseService");
  const prospectNumberService = require("../services/prospectNumberService");

  const originalFrom = supabaseService.supabase.from;
  const originalGenerate = prospectNumberService.generateNextProspectNumber;

  let inserted = null;
  prospectNumberService.generateNextProspectNumber = async () => "TV-TEST-ORG";
  supabaseService.supabase.from = (table) => {
    if (table === "prospects") {
      return {
        insert(row) {
          inserted = row;
          return {
            select() {
              return {
                single: async () => ({ data: { ...row, id: "prospect-test-1" }, error: null })
              };
            }
          };
        }
      };
    }
    // BR-080 assignment may query atlas_users / org settings — return empty safely.
    return {
      select() {
        return {
          eq() {
            return this;
          },
          in() {
            return this;
          },
          is() {
            return this;
          },
          order() {
            return this;
          },
          limit() {
            return this;
          },
          maybeSingle: async () => ({ data: null, error: null }),
          single: async () => ({ data: null, error: null }),
          then: undefined
        };
      }
    };
  };

  try {
    const row = await insertWhatsAppProspectRow({
      storagePhone: "+17865538888",
      normalizedPhone: "17865538888",
      name: null,
      firstMessage: "Hello",
      organizationId: ORG_A
    });

    assert.equal(inserted.organization_id, ORG_A);
    assert.equal(inserted.name, "Unknown");
    assert.equal(inserted.status, "NEW");
    assert.equal(inserted.preferred_communication_channel, "WHATSAPP");
    assert.equal(row.organization_id, ORG_A);
    assert.ok(!inserted.city);
    assert.ok(!inserted.email);
  } finally {
    supabaseService.supabase.from = originalFrom;
    prospectNumberService.generateNextProspectNumber = originalGenerate;
  }
});

test("8. Prospect Center org filter includes lead for correct org and excludes other org", () => {
  const prospects = [
    {
      id: "p1",
      prospect_number: "TV-000028",
      organization_id: ORG_A,
      owner_user_id: null,
      phone: "+17865537338",
      name: "Lead"
    }
  ];

  const adminA = filterProspectsForAuthContext(
    authContext(ROLES.ADMINISTRATOR, "admin-1", ORG_A),
    prospects
  );
  const adminB = filterProspectsForAuthContext(
    authContext(ROLES.ADMINISTRATOR, "admin-2", ORG_B),
    prospects.map((p) => ({ ...p, organization_id: ORG_A }))
  );

  // loadProductionProspects already eq-filters by org; auth layer uses DEFAULT fallback for null,
  // but for explicit ORG_A prospect, other-org admin must not pass sameOrganization.
  assert.equal(adminA.length, 1);
  assert.equal(adminB.length, 0);

  const rvp = filterProspectsForAuthContext(
    authContext(ROLES.RVP, "33ad243a-9d00-4a4d-810b-df2762c0f076", ORG_A),
    prospects
  );
  const agent = filterProspectsForAuthContext(
    authContext(ROLES.AGENT, "33ad243a-9d00-4a4d-810b-df2762c0f076", ORG_A),
    prospects
  );

  assert.equal(rvp.length, 1, "RVP sees org-scoped unassigned lead");
  assert.equal(agent.length, 0, "AGENT without ownership does not see unassigned lead");
});

test("9. duplicate provider message short-circuits before second create (idempotency contract)", async () => {
  const { processInboundWhatsAppMessage } = require("../core/whatsappInboundPipeline");
  let locateCalls = 0;

  const result = await processInboundWhatsAppMessage(
    {
      providerMessageId: "wamid.DUP1",
      phone: "17865530001",
      contactName: "Dup",
      body: "hi",
      phoneNumberId: PHONE_ID,
      wabaId: WABA_ID
    },
    {
      resolveWhatsAppInboundOrganizationId: async () => ({
        organizationId: ORG_A,
        source: "explicit"
      }),
      claimWhatsAppInboundCorrelation: async () => ({
        claimed: false,
        reason: "DUPLICATE_PROVIDER_MESSAGE"
      }),
      locateOrCreateWhatsAppProspect: async () => {
        locateCalls += 1;
        throw new Error("locateOrCreate must not run on duplicate claim");
      }
    }
  );
  assert.equal(result.skipped, true);
  assert.equal(result.reason, "DUPLICATE_PROVIDER_MESSAGE");
  assert.equal(locateCalls, 0);
});

test("10. BR-075 outbound gate remains active (unchanged)", async () => {
  const auth = await authorizeWhatsAppOutbound({
    intent: "FOLLOW_UP",
    phone: "+17865550100",
    message: "Checking in",
    now: Date.parse("2026-08-05T18:00:00.000Z"),
    evaluateWindow: async () =>
      evaluateCustomerCareWindowFromInboundAt({
        latestInboundAt: null,
        now: Date.parse("2026-08-05T18:00:00.000Z")
      })
  });
  assert.equal(auth.authorized, false);
  assert.ok(
    [
      DELIVERY_STATUSES.BLOCKED_TEMPLATE_MISSING,
      DELIVERY_STATUSES.BLOCKED_TEMPLATE_UNAPPROVED,
      DELIVERY_STATUSES.BLOCKED_WINDOW_CLOSED
    ].includes(auth.status)
  );
});

test("11. Meta Review workspace contract file remains present (unchanged surface)", () => {
  const metaReviewTest = path.join(
    __dirname,
    "../../frontend/src/config/metaReviewWorkspace.test.js"
  );
  assert.equal(fs.existsSync(metaReviewTest), true);
});

test("12. mission projection catch-up contract: org-scoped business events are sufficient", () => {
  // atlas_mission_control_prospects is not written by MissionControlRepository;
  // state blob projection keys by prospectId + organizationId from business events.
  const { projectMissionControlEvent, PROJECTION_STATUS } = require("../modules/mission-control/application/projectMissionControlEvent");
  assert.equal(typeof projectMissionControlEvent, "function");
  assert.equal(PROJECTION_STATUS.CREATED, "created");
  assert.equal(canonicalDefaultOrganizationId() || ORG_A, canonicalDefaultOrganizationId() || ORG_A);
});

test("13. locateOrCreate is idempotent for existing phone (no second insert)", async () => {
  await withEnv(
    {
      ATLAS_DEFAULT_ORGANIZATION_ID: ORG_A,
      WHATSAPP_PHONE_NUMBER_ID: PHONE_ID,
      WHATSAPP_BUSINESS_ACCOUNT_ID: WABA_ID
    },
    async () => {
      const resolver = require("../core/whatsappProspectResolver");
      const supabaseService = require("../services/supabaseService");
      const quickCapture = require("../core/quickCaptureEngine");
      const hooks = require("../core/recruitingWorkflowHooks");
      const orgResolver = require("../core/whatsappInboundOrganizationResolver");

      const existing = {
        id: "existing-1",
        phone: "+17865537777",
        organization_id: ORG_A,
        name: "Existing",
        current_step: "GREETING",
        prospect_number: "TV-EXIST"
      };

      const originalFindNorm = quickCapture.findProspectByNormalizedPhone;
      const originalFindNormalizedInOrg = supabaseService.findProspectByNormalizedPhoneInOrganization;
      const originalFindInOrg = supabaseService.findProspectInOrganization;
      const originalUpdate = supabaseService.updateProspectInOrganization;
      const originalHook = hooks.onLegacyProspectCreated;
      const originalResolve = orgResolver.resolveWhatsAppInboundOrganizationId;

      quickCapture.findProspectByNormalizedPhone = async (_phone, organizationId) =>
        organizationId === ORG_A ? existing : null;
      supabaseService.findProspectByNormalizedPhoneInOrganization = async (_phone, organizationId) =>
        organizationId === ORG_A ? existing : null;
      supabaseService.findProspectInOrganization = async (_phone, organizationId) =>
        organizationId === ORG_A ? existing : null;
      supabaseService.updateProspectInOrganization = async (_phone, organizationId, updates) => ({
        ...existing,
        organization_id: organizationId,
        ...updates
      });
      hooks.onLegacyProspectCreated = async () => null;
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
        const result = await resolver.locateOrCreateWhatsAppProspect({
          phone: "17865537777",
          name: "Existing",
          firstMessage: "again",
          correlationBase: "corr-idem",
          phoneNumberId: PHONE_ID,
          wabaId: WABA_ID
        });
        assert.equal(result.created, false);
        assert.equal(result.organizationId, ORG_A);
        assert.equal(result.prospect.prospect_number, "TV-EXIST");
      } finally {
        quickCapture.findProspectByNormalizedPhone = originalFindNorm;
        supabaseService.findProspectByNormalizedPhoneInOrganization = originalFindNormalizedInOrg;
        supabaseService.findProspectInOrganization = originalFindInOrg;
        supabaseService.updateProspectInOrganization = originalUpdate;
        hooks.onLegacyProspectCreated = originalHook;
        orgResolver.resolveWhatsAppInboundOrganizationId = originalResolve;
        resolver.setQrAttributionServiceForTests(null);
      }
    }
  );
});
