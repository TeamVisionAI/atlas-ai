/**
 * BR-159 — Personal/unknown contacts are not operational prospects.
 * Same rule for Team Vision, Team Legacy, and every future tenant.
 */

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  evaluateProspectPromotion,
  isOperationalProspectRecord,
  filterOperationalProspects,
  buildDepromotionPatch
} = require("../core/prospectPromotionEligibility");
const {
  evaluateAtlasInboundAutomationEligibility,
  hasPositiveCtwaReferral
} = require("../core/atlasInboundAutomationEligibility");
const { resolveCreateSourceFields } = require("../core/whatsappProspectResolver");
const { WHATSAPP_ENTRY_METHOD, WHATSAPP_SOURCE } = require("../core/whatsappConstants");
const {
  deriveProspectNumberPrefix,
  formatProspectNumber,
  generateNextProspectNumber
} = require("../services/prospectNumberService");
const { DEFAULT_ORGANIZATION_ID } = require("../modules/prospects/domain/constants");
const { INTAKE_CODE_STATUS } = require("../core/campaignIntakeCode/constants");
const { filterProductionProspects } = require("../core/productionProspectFilter");
const { processInboundWhatsAppMessage } = require("../core/whatsappInboundPipeline");

const TEAM_VISION = "00000000-0000-4000-8000-000000000001";
const TEAM_LEGACY = "af8fb707-f26c-4152-ad77-2d079d30bc8a";
const NEW_TENANT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function unknownContact(overrides = {}) {
  return {
    id: "contact-1",
    phone: "+17865551001",
    name: "Gaby",
    organization_id: TEAM_LEGACY,
    source: WHATSAPP_SOURCE.UNKNOWN,
    entry_method: WHATSAPP_ENTRY_METHOD.UNATTRIBUTED,
    current_step: "NEW",
    status: "NEW",
    prospect_number: "TV-000099",
    ...overrides
  };
}

function ctwaProspect(organizationId, overrides = {}) {
  const { workflow_state: workflowState, ...rest } = overrides;
  return {
    id: "ctwa-1",
    phone: "+17865551002",
    name: "Ad Lead",
    organization_id: organizationId,
    source: WHATSAPP_SOURCE.FACEBOOK,
    entry_method: WHATSAPP_ENTRY_METHOD.CLICK_TO_WHATSAPP,
    current_step: "NEW",
    status: "NEW",
    prospect_number: rest.prospect_number,
    workflow_state: {
      atlasEligibilitySource: "CTWA_REFERRAL",
      ...(workflowState || {})
    },
    ...rest
  };
}

test("unknown personal inbound is not promoted", () => {
  const decision = evaluateProspectPromotion({
    existingProspect: null,
    ctwaReferral: null,
    qrTouch: null,
    campaignIntakeMatch: null
  });
  assert.equal(decision.promote, false);
  assert.equal(decision.reason, "NO_VALID_PROMOTION_SIGNAL");
});

test("valid CTWA becomes a prospect", () => {
  const decision = evaluateProspectPromotion({
    existingProspect: null,
    ctwaReferral: { source_type: "ad", ctwa_clid: "clid-1" }
  });
  assert.equal(decision.promote, true);
  assert.equal(decision.reason, "CTWA_REFERRAL");
});

test("valid recruiting campaign intake becomes a prospect", () => {
  const decision = evaluateProspectPromotion({
    existingProspect: null,
    campaignIntakeMatch: {
      matched: true,
      purpose: "RECRUITING",
      recruitingEligible: true
    }
  });
  assert.equal(decision.promote, true);
  assert.equal(decision.reason, "CAMPAIGN_INTAKE_CODE");
});

test("valid IUL campaign intake becomes a prospect without Recruit AI routing change", () => {
  const match = {
    matched: true,
    purpose: "IUL",
    status: INTAKE_CODE_STATUS.ACTIVE,
    iulReviewEligible: true,
    recruitingEligible: false
  };
  const decision = evaluateProspectPromotion({
    existingProspect: null,
    campaignIntakeMatch: match
  });
  assert.equal(decision.promote, true);
  assert.equal(decision.reason, "CAMPAIGN_INTAKE_IUL");

  const fields = resolveCreateSourceFields(null, { campaignIntakeMatch: match });
  assert.equal(fields.source, WHATSAPP_SOURCE.CAMPAIGN_INTAKE);
  assert.equal(fields.entryMethod, WHATSAPP_ENTRY_METHOD.CAMPAIGN_INTAKE_CODE);
});

test("Quick Capture explicit prospect still works", () => {
  const decision = evaluateProspectPromotion({
    existingProspect: null,
    intakeSource: "QUICK_CAPTURE"
  });
  assert.equal(decision.promote, true);
  assert.equal(decision.reason, "EXPLICIT_PROSPECT_CREATE");
});

test("Team Legacy / Team Vision / new tenant personal contacts stay out of operational lists", () => {
  const rows = [
    unknownContact({ organization_id: TEAM_LEGACY, name: "Gaby" }),
    unknownContact({
      id: "tv-unknown",
      organization_id: TEAM_VISION,
      phone: "+17865551011",
      name: "Personal TV"
    }),
    unknownContact({
      id: "new-unknown",
      organization_id: NEW_TENANT,
      phone: "+17865551012",
      name: "Personal New Tenant"
    }),
    ctwaProspect(TEAM_LEGACY, { prospect_number: "TL-000001", name: "Genuine Legacy" }),
    ctwaProspect(TEAM_VISION, { prospect_number: "TV-000010", name: "Genuine Vision" }),
    ctwaProspect(NEW_TENANT, { prospect_number: "NT-000001", name: "Genuine New" })
  ];

  const operational = filterOperationalProspects(rows);
  assert.deepEqual(
    operational.map((row) => row.name).sort(),
    ["Genuine Legacy", "Genuine New", "Genuine Vision"]
  );

  for (const orgId of [TEAM_LEGACY, TEAM_VISION, NEW_TENANT]) {
    assert.equal(
      isOperationalProspectRecord(unknownContact({ organization_id: orgId })),
      false
    );
  }
});

test("genuine Legacy prospect keeps Legacy organization and tenant-facing ID prefix", () => {
  const prefix = deriveProspectNumberPrefix({
    slug: "team-legacy",
    name: "Team Legacy"
  });
  assert.equal(prefix, "TL");
  assert.equal(formatProspectNumber(1, prefix), "TL-000001");

  const genuine = ctwaProspect(TEAM_LEGACY, { prospect_number: "TL-000001" });
  assert.equal(genuine.organization_id, TEAM_LEGACY);
  assert.equal(isOperationalProspectRecord(genuine), true);
  assert.match(genuine.prospect_number, /^TL-/);
});

test("no DEFAULT_ORGANIZATION_ID fallback creates a TV prospect identity", async () => {
  await assert.rejects(
    () => generateNextProspectNumber(null),
    /organizationId is required/
  );
  await assert.rejects(
    () => generateNextProspectNumber(""),
    /organizationId is required/
  );

  const source = fs.readFileSync(
    path.join(__dirname, "../services/prospectNumberService.js"),
    "utf8"
  );
  assert.equal(source.includes(DEFAULT_ORGANIZATION_ID), false);
  assert.doesNotMatch(source, /require\(.*prospects\/domain\/constants/);
  assert.doesNotMatch(source, /ATLAS_DEFAULT_ORGANIZATION_ID/);

  const number = await generateNextProspectNumber(NEW_TENANT, {
    organization: { slug: "north-star-agency", name: "North Star Agency" },
    loadOrganization: async () => {
      throw new Error("must not load DEFAULT_ORGANIZATION_ID");
    },
    queryLatest: async () => null
  });
  assert.equal(number, "NS-000001");
  assert.notEqual(deriveProspectNumberPrefix({ slug: "team-vision" }), "NS");
});

test("Team Vision prefix still derives from slug, not a hardcoded UUID branch", () => {
  assert.equal(deriveProspectNumberPrefix({ slug: "team-vision" }), "TV");
  const resolverSrc = fs.readFileSync(
    path.join(__dirname, "../core/prospectPromotionEligibility.js"),
    "utf8"
  );
  assert.equal(resolverSrc.includes(TEAM_VISION), false);
  assert.equal(resolverSrc.includes("00000000-0000-4000-8000-000000000001"), false);
});

test("existing recruiting and IUL routing remain unchanged", () => {
  const unknown = unknownContact({ organization_id: TEAM_VISION });
  assert.equal(
    evaluateAtlasInboundAutomationEligibility({
      prospect: unknown,
      inbound: { body: "Hola" },
      workflowState: {}
    }).eligible,
    false
  );

  const ctwa = evaluateAtlasInboundAutomationEligibility({
    prospect: unknown,
    inbound: { ctwaReferral: { source_type: "ad", ctwa_clid: "x" } },
    workflowState: {}
  });
  assert.equal(ctwa.eligible, true);
  assert.equal(ctwa.reason, "CTWA_REFERRAL");

  const iul = evaluateAtlasInboundAutomationEligibility({
    prospect: unknown,
    inbound: {
      campaignIntakeMatch: {
        matched: true,
        purpose: "IUL",
        status: INTAKE_CODE_STATUS.ACTIVE,
        iulReviewEligible: true,
        recruitingEligible: false
      }
    },
    workflowState: {}
  });
  assert.equal(iul.eligible, true);
  assert.equal(iul.reason, "CAMPAIGN_INTAKE_IUL");

  assert.equal(hasPositiveCtwaReferral({ source_type: "ad" }), true);
  assert.equal(hasPositiveCtwaReferral({ source_type: "post" }), false);
});

test("depromoted rows stay off operational surfaces even with leftover NEW status", () => {
  const patch = buildDepromotionPatch({ reason: "NO_VALID_PROMOTION_SIGNAL" });
  const row = unknownContact({
    workflow_state: patch,
    current_step: "NEW"
  });
  assert.equal(isOperationalProspectRecord(row), false);
  assert.equal(filterProductionProspects([row], { operationalOnly: true }).length, 0);
});

test("lifecycle progress without provenance is not an operational prospect", () => {
  const scheduled = unknownContact({
    name: "Interviewed",
    current_step: "INTERVIEW_SCHEDULED",
    workflow_state: { canonicalMilestone: "INTERVIEW_SCHEDULED" }
  });
  assert.equal(isOperationalProspectRecord(scheduled), false);
});

test("locateOrCreate logs-only path does not insert an unknown inbound prospect", async () => {
  const resolver = require("../core/whatsappProspectResolver");
  const supabaseService = require("../services/supabaseService");
  const quickCapture = require("../core/quickCaptureEngine");
  const orgResolver = require("../core/whatsappInboundOrganizationResolver");

  let inserted = false;
  const originalFrom = supabaseService.supabase.from;
  const originalUpdate = supabaseService.updateProspectInOrganization;

  quickCapture.findProspectByNormalizedPhone = async () => null;
  supabaseService.findProspectByNormalizedPhoneInOrganization = async () => null;
  supabaseService.findProspectInOrganization = async () => null;
  supabaseService.findProspectByWhatsAppSenderIdInOrganization = async () => null;
  orgResolver.resolveWhatsAppInboundOrganizationId = async () => ({
    organizationId: TEAM_LEGACY,
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
  supabaseService.supabase.from = (table) => {
    if (table === "prospects") {
      return {
        insert() {
          inserted = true;
          throw new Error("unknown inbound must not insert a prospect");
        }
      };
    }
    return originalFrom.call(supabaseService.supabase, table);
  };

  try {
    const result = await resolver.locateOrCreateWhatsAppProspect({
      phone: "+17865551999",
      name: "Sebastian R",
      firstMessage: "Hola",
      correlationBase: "corr-br159-unknown",
      organizationId: TEAM_LEGACY
    });

    assert.equal(result.prospect, null);
    assert.equal(result.created, false);
    assert.equal(result.contactOnly, true);
    assert.equal(result.promotionDeniedReason, "NO_VALID_PROMOTION_SIGNAL");
    assert.equal(result.organizationId, TEAM_LEGACY);
    assert.equal(inserted, false);
  } finally {
    supabaseService.supabase.from = originalFrom;
    supabaseService.updateProspectInOrganization = originalUpdate;
    resolver.setQrAttributionServiceForTests(null);
  }
});

test("locateOrCreate still inserts a CTWA prospect for an arbitrary tenant", async () => {
  const resolver = require("../core/whatsappProspectResolver");
  const supabaseService = require("../services/supabaseService");
  const quickCapture = require("../core/quickCaptureEngine");
  const orgResolver = require("../core/whatsappInboundOrganizationResolver");
  const prospectNumberService = require("../services/prospectNumberService");

  const originalGenerate = prospectNumberService.generateNextProspectNumber;
  const originalFrom = supabaseService.supabase.from;
  let inserted = null;

  prospectNumberService.generateNextProspectNumber = async (organizationId) => {
    assert.equal(organizationId, NEW_TENANT);
    return "NS-000007";
  };
  quickCapture.findProspectByNormalizedPhone = async () => null;
  supabaseService.findProspectByNormalizedPhoneInOrganization = async () => null;
  supabaseService.findProspectInOrganization = async () => null;
  supabaseService.findProspectByWhatsAppSenderIdInOrganization = async () => null;
  orgResolver.resolveWhatsAppInboundOrganizationId = async () => ({
    organizationId: NEW_TENANT,
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
  const emptyQuery = {
    eq() {
      return this;
    },
    in() {
      return this;
    },
    is() {
      return this;
    },
    not() {
      return this;
    },
    like() {
      return this;
    },
    order() {
      return this;
    },
    limit() {
      return this;
    },
    select() {
      return this;
    },
    maybeSingle: async () => ({ data: null, error: null }),
    single: async () => ({ data: null, error: null })
  };
  supabaseService.supabase.from = (table) => {
    if (table === "prospects") {
      return {
        ...emptyQuery,
        insert(row) {
          inserted = row;
          return {
            select() {
              return {
                single: async () => ({ data: { ...row, id: "p-new" }, error: null })
              };
            }
          };
        }
      };
    }
    return {
      ...emptyQuery,
      insert() {
        return {
          select() {
            return {
              single: async () => ({ data: { id: "evt-1" }, error: null })
            };
          }
        };
      }
    };
  };

  try {
    const result = await resolver.locateOrCreateWhatsAppProspect({
      phone: "+17865551888",
      name: "North Star Lead",
      firstMessage: "Hi from ad",
      correlationBase: "corr-br159-ctwa",
      organizationId: NEW_TENANT,
      ctwaReferral: { source_type: "ad", ctwa_clid: "clid-ns" }
    });

    assert.equal(result.created, true);
    assert.equal(result.prospect.id, "p-new");
    assert.equal(inserted.organization_id, NEW_TENANT);
    assert.equal(inserted.prospect_number, "NS-000007");
    assert.equal(inserted.entry_method, WHATSAPP_ENTRY_METHOD.CLICK_TO_WHATSAPP);
  } finally {
    prospectNumberService.generateNextProspectNumber = originalGenerate;
    supabaseService.supabase.from = originalFrom;
    resolver.setQrAttributionServiceForTests(null);
  }
});

test("inbound pipeline persists unknown contact without hub / Recruit AI", async () => {
  const logs = [];
  let hubCalled = false;

  const result = await processInboundWhatsAppMessage(
    {
      providerMessageId: "wamid.BR159.UNKNOWN",
      phone: "+17865551777",
      contactName: "Any",
      body: "Hey",
      phoneNumberId: "pn-legacy",
      wabaId: "waba-legacy"
    },
    {
      resolveWhatsAppInboundOrganizationId: async () => ({
        organizationId: TEAM_LEGACY,
        source: "explicit"
      }),
      claimWhatsAppInboundCorrelation: async () => ({ claimed: true }),
      locateOrCreateWhatsAppProspect: async () => ({
        prospect: null,
        created: false,
        storagePhone: "+17865551777",
        organizationId: TEAM_LEGACY,
        contactOnly: true,
        promotionDeniedReason: "NO_VALID_PROMOTION_SIGNAL",
        qrAttribution: null,
        campaignIntakeMatch: null
      }),
      campaignIntakeAttributionService: {
        lookupInboundMatch: async () => ({ matched: false })
      },
      logConversation: async (payload) => {
        logs.push(payload);
        return { success: true, log: { id: "log-1" } };
      },
      processConversationAfterInbound: async () => {
        hubCalled = true;
        return { success: true, replied: true };
      }
    }
  );

  assert.equal(result.success, true);
  assert.equal(result.contactOnly, true);
  assert.equal(result.prospectId, null);
  assert.equal(result.conversation?.replied, false);
  assert.equal(hubCalled, false);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].phone, "+17865551777");
  assert.equal(logs[0].message, "Hey");
});
