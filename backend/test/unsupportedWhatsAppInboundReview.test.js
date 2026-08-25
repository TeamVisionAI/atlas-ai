/**
 * BR-156 — Unsupported Meta WhatsApp inbound review recovery.
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

const {
  META_UNSUPPORTED_LEAD_ERROR_CODE,
  ORGANIZATION_CONNECTION_SOURCE,
  REVIEW_STATUS,
  AUDIT_EVENT_TYPES
} = require("../core/unsupportedWhatsAppInboundReview/constants");
const {
  isUnsupportedMetaLeadCandidateShape,
  shouldCreateUnsupportedInboundReview
} = require("../core/unsupportedWhatsAppInboundReview/detection");
const {
  maybeCreateUnsupportedInboundReview,
  markPendingReviewsRecoveredAutomatically,
  dismissUnsupportedInboundReview,
  confirmUnsupportedInboundReview,
  setUnsupportedWhatsAppInboundReviewRepositoryForTests,
  resetUnsupportedWhatsAppInboundReviewRepositoryForTests
} = require("../core/unsupportedWhatsAppInboundReview/unsupportedWhatsAppInboundReviewService");
const {
  createMemoryUnsupportedWhatsAppInboundReviewRepository
} = require("../repositories/unsupportedWhatsAppInboundReviewRepository");
const {
  evaluateAtlasInboundAutomationEligibility,
  VERIFIED_ATLAS_ELIGIBILITY_SOURCES
} = require("../core/atlasInboundAutomationEligibility");
const {
  createMemoryCampaignIntakeCodeRepository,
  INTAKE_CODE_STATUS
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
const auditEvents = [];

function unsupportedInbound(overrides = {}) {
  return {
    providerMessageId: overrides.providerMessageId || `wamid.unsupported.${randomUUID()}`,
    phone: "+13212174157",
    phoneE164: "+13212174157",
    contactName: "Zeus",
    messageType: "unsupported",
    body: "[unsupported message]",
    phoneNumberId: TV_PHONE_ID,
    wabaId: "1017891724443238",
    timestamp: new Date().toISOString(),
    ctwaReferral: null,
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

function unknownProspect(overrides = {}) {
  return {
    id: randomUUID(),
    phone: "+13212174157",
    name: "Zeus",
    organization_id: TEAM_VISION_ORG,
    owner_user_id: "owner-1",
    current_step: "NEW",
    source: WHATSAPP_SOURCE.UNKNOWN,
    entry_method: WHATSAPP_ENTRY_METHOD.UNATTRIBUTED,
    updated_at: new Date().toISOString(),
    ...overrides
  };
}

function seedCode(overrides = {}) {
  return {
    id: randomUUID(),
    organization_id: TEAM_VISION_ORG,
    owner_user_id: "owner-1",
    whatsapp_phone_number_id: TV_PHONE_ID,
    code: overrides.code || "TVR-0826-A7K4",
    campaign_name: "TV-RECRUIT-MIAMI-SP-0826",
    purpose: overrides.purpose || "RECRUITING",
    language: "es",
    status: overrides.status || INTAKE_CODE_STATUS.ACTIVE,
    created_by_user_id: "admin-1",
    created_at: new Date().toISOString(),
    retired_at: null,
    metadata: {},
    ...overrides
  };
}

function rvpAuth() {
  return {
    userId: "owner-1",
    role: "rvp",
    organizationId: TEAM_VISION_ORG,
    status: "active"
  };
}

function agentAuth(otherOwner = "someone-else") {
  return {
    userId: otherOwner,
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
  auditEvents.length = 0;
  resetUnsupportedWhatsAppInboundReviewRepositoryForTests();
  setCampaignIntakeAttributionServiceForTests(null);
});

test.afterEach(() => {
  resetUnsupportedWhatsAppInboundReviewRepositoryForTests();
  setCampaignIntakeAttributionServiceForTests(null);
});

test("unsupported 131060 org inbound is candidate; BR-142 stays NOT_ELIGIBLE", async () => {
  const inbound = unsupportedInbound();
  assert.equal(
    isUnsupportedMetaLeadCandidateShape({
      inbound,
      organizationSource: ORGANIZATION_CONNECTION_SOURCE,
      campaignIntakeMatch: null
    }),
    true
  );

  const eligibility = evaluateAtlasInboundAutomationEligibility({
    prospect: unknownProspect(),
    inbound
  });
  assert.equal(eligibility.eligible, false);
  assert.equal(eligibility.reason, "NOT_ELIGIBLE");
});

test("unsupported 131060 + unknown sender creates one recovery record and stays ineligible", async () => {
  const repo = createMemoryUnsupportedWhatsAppInboundReviewRepository();
  setUnsupportedWhatsAppInboundReviewRepositoryForTests(repo);

  const inbound = unsupportedInbound();
  const prospect = unknownProspect();
  const first = await maybeCreateUnsupportedInboundReview({
    inbound,
    organizationSource: ORGANIZATION_CONNECTION_SOURCE,
    organizationId: TEAM_VISION_ORG,
    prospect,
    campaignIntakeMatch: { matched: false },
    correlationId: "corr-1"
  });
  const second = await maybeCreateUnsupportedInboundReview({
    inbound,
    organizationSource: ORGANIZATION_CONNECTION_SOURCE,
    organizationId: TEAM_VISION_ORG,
    prospect,
    campaignIntakeMatch: { matched: false },
    correlationId: "corr-1"
  });

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.reason, "DUPLICATE_PROVIDER_MESSAGE");
  assert.equal(repo._rows.size, 1);
  assert.equal(first.review.status, REVIEW_STATUS.PENDING_REVIEW);
});

test("ordinary personal unknown text is not a recovery candidate", async () => {
  const inbound = {
    messageType: "text",
    body: "Hola",
    rawMessage: { type: "text", text: { body: "Hola" } }
  };

  assert.equal(
    isUnsupportedMetaLeadCandidateShape({
      inbound,
      organizationSource: "whatsapp_personal_connection",
      campaignIntakeMatch: null
    }),
    false
  );

  const decision = await shouldCreateUnsupportedInboundReview({
    inbound,
    organizationSource: "whatsapp_personal_connection",
    prospect: unknownProspect()
  });
  assert.equal(decision.create, false);
});

test("unsupported non-131060 keeps existing behavior (no candidate)", () => {
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
});

test("later valid TVR code auto-recovers pending review and uses campaign intake eligibility", async () => {
  await withTempWorkflowState(async () => {
    const repo = createMemoryUnsupportedWhatsAppInboundReviewRepository();
    setUnsupportedWhatsAppInboundReviewRepositoryForTests(repo);
    const intakeService = createCampaignIntakeAttributionService({
      repository: createMemoryCampaignIntakeCodeRepository({
        codes: { "TVR-0826-A7K4": seedCode() }
      })
    });
    setCampaignIntakeAttributionServiceForTests(intakeService);

    const prospect = unknownProspect();
    const providerMessageId = "wamid.unsupported.seed";
    await repo.insertReview({
      reviewType: "UNSUPPORTED_WHATSAPP_INBOUND_REVIEW",
      organizationId: TEAM_VISION_ORG,
      prospectId: prospect.id,
      senderPhoneE164: prospect.phone,
      providerMessageId,
      destinationPhoneNumberId: TV_PHONE_ID,
      metaErrorCode: META_UNSUPPORTED_LEAD_ERROR_CODE,
      receivedAt: new Date().toISOString(),
      status: REVIEW_STATUS.PENDING_REVIEW
    });

    const { savePersistedWorkflowState } = require("../core/workflowStateStore");
    await savePersistedWorkflowState(
      prospect.phone,
      { pendingUnsupportedMetaRecovery: true },
      { organizationId: TEAM_VISION_ORG, prospectId: prospect.id }
    );

    const match = await intakeService.lookupInboundMatch({
      organizationId: TEAM_VISION_ORG,
      whatsappPhoneNumberId: TV_PHONE_ID,
      messageBody: "¡Hola! TVR-0826-A7K4"
    });
    assert.equal(match.matched, true);

    const attribution = await intakeService.establishInboundAttribution({
      match,
      prospect,
      created: false,
      workflowState: { pendingUnsupportedMetaRecovery: true },
      providerMessageId: "wamid.followup.text",
      phoneNumberId: TV_PHONE_ID,
      organizationId: TEAM_VISION_ORG
    });
    assert.equal(attribution.recruitingEligible, true);

    const resolvedMatch = await intakeService.resolveInboundCampaignIntakeMatch({
      organizationId: TEAM_VISION_ORG,
      whatsappPhoneNumberId: TV_PHONE_ID,
      messageBody: "¡Hola! TVR-0826-A7K4",
      prospect,
      created: false,
      workflowState: { pendingUnsupportedMetaRecovery: true }
    });
    const eligibility = evaluateAtlasInboundAutomationEligibility({
      prospect,
      inbound: { campaignIntakeMatch: resolvedMatch, body: "Quiero más información" }
    });
    assert.equal(eligibility.eligible, true);
    assert.equal(eligibility.reason, "CAMPAIGN_INTAKE_CODE");

    const recovered = await markPendingReviewsRecoveredAutomatically({
      prospect,
      organizationId: TEAM_VISION_ORG,
      campaignCode: match.code
    });
    assert.equal(recovered.updated, 1);
  });
});

test("later valid TVI code uses IUL attribution path", async () => {
  await withTempWorkflowState(async () => {
    const { savePersistedWorkflowState } = require("../core/workflowStateStore");
    const intakeService = createCampaignIntakeAttributionService({
      repository: createMemoryCampaignIntakeCodeRepository({
        codes: {
          "TVI-0826-B7K4": seedCode({
            code: "TVI-0826-B7K4",
            purpose: "IUL",
            campaign_name: "TV-IUL-0826"
          })
        }
      })
    });

    const prospect = unknownProspect();
    await savePersistedWorkflowState(
      prospect.phone,
      { pendingUnsupportedMetaRecovery: true },
      { organizationId: TEAM_VISION_ORG, prospectId: prospect.id }
    );

    const match = await intakeService.lookupInboundMatch({
      organizationId: TEAM_VISION_ORG,
      whatsappPhoneNumberId: TV_PHONE_ID,
      messageBody: "TVI-0826-B7K4"
    });
    assert.equal(match.matched, true);

    const attribution = await intakeService.establishInboundAttribution({
      match,
      prospect,
      created: false,
      workflowState: { pendingUnsupportedMetaRecovery: true },
      providerMessageId: "wamid.followup.iul",
      phoneNumberId: TV_PHONE_ID,
      organizationId: TEAM_VISION_ORG
    });

    assert.equal(attribution.iulReviewEligible, true);
    assert.equal(attribution.recruitingEligible, false);
  });
});

test("invalid or inactive code remains unverified", async () => {
  const intakeService = createCampaignIntakeAttributionService({
    repository: createMemoryCampaignIntakeCodeRepository({
      codes: {
        "TVR-0826-RT01": seedCode({
          code: "TVR-0826-RT01",
          status: INTAKE_CODE_STATUS.RETIRED
        })
      }
    })
  });

  const lookup = await intakeService.lookupInboundMatch({
    organizationId: TEAM_VISION_ORG,
    whatsappPhoneNumberId: TV_PHONE_ID,
    messageBody: "TVR-0826-RT01"
  });
  assert.equal(lookup.matched, false);
  assert.equal(lookup.reason, "CODE_RETIRED");
});

test("tenant isolation on pending list and confirm", async () => {
  const repo = createMemoryUnsupportedWhatsAppInboundReviewRepository([
    {
      id: "review-org-a",
      review_type: "UNSUPPORTED_WHATSAPP_INBOUND_REVIEW",
      organization_id: TEAM_VISION_ORG,
      prospect_id: "p1",
      sender_phone_e164: "+13212174157",
      provider_message_id: "wamid.a",
      destination_phone_number_id: TV_PHONE_ID,
      meta_error_code: META_UNSUPPORTED_LEAD_ERROR_CODE,
      status: REVIEW_STATUS.PENDING_REVIEW,
      received_at: new Date().toISOString()
    },
    {
      id: "review-org-b",
      review_type: "UNSUPPORTED_WHATSAPP_INBOUND_REVIEW",
      organization_id: OTHER_ORG,
      prospect_id: "p2",
      sender_phone_e164: "+15555550100",
      provider_message_id: "wamid.b",
      destination_phone_number_id: TV_PHONE_ID,
      meta_error_code: META_UNSUPPORTED_LEAD_ERROR_CODE,
      status: REVIEW_STATUS.PENDING_REVIEW,
      received_at: new Date().toISOString()
    }
  ]);
  setUnsupportedWhatsAppInboundReviewRepositoryForTests(repo);

  const orgA = await repo.listPendingForOrganization({ organizationId: TEAM_VISION_ORG });
  assert.equal(orgA.length, 1);
  assert.equal(orgA[0].id, "review-org-a");

  const forbidden = await confirmUnsupportedInboundReview({
    reviewId: "review-org-b",
    organizationId: TEAM_VISION_ORG,
    authContext: rvpAuth(),
    dependencies: {
      findProspectInOrganization: async () => null
    }
  });
  assert.equal(forbidden.ok, false);
  assert.equal(forbidden.reason, "NOT_FOUND");
});

test("manual confirmation requires authorization", async () => {
  const repo = createMemoryUnsupportedWhatsAppInboundReviewRepository();
  setUnsupportedWhatsAppInboundReviewRepositoryForTests(repo);
  const prospect = unknownProspect({ owner_user_id: "owner-1" });
  const created = await repo.insertReview({
    reviewType: "UNSUPPORTED_WHATSAPP_INBOUND_REVIEW",
    organizationId: TEAM_VISION_ORG,
    prospectId: prospect.id,
    senderPhoneE164: prospect.phone,
    providerMessageId: "wamid.manual",
    destinationPhoneNumberId: TV_PHONE_ID,
    metaErrorCode: META_UNSUPPORTED_LEAD_ERROR_CODE,
    receivedAt: new Date().toISOString()
  });

  const forbidden = await confirmUnsupportedInboundReview({
    reviewId: created.row.id,
    organizationId: TEAM_VISION_ORG,
    authContext: agentAuth("other-agent"),
    dependencies: {
      findProspectInOrganization: async () => prospect
    }
  });
  assert.equal(forbidden.ok, false);
  assert.equal(forbidden.reason, "FORBIDDEN");
});

test("manual confirm with valid code establishes attribution; audit on confirm/dismiss/recover", async () => {
  await withTempWorkflowState(async () => {
    const { savePersistedWorkflowState } = require("../core/workflowStateStore");
    const repo = createMemoryUnsupportedWhatsAppInboundReviewRepository();
    setUnsupportedWhatsAppInboundReviewRepositoryForTests(repo);
    const intakeService = createCampaignIntakeAttributionService({
      repository: createMemoryCampaignIntakeCodeRepository({
        codes: { "TVR-0826-A7K4": seedCode() }
      })
    });

    const prospect = unknownProspect({ owner_user_id: "owner-1" });
    await savePersistedWorkflowState(
      prospect.phone,
      { pendingUnsupportedMetaRecovery: true },
      { organizationId: TEAM_VISION_ORG, prospectId: prospect.id }
    );
    const created = await repo.insertReview({
      reviewType: "UNSUPPORTED_WHATSAPP_INBOUND_REVIEW",
      organizationId: TEAM_VISION_ORG,
      prospectId: prospect.id,
      senderPhoneE164: prospect.phone,
      providerMessageId: "wamid.manual.confirm",
      destinationPhoneNumberId: TV_PHONE_ID,
      metaErrorCode: META_UNSUPPORTED_LEAD_ERROR_CODE,
      receivedAt: new Date().toISOString()
    });

    const workflowEventService = require("../services/workflowEventService");
    const originalInsert = workflowEventService.insertWorkflowEvent;
    workflowEventService.insertWorkflowEvent = async (event) => {
      auditEvents.push(event);
      return { success: true, event };
    };

    try {
      const confirmed = await confirmUnsupportedInboundReview({
        reviewId: created.row.id,
        organizationId: TEAM_VISION_ORG,
        authContext: rvpAuth(),
        campaignCode: "TVR-0826-A7K4",
        dependencies: {
          findProspectInOrganization: async () => prospect,
          campaignIntakeAttributionService: intakeService
        }
      });

      assert.equal(confirmed.ok, true);
      assert.equal(confirmed.review.status, REVIEW_STATUS.CONFIRMED_MANUAL);
      assert.equal(confirmed.attribution.recruitingEligible, true);
      assert.ok(
        auditEvents.some((event) => event.eventType === AUDIT_EVENT_TYPES.CONFIRMED)
      );

      const pendingAgain = await repo.insertReview({
        reviewType: "UNSUPPORTED_WHATSAPP_INBOUND_REVIEW",
        organizationId: TEAM_VISION_ORG,
        prospectId: prospect.id,
        senderPhoneE164: prospect.phone,
        providerMessageId: "wamid.manual.dismiss",
        destinationPhoneNumberId: TV_PHONE_ID,
        metaErrorCode: META_UNSUPPORTED_LEAD_ERROR_CODE,
        receivedAt: new Date().toISOString()
      });

      const dismissed = await dismissUnsupportedInboundReview({
        reviewId: pendingAgain.row.id,
        organizationId: TEAM_VISION_ORG,
        authContext: rvpAuth(),
        dependencies: {
          findProspectInOrganization: async () => prospect
        }
      });
      assert.equal(dismissed.ok, true);
      assert.equal(dismissed.review.status, REVIEW_STATUS.DISMISSED_REVIEWED);
      assert.ok(
        auditEvents.some((event) => event.eventType === AUDIT_EVENT_TYPES.DISMISSED)
      );
    } finally {
      workflowEventService.insertWorkflowEvent = originalInsert;
    }
  });
});

test("dismissed review stays silent on subsequent polls", async () => {
  const repo = createMemoryUnsupportedWhatsAppInboundReviewRepository();
  setUnsupportedWhatsAppInboundReviewRepositoryForTests(repo);
  const prospect = unknownProspect({ owner_user_id: "owner-1" });
  const created = await repo.insertReview({
    reviewType: "UNSUPPORTED_WHATSAPP_INBOUND_REVIEW",
    organizationId: TEAM_VISION_ORG,
    prospectId: prospect.id,
    senderPhoneE164: prospect.phone,
    providerMessageId: "wamid.dismissed",
    destinationPhoneNumberId: TV_PHONE_ID,
    metaErrorCode: META_UNSUPPORTED_LEAD_ERROR_CODE,
    receivedAt: new Date().toISOString()
  });

  await dismissUnsupportedInboundReview({
    reviewId: created.row.id,
    organizationId: TEAM_VISION_ORG,
    authContext: rvpAuth(),
    dependencies: {
      findProspectInOrganization: async () => prospect
    }
  });

  const pending = await repo.listPendingForOrganization({ organizationId: TEAM_VISION_ORG });
  assert.equal(pending.length, 0);
});

test("existing eligible prospect with unsupported message does not create review", async () => {
  await withTempWorkflowState(async () => {
    const { savePersistedWorkflowState } = require("../core/workflowStateStore");
    const prospect = unknownProspect();
    await savePersistedWorkflowState(
      prospect.phone,
      {
        atlasEligibilitySource: VERIFIED_ATLAS_ELIGIBILITY_SOURCES.CAMPAIGN_INTAKE_CODE,
        canonicalMilestone: "NEW_LEAD"
      },
      { organizationId: TEAM_VISION_ORG, prospectId: prospect.id }
    );

    const repo = createMemoryUnsupportedWhatsAppInboundReviewRepository();
    setUnsupportedWhatsAppInboundReviewRepositoryForTests(repo);

    const result = await maybeCreateUnsupportedInboundReview({
      inbound: unsupportedInbound(),
      organizationSource: ORGANIZATION_CONNECTION_SOURCE,
      organizationId: TEAM_VISION_ORG,
      prospect,
      campaignIntakeMatch: { matched: false }
    });

    assert.equal(result.created, false);
    assert.equal(result.reason, "ALREADY_ELIGIBLE");
    assert.equal(repo._rows.size, 0);
  });
});

test("pipeline unsupported org inbound creates review and skips auto reply", async () => {
  const repo = createMemoryUnsupportedWhatsAppInboundReviewRepository();
  setUnsupportedWhatsAppInboundReviewRepositoryForTests(repo);
  const claimStore = createMemoryWhatsAppInboundClaimStore();
  let hubCalled = false;

  const result = await processInboundWhatsAppMessage(unsupportedInbound(), {
    resolveWhatsAppInboundOrganizationId: async () => ({
      organizationId: TEAM_VISION_ORG,
      source: ORGANIZATION_CONNECTION_SOURCE
    }),
    claimWhatsAppInboundCorrelation: (input) => claimStore.claim(input),
    locateOrCreateWhatsAppProspect: async () => ({
      prospect: unknownProspect(),
      created: true,
      storagePhone: "+13212174157",
      organizationId: TEAM_VISION_ORG,
      qrAttribution: null,
      campaignIntakeMatch: null
    }),
    logConversation: async () => ({
      success: true,
      log: { id: randomUUID() }
    }),
    processConversationAfterInbound: async () => {
      hubCalled = true;
      return {
        success: true,
        replied: false,
        reason: "ATLAS_AUTOMATION_NOT_ELIGIBLE",
        eligibilityReason: "NOT_ELIGIBLE"
      };
    },
    campaignIntakeAttributionService: createCampaignIntakeAttributionService({
      repository: createMemoryCampaignIntakeCodeRepository({ codes: {} })
    })
  });

  assert.equal(result.success, true);
  assert.equal(hubCalled, true);
  assert.equal(repo._rows.size, 1);
});
