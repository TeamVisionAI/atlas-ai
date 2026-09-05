/**
 * BR-234 — Contact-only Meta 131060 operational review.
 * Not a promotion path. Not Recruit V2. Not an auto-reply path.
 */

require("dotenv").config({ path: require("node:path").join(__dirname, "../../.env") });

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("crypto");

const TEAM_VISION_ORG = "00000000-0000-4000-8000-000000000001";
const OTHER_ORG = "00000000-0000-4000-8000-000000000099";
const TV_PHONE_ID = "1213865645144311";
const CONTACT_PHONE = "+18492015192";

const {
  META_UNSUPPORTED_LEAD_ERROR_CODE,
  ORGANIZATION_CONNECTION_SOURCE,
  REVIEW_REASON,
  REVIEW_STATUS
} = require("../core/unsupportedWhatsAppInboundReview/constants");
const {
  isUnsupportedMetaLeadCandidateShape,
  shouldCreateUnsupportedInboundReview
} = require("../core/unsupportedWhatsAppInboundReview/detection");
const {
  maybeCreateUnsupportedInboundReview,
  listPendingReviewsForRequest,
  dismissUnsupportedInboundReview,
  confirmUnsupportedInboundReview,
  setUnsupportedWhatsAppInboundReviewRepositoryForTests,
  resetUnsupportedWhatsAppInboundReviewRepositoryForTests
} = require("../core/unsupportedWhatsAppInboundReview/unsupportedWhatsAppInboundReviewService");
const {
  createMemoryUnsupportedWhatsAppInboundReviewRepository
} = require("../repositories/unsupportedWhatsAppInboundReviewRepository");
const {
  createMemoryCampaignIntakeCodeRepository
} = require("../core/campaignIntakeCode/campaignIntakeCodeRepository");
const {
  createCampaignIntakeAttributionService,
  setCampaignIntakeAttributionServiceForTests
} = require("../core/campaignIntakeCode/campaignIntakeAttributionService");
const { processInboundWhatsAppMessage } = require("../core/whatsappInboundPipeline");
const {
  createMemoryWhatsAppInboundClaimStore
} = require("../core/whatsappInboundClaim");
const { WHATSAPP_ENTRY_METHOD, WHATSAPP_SOURCE } = require("../core/whatsappConstants");

const STATE_FILE = path.join(__dirname, "../data/workflowState.json");

function unsupportedInbound(overrides = {}) {
  return {
    providerMessageId: overrides.providerMessageId || `wamid.contact-only.${randomUUID()}`,
    phone: CONTACT_PHONE,
    phoneE164: CONTACT_PHONE,
    contactName: "Ad Lead",
    messageType: "unsupported",
    body: "[unsupported message]",
    phoneNumberId: TV_PHONE_ID,
    wabaId: "1017891724443238",
    timestamp: "2026-09-05T17:14:32.000Z",
    ctwaReferral: null,
    referral: null,
    rawMessage: {
      type: "unsupported",
      errors: [
        {
          code: META_UNSUPPORTED_LEAD_ERROR_CODE,
          title: "This message is unavailable."
        }
      ]
    },
    rawValue: {
      metadata: {
        phone_number_id: TV_PHONE_ID,
        display_phone_number: "13059997338"
      }
    },
    ...overrides
  };
}

function knownProspect(overrides = {}) {
  return {
    id: randomUUID(),
    phone: CONTACT_PHONE,
    name: "Known Prospect",
    organization_id: TEAM_VISION_ORG,
    owner_user_id: "owner-1",
    current_step: "NEW",
    source: WHATSAPP_SOURCE.UNKNOWN,
    entry_method: WHATSAPP_ENTRY_METHOD.UNATTRIBUTED,
    updated_at: new Date().toISOString(),
    ...overrides
  };
}

function rvpAuth(organizationId = TEAM_VISION_ORG) {
  return {
    userId: "owner-1",
    role: "rvp",
    organizationId,
    status: "active"
  };
}

function agentAuth() {
  return {
    userId: "agent-9",
    role: "agent",
    organizationId: TEAM_VISION_ORG,
    status: "active"
  };
}

async function withTempWorkflowState(run) {
  const previous = fs.existsSync(STATE_FILE) ? fs.readFileSync(STATE_FILE, "utf8") : null;
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, "{}");
  try {
    return await run();
  } finally {
    if (previous == null) {
      try {
        fs.unlinkSync(STATE_FILE);
      } catch {
        /* ignore */
      }
    } else {
      fs.writeFileSync(STATE_FILE, previous);
    }
  }
}

test.beforeEach(() => {
  resetUnsupportedWhatsAppInboundReviewRepositoryForTests();
  setCampaignIntakeAttributionServiceForTests(null);
});

test.afterEach(() => {
  resetUnsupportedWhatsAppInboundReviewRepositoryForTests();
  setCampaignIntakeAttributionServiceForTests(null);
});

test("A/B/H: 131060 + known org/contact + no prospect creates one nullable-prospect review", async () => {
  const repo = createMemoryUnsupportedWhatsAppInboundReviewRepository();
  setUnsupportedWhatsAppInboundReviewRepositoryForTests(repo);
  const inbound = unsupportedInbound({
    providerMessageId: "wamid.HBgLMTg0OTIwMTUxOTIVAgASGBQzQUFBNDU0Q0EwQTYzOEYyMjlEOQA="
  });

  const first = await maybeCreateUnsupportedInboundReview({
    inbound,
    organizationSource: ORGANIZATION_CONNECTION_SOURCE,
    organizationId: TEAM_VISION_ORG,
    prospect: null,
    campaignIntakeMatch: { matched: false, reason: "NO_TOKEN" }
  });
  const second = await maybeCreateUnsupportedInboundReview({
    inbound,
    organizationSource: ORGANIZATION_CONNECTION_SOURCE,
    organizationId: TEAM_VISION_ORG,
    prospect: null,
    campaignIntakeMatch: { matched: false, reason: "NO_TOKEN" }
  });

  assert.equal(first.created, true);
  assert.equal(first.review.prospectId, null);
  assert.equal(first.review.organizationId, TEAM_VISION_ORG);
  assert.equal(first.review.senderPhoneE164, CONTACT_PHONE);
  assert.equal(first.review.destinationPhoneNumberId, TV_PHONE_ID);
  assert.equal(first.review.providerMessageId, inbound.providerMessageId);
  assert.equal(first.review.metaErrorCode, META_UNSUPPORTED_LEAD_ERROR_CODE);
  assert.equal(first.review.status, REVIEW_STATUS.PENDING_REVIEW);
  assert.equal(first.review.receivedAt, inbound.timestamp);
  assert.equal(first.review.metadata.messageType, "unsupported");
  assert.equal(
    first.review.metadata.reviewReason,
    REVIEW_REASON.META_UNSUPPORTED_131060_CONTACT_ONLY
  );
  assert.equal(first.review.metadata.contactOnly, true);
  assert.equal(first.review.metadata.ctwa_clid, undefined);
  assert.equal(first.review.metadata.referral, undefined);
  assert.equal(first.review.metadata.intakeCode, undefined);
  assert.equal(second.created, false);
  assert.equal(second.reason, "DUPLICATE_PROVIDER_MESSAGE");
  assert.equal(repo._rows.size, 1);
});

test("C/D/E/F/G: contact-only pipeline creates review without prospect, Recruit V2, send, or invented attribution", async () => {
  const repo = createMemoryUnsupportedWhatsAppInboundReviewRepository();
  setUnsupportedWhatsAppInboundReviewRepositoryForTests(repo);
  const claimStore = createMemoryWhatsAppInboundClaimStore();
  let hubCalled = false;
  let outboundSendCalled = false;
  let locateCalls = 0;
  const logs = [];

  const result = await processInboundWhatsAppMessage(unsupportedInbound(), {
    resolveWhatsAppInboundOrganizationId: async () => ({
      organizationId: TEAM_VISION_ORG,
      source: ORGANIZATION_CONNECTION_SOURCE
    }),
    claimWhatsAppInboundCorrelation: (input) => claimStore.claim(input),
    locateOrCreateWhatsAppProspect: async () => {
      locateCalls += 1;
      return {
        prospect: null,
        created: false,
        storagePhone: CONTACT_PHONE,
        organizationId: TEAM_VISION_ORG,
        contactOnly: true,
        promotionDeniedReason: "NO_VALID_PROMOTION_SIGNAL",
        qrAttribution: null,
        campaignIntakeMatch: { matched: false, reason: "NO_TOKEN" }
      };
    },
    logConversation: async (payload) => {
      logs.push(payload);
      return { success: true, log: { id: randomUUID() } };
    },
    processConversationAfterInbound: async () => {
      hubCalled = true;
      return { success: true, replied: true };
    },
    sendWhatsAppMessage: async () => {
      outboundSendCalled = true;
      return { success: true };
    },
    campaignIntakeAttributionService: createCampaignIntakeAttributionService({
      repository: createMemoryCampaignIntakeCodeRepository({ codes: {} })
    })
  });

  const review = [...repo._rows.values()][0];

  assert.equal(result.success, true);
  assert.equal(result.contactOnly, true);
  assert.equal(result.created, false);
  assert.equal(result.prospectId, null);
  assert.equal(result.conversation?.replied, false);
  assert.equal(hubCalled, false);
  assert.equal(outboundSendCalled, false);
  assert.equal(locateCalls, 1);
  assert.equal(repo._rows.size, 1);
  assert.equal(review.prospectId, null);
  assert.equal(review.metadata.contactOnly, true);
  assert.equal(review.metadata.reviewReason, REVIEW_REASON.META_UNSUPPORTED_131060_CONTACT_ONLY);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].message, "[unsupported message]");
  assert.doesNotMatch(JSON.stringify(review.metadata), /TVR-|ctwa_clid|referral/i);
});

test("I: contact-only review is tenant-isolated", async () => {
  const repo = createMemoryUnsupportedWhatsAppInboundReviewRepository();
  setUnsupportedWhatsAppInboundReviewRepositoryForTests(repo);

  const created = await maybeCreateUnsupportedInboundReview({
    inbound: unsupportedInbound({ providerMessageId: "wamid.tv.contact-only" }),
    organizationSource: ORGANIZATION_CONNECTION_SOURCE,
    organizationId: TEAM_VISION_ORG,
    prospect: null,
    campaignIntakeMatch: { matched: false }
  });

  const visionPending = await listPendingReviewsForRequest({
    organizationId: TEAM_VISION_ORG,
    authContext: rvpAuth(TEAM_VISION_ORG)
  });
  const otherPending = await listPendingReviewsForRequest({
    organizationId: OTHER_ORG,
    authContext: rvpAuth(OTHER_ORG)
  });

  assert.equal(created.created, true);
  assert.equal(visionPending.length, 1);
  assert.equal(visionPending[0].organizationId, TEAM_VISION_ORG);
  assert.equal(otherPending.length, 0);

  const crossTenant = await dismissUnsupportedInboundReview({
    reviewId: created.review.id,
    organizationId: OTHER_ORG,
    authContext: rvpAuth(OTHER_ORG)
  });
  assert.equal(crossTenant.ok, false);
  assert.equal(crossTenant.reason, "NOT_FOUND");
});

test("J: existing prospect-backed BR-156 review metadata stays unchanged", async () => {
  const repo = createMemoryUnsupportedWhatsAppInboundReviewRepository();
  setUnsupportedWhatsAppInboundReviewRepositoryForTests(repo);
  const prospect = knownProspect();

  const result = await maybeCreateUnsupportedInboundReview({
    inbound: unsupportedInbound({ providerMessageId: "wamid.prospect.backed" }),
    organizationSource: ORGANIZATION_CONNECTION_SOURCE,
    organizationId: TEAM_VISION_ORG,
    prospect,
    campaignIntakeMatch: { matched: false }
  });

  assert.equal(result.created, true);
  assert.equal(result.review.prospectId, prospect.id);
  assert.deepEqual(result.review.metadata, { messageType: "unsupported" });
  assert.equal(result.review.metadata.contactOnly, undefined);
  assert.equal(result.review.metadata.reviewReason, undefined);
});

test("K: non-131060 unsupported contact-only stays out of the queue", async () => {
  const repo = createMemoryUnsupportedWhatsAppInboundReviewRepository();
  setUnsupportedWhatsAppInboundReviewRepositoryForTests(repo);
  const inbound = unsupportedInbound({
    rawMessage: {
      type: "unsupported",
      errors: [{ code: 131051, title: "Message type unknown" }]
    }
  });

  assert.equal(
    isUnsupportedMetaLeadCandidateShape({
      inbound,
      organizationSource: ORGANIZATION_CONNECTION_SOURCE
    }),
    false
  );

  const result = await maybeCreateUnsupportedInboundReview({
    inbound,
    organizationSource: ORGANIZATION_CONNECTION_SOURCE,
    organizationId: TEAM_VISION_ORG,
    prospect: null,
    campaignIntakeMatch: { matched: false }
  });

  assert.equal(result.created, false);
  assert.equal(result.reason, "NOT_CANDIDATE");
  assert.equal(repo._rows.size, 0);
});

test("L: personal/unknown inbound still fail-closed", async () => {
  const repo = createMemoryUnsupportedWhatsAppInboundReviewRepository();
  setUnsupportedWhatsAppInboundReviewRepositoryForTests(repo);
  const inbound = unsupportedInbound();

  const personal = await maybeCreateUnsupportedInboundReview({
    inbound,
    organizationSource: "whatsapp_personal_connection",
    organizationId: TEAM_VISION_ORG,
    prospect: null
  });
  const unknown = await shouldCreateUnsupportedInboundReview({
    inbound: { messageType: "text", body: "Hola", rawMessage: { type: "text" } },
    organizationSource: ORGANIZATION_CONNECTION_SOURCE,
    prospect: null
  });

  assert.equal(personal.created, false);
  assert.equal(personal.reason, "NOT_CANDIDATE");
  assert.equal(unknown.create, false);
  assert.equal(unknown.reason, "NOT_CANDIDATE");
  assert.equal(repo._rows.size, 0);
});

test("contact-only confirm is rejected and does not invent intake or a prospect", async () => {
  const repo = createMemoryUnsupportedWhatsAppInboundReviewRepository();
  setUnsupportedWhatsAppInboundReviewRepositoryForTests(repo);
  let intakeCalled = false;
  let prospectLookupCalled = false;

  const created = await maybeCreateUnsupportedInboundReview({
    inbound: unsupportedInbound({ providerMessageId: "wamid.confirm.blocked" }),
    organizationSource: ORGANIZATION_CONNECTION_SOURCE,
    organizationId: TEAM_VISION_ORG,
    prospect: null,
    campaignIntakeMatch: { matched: false }
  });

  const confirmed = await confirmUnsupportedInboundReview({
    reviewId: created.review.id,
    organizationId: TEAM_VISION_ORG,
    authContext: rvpAuth(),
    campaignCode: "TVR-0903-87NP",
    dependencies: {
      findProspectInOrganization: async () => {
        prospectLookupCalled = true;
        return knownProspect();
      },
      campaignIntakeAttributionService: {
        lookupInboundMatch: async () => {
          intakeCalled = true;
          return { matched: true, code: "TVR-0903-87NP" };
        }
      }
    }
  });

  assert.equal(confirmed.ok, false);
  assert.equal(confirmed.reason, "CONTACT_ONLY_NO_PROSPECT");
  assert.equal(intakeCalled, false);
  assert.equal(prospectLookupCalled, false);
  assert.equal(created.review.prospectId, null);
});

test("contact-only dismiss is allowed for same-org RVP and forbidden for agents", async () => {
  const repo = createMemoryUnsupportedWhatsAppInboundReviewRepository();
  setUnsupportedWhatsAppInboundReviewRepositoryForTests(repo);

  const created = await maybeCreateUnsupportedInboundReview({
    inbound: unsupportedInbound({ providerMessageId: "wamid.dismiss.contact-only" }),
    organizationSource: ORGANIZATION_CONNECTION_SOURCE,
    organizationId: TEAM_VISION_ORG,
    prospect: null,
    campaignIntakeMatch: { matched: false }
  });

  const agentDenied = await dismissUnsupportedInboundReview({
    reviewId: created.review.id,
    organizationId: TEAM_VISION_ORG,
    authContext: agentAuth(),
    dependencies: {
      findProspectInOrganization: async () => {
        throw new Error("contact-only dismiss must not require a prospect");
      }
    }
  });
  assert.equal(agentDenied.ok, false);
  assert.equal(agentDenied.reason, "FORBIDDEN");

  const dismissed = await dismissUnsupportedInboundReview({
    reviewId: created.review.id,
    organizationId: TEAM_VISION_ORG,
    authContext: rvpAuth(),
    dependencies: {
      findProspectInOrganization: async () => {
        throw new Error("contact-only dismiss must not require a prospect");
      }
    }
  });
  assert.equal(dismissed.ok, true);
  assert.equal(dismissed.review.status, REVIEW_STATUS.DISMISSED_REVIEWED);
});

test("contact-only 131060 does not write pendingUnsupportedMetaRecovery workflow state", async () => {
  await withTempWorkflowState(async () => {
    const repo = createMemoryUnsupportedWhatsAppInboundReviewRepository();
    setUnsupportedWhatsAppInboundReviewRepositoryForTests(repo);

    await maybeCreateUnsupportedInboundReview({
      inbound: unsupportedInbound({ providerMessageId: "wamid.no.workflow" }),
      organizationSource: ORGANIZATION_CONNECTION_SOURCE,
      organizationId: TEAM_VISION_ORG,
      prospect: null,
      campaignIntakeMatch: { matched: false }
    });

    const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    assert.deepEqual(state, {});
  });
});
