/**
 * BR-193 — Meta Ad Destination fallback when Meta omits CTWA metadata.
 * Ordinary personal inbound stays fail-closed unless the connection is
 * explicitly marked as a Meta ad destination.
 */

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  evaluateMetaAdDestinationFallback,
  AD_DESTINATION_FALLBACK_REASON
} = require("../core/metaAdDestinationFallback");
const {
  evaluateAtlasInboundAutomationEligibility,
  resolveVerifiedAtlasEligibilitySource,
  VERIFIED_ATLAS_ELIGIBILITY_SOURCES
} = require("../core/atlasInboundAutomationEligibility");
const { evaluateProspectPromotion } = require("../core/prospectPromotionEligibility");
const { resolveCreateSourceFields } = require("../core/whatsappProspectResolver");
const { resolveNewLeadAssignment, ASSIGNMENT_SOURCES } = require("../core/newLeadAssignmentEngine");
const { resolveWhatsAppSendCredentials } = require("../core/whatsappSendCredentials");
const { WHATSAPP_ENTRY_METHOD, WHATSAPP_SOURCE } = require("../core/whatsappConstants");
const { toSafeConnection } = require("../repositories/metaConnectionRepositoryInterface");

const ORG = "00000000-0000-4000-8000-000000000001";
const OTHER_ORG = "af8fb707-f26c-4152-ad77-2d079d30bc8a";
const MISLEISYS = "d8d75c0e-d93e-42c9-950e-004fbfabdc8d";
const NIOVEL = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const AD_PHONE_ID = "336196332914297";
const OTHER_PHONE_ID = "999999999999999";
const GREETING = "Hola. ¿Puedes darme más información sobre esto?";

function adDestinationConnection(overrides = {}) {
  return {
    status: "connected",
    phone_number_id: AD_PHONE_ID,
    organization_id: ORG,
    user_id: MISLEISYS,
    metaAdDestinationAutomationEnabled: true,
    ...overrides
  };
}

function unknownProspect(overrides = {}) {
  return {
    id: "p-unknown",
    phone: "+17862417477",
    organization_id: ORG,
    current_step: "NEW",
    source: WHATSAPP_SOURCE.UNKNOWN,
    entry_method: WHATSAPP_ENTRY_METHOD.UNATTRIBUTED,
    ...overrides
  };
}

test("real CTWA metadata is still eligible without the ad-destination setting", () => {
  const promotion = evaluateProspectPromotion({
    ctwaReferral: { source_type: "ad", ctwa_clid: "clid-real" },
    whatsappConnection: adDestinationConnection({
      metaAdDestinationAutomationEnabled: false
    }),
    inboundPhoneNumberId: AD_PHONE_ID,
    expectedOrganizationId: ORG
  });
  assert.equal(promotion.promote, true);
  assert.equal(promotion.reason, "CTWA_REFERRAL");

  const eligibility = evaluateAtlasInboundAutomationEligibility({
    prospect: unknownProspect(),
    inbound: {
      text: GREETING,
      ctwaReferral: { source_type: "ad", ctwa_clid: "clid-real" },
      phoneNumberId: AD_PHONE_ID,
      whatsappConnection: adDestinationConnection({
        metaAdDestinationAutomationEnabled: false
      })
    }
  });
  assert.equal(eligibility.eligible, true);
  assert.equal(eligibility.reason, "CTWA_REFERRAL");
});

test("no CTWA metadata + ad-destination setting ON promotes and is eligible", () => {
  const connection = adDestinationConnection();
  const promotion = evaluateProspectPromotion({
    existingProspect: null,
    ctwaReferral: null,
    whatsappConnection: connection,
    inboundPhoneNumberId: AD_PHONE_ID,
    expectedOrganizationId: ORG,
    inbound: { text: GREETING, from_user_id: "17862417477" }
  });
  assert.equal(promotion.promote, true);
  assert.equal(promotion.reason, AD_DESTINATION_FALLBACK_REASON);

  const eligibility = evaluateAtlasInboundAutomationEligibility({
    prospect: unknownProspect(),
    inbound: {
      text: GREETING,
      from_user_id: "17862417477",
      phoneNumberId: AD_PHONE_ID,
      organizationId: ORG,
      whatsappConnection: connection
    }
  });
  assert.equal(eligibility.eligible, true);
  assert.equal(eligibility.reason, AD_DESTINATION_FALLBACK_REASON);
});

test("no CTWA metadata + setting OFF stays silent and unpromoted", () => {
  const connection = adDestinationConnection({
    metaAdDestinationAutomationEnabled: false
  });
  const promotion = evaluateProspectPromotion({
    whatsappConnection: connection,
    inboundPhoneNumberId: AD_PHONE_ID,
    expectedOrganizationId: ORG,
    inbound: { text: GREETING }
  });
  assert.equal(promotion.promote, false);
  assert.equal(promotion.reason, "NO_VALID_PROMOTION_SIGNAL");

  const eligibility = evaluateAtlasInboundAutomationEligibility({
    prospect: unknownProspect(),
    inbound: {
      text: GREETING,
      phoneNumberId: AD_PHONE_ID,
      organizationId: ORG,
      whatsappConnection: connection
    }
  });
  assert.equal(eligibility.eligible, false);
  assert.equal(eligibility.reason, "NOT_ELIGIBLE");
});

test("unrelated personal connection stays silent even if another number is an ad destination", () => {
  const otherConnection = adDestinationConnection({
    phone_number_id: OTHER_PHONE_ID,
    user_id: NIOVEL
  });
  const promotion = evaluateProspectPromotion({
    whatsappConnection: otherConnection,
    inboundPhoneNumberId: AD_PHONE_ID,
    expectedOrganizationId: ORG,
    inbound: { text: GREETING, phoneNumberId: AD_PHONE_ID }
  });
  assert.equal(promotion.promote, false);
  assert.equal(promotion.reason, "NO_VALID_PROMOTION_SIGNAL");
});

test("disconnected ad-destination connection cannot promote", () => {
  const promotion = evaluateProspectPromotion({
    whatsappConnection: adDestinationConnection({ status: "disconnected" }),
    inboundPhoneNumberId: AD_PHONE_ID,
    expectedOrganizationId: ORG
  });
  assert.equal(promotion.promote, false);
});

test("connection owner becomes prospect owner and does not fall back to RVP", async () => {
  const fields = resolveCreateSourceFields(null, {
    whatsappConnection: adDestinationConnection(),
    inboundPhoneNumberId: AD_PHONE_ID,
    expectedOrganizationId: ORG,
    whatsappConnectionOwnerUserId: MISLEISYS,
    whatsappConnectionSource: "whatsapp_personal_connection"
  });
  assert.equal(fields.entryMethod, WHATSAPP_ENTRY_METHOD.META_AD_DESTINATION);
  assert.equal(fields.source, WHATSAPP_SOURCE.META_AD_DESTINATION);
  assert.equal(fields.whatsappOwnerUserId, MISLEISYS);

  const assignment = await resolveNewLeadAssignment({
    organizationId: ORG,
    whatsappOwnerUserId: fields.whatsappOwnerUserId,
    deps: {
      findUserById: async (id) =>
        id === MISLEISYS
          ? {
              id: MISLEISYS,
              organization_id: ORG,
              role: "agent",
              status: "active"
            }
          : id === NIOVEL
            ? {
                id: NIOVEL,
                organization_id: ORG,
                role: "rvp",
                status: "active"
              }
            : null,
      findActiveOrganizationRvp: async () => ({
        id: NIOVEL,
        organization_id: ORG,
        role: "rvp",
        status: "active"
      }),
      organizationSettings: {
        scheduling: { defaultRecruiterUserId: NIOVEL }
      }
    }
  });
  assert.equal(assignment.ownerUserId, MISLEISYS);
  assert.equal(assignment.assignmentSource, ASSIGNMENT_SOURCES.PERSONAL_WHATSAPP);
});

test("ineligible connection owner stays unassigned and does not fall back to RVP", async () => {
  const assignment = await resolveNewLeadAssignment({
    organizationId: ORG,
    whatsappOwnerUserId: MISLEISYS,
    deps: {
      findUserById: async () => ({
        id: MISLEISYS,
        organization_id: ORG,
        role: "agent",
        status: "inactive"
      }),
      findActiveOrganizationRvp: async () => ({
        id: NIOVEL,
        organization_id: ORG,
        role: "rvp",
        status: "active"
      }),
      organizationSettings: {
        scheduling: { defaultRecruiterUserId: NIOVEL }
      }
    }
  });
  assert.equal(assignment.ownerUserId, null);
  assert.equal(assignment.assignmentSource, ASSIGNMENT_SOURCES.UNASSIGNED);
});

test("outbound uses the personal connection token and phone_number_id, not org/RVP", async () => {
  const personalToken = "personal-misleisys-token";
  const credentials = await resolveWhatsAppSendCredentials(ORG, {
    phoneNumberId: AD_PHONE_ID,
    connectionRepository: {
      async findConnectionByPhoneNumberId(phoneNumberId) {
        assert.equal(String(phoneNumberId), AD_PHONE_ID);
        return {
          organization_id: ORG,
          user_id: MISLEISYS,
          status: "connected",
          phone_number_id: AD_PHONE_ID,
          waba_id: "307386692463356",
          access_token_encrypted: "enc:v1:dummy",
          personalAccessToken: personalToken
        };
      },
      async getConnection() {
        throw new Error("org getConnection must not run for inbound personal asset");
      },
      async getDecryptedAccessToken(organizationId, userId) {
        assert.equal(organizationId, ORG);
        assert.equal(userId, MISLEISYS);
        return personalToken;
      }
    }
  });
  assert.equal(credentials.accessToken, personalToken);
  assert.equal(credentials.phoneNumberId, AD_PHONE_ID);
  assert.equal(credentials.source, "embedded_signup");
});

test("cross-tenant connection cannot promote", () => {
  const promotion = evaluateProspectPromotion({
    whatsappConnection: adDestinationConnection({ organization_id: OTHER_ORG }),
    inboundPhoneNumberId: AD_PHONE_ID,
    expectedOrganizationId: ORG,
    inbound: { text: GREETING, organizationId: ORG }
  });
  assert.equal(promotion.promote, false);
  assert.equal(
    evaluateMetaAdDestinationFallback({
      whatsappConnection: adDestinationConnection({ organization_id: OTHER_ORG }),
      inboundPhoneNumberId: AD_PHONE_ID,
      expectedOrganizationId: ORG
    }).reason,
    "AD_DESTINATION_TENANT_MISMATCH"
  );
});

test("greeting text alone remains insufficient", () => {
  const promotion = evaluateProspectPromotion({
    inbound: { text: GREETING }
  });
  assert.equal(promotion.promote, false);

  const eligibility = evaluateAtlasInboundAutomationEligibility({
    prospect: unknownProspect(),
    inbound: { text: GREETING }
  });
  assert.equal(eligibility.eligible, false);
});

test("from_user_id alone remains insufficient", () => {
  const promotion = evaluateProspectPromotion({
    inbound: { from_user_id: "17862417477", text: GREETING },
    whatsappConnectionSource: "whatsapp_personal_connection"
  });
  assert.equal(promotion.promote, false);

  const eligibility = evaluateAtlasInboundAutomationEligibility({
    prospect: unknownProspect(),
    inbound: {
      from_user_id: "17862417477",
      text: GREETING,
      whatsappConnectionSource: "whatsapp_personal_connection"
    }
  });
  assert.equal(eligibility.eligible, false);
  assert.equal(eligibility.reason, "NOT_ELIGIBLE");
});

test("personal connection without the setting is still not a verified eligibility source", () => {
  assert.equal(
    resolveVerifiedAtlasEligibilitySource({
      whatsappConnectionSource: "whatsapp_personal_connection"
    }),
    null
  );
  assert.equal(
    resolveVerifiedAtlasEligibilitySource({
      whatsappConnection: adDestinationConnection(),
      inboundPhoneNumberId: AD_PHONE_ID,
      expectedOrganizationId: ORG
    }),
    VERIFIED_ATLAS_ELIGIBILITY_SOURCES.META_AD_DESTINATION
  );
});

test("stored META_AD_DESTINATION continuation keeps the fallback eligibility reason", () => {
  const result = evaluateAtlasInboundAutomationEligibility({
    prospect: unknownProspect({
      source: WHATSAPP_SOURCE.META_AD_DESTINATION,
      entry_method: WHATSAPP_ENTRY_METHOD.META_AD_DESTINATION,
      updated_at: new Date().toISOString()
    }),
    inbound: { text: "Sí" },
    workflowState: {
      atlasEligibilitySource: VERIFIED_ATLAS_ELIGIBILITY_SOURCES.META_AD_DESTINATION,
      canonicalMilestone: "NEW_LEAD"
    }
  });
  assert.equal(result.eligible, true);
  assert.equal(result.reason, AD_DESTINATION_FALLBACK_REASON);
});

test("safe connection exposes the setting as false by default", () => {
  const safe = toSafeConnection({
    organization_id: ORG,
    user_id: MISLEISYS,
    status: "connected",
    phone_number_id: AD_PHONE_ID
  });
  assert.equal(safe.metaAdDestinationAutomationEnabled, false);
});

test("migration defaults existing connections to false", () => {
  const sql = fs.readFileSync(
    path.join(__dirname, "../database/migrations/069_br193_meta_ad_destination.sql"),
    "utf8"
  );
  assert.match(sql, /meta_ad_destination_automation_enabled BOOLEAN NOT NULL DEFAULT false/);
  assert.match(sql, /SET meta_ad_destination_automation_enabled = false/);
});
