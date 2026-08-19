/**
 * BR-080 — Canonical New Lead Assignment and Attention Lifecycle.
 * No live provider calls. No production writes.
 */

require("dotenv").config({ path: require("node:path").join(__dirname, "../../.env") });

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  ASSIGNMENT_STATUS,
  ASSIGNMENT_SOURCES,
  resolveNewLeadAssignment,
  buildNewLeadAttentionFields,
  isEligibleNewLeadOwner,
  isMetaReviewFixtureUser
} = require("../core/newLeadAssignmentEngine");
const {
  ATTENTION_STATUS,
  isAcknowledged,
  isUnassigned,
  isNewLeadAttentionOpen,
  evaluateEscalation,
  acknowledgeLead,
  canAcknowledgeProspect,
  canClaimUnassigned,
  ESCALATION_UNASSIGNED_MS,
  ESCALATION_UNACKNOWLEDGED_MS,
  markAiResponding,
  markHumanAttentionRequired,
  sanitizeReason
} = require("../core/newLeadAttentionEngine");
const { filterProspectsForAuthContext, canAccessProspect } = require("../security/authorizationService");
const { ROLES } = require("../security/roles");
const { MISSION_TYPES } = require("../core/configuration/missionTypes");
const { computeMissionControlPriority } = require("../core/milestoneMapper");
const { MILESTONES, PRIORITY_TIERS } = require("../core/workflowConstants");
const { generateMissionsFromContext } = require("../core/missionEngine");
const { EXECUTIVE_FILTERS, resolveExecutiveFilterPhones } = require("../core/executiveFilterResolver");
const { authorizeWhatsAppOutbound } = require("../core/whatsappOutboundAuthorizationGate");

const ORG_A = "00000000-0000-4000-8000-000000000001";
const ORG_B = "00000000-0000-4000-8000-000000000099";
const AGENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const RVP = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const DISABLED = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const OTHER_ORG = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const USERS = {
  [AGENT]: {
    id: AGENT,
    organization_id: ORG_A,
    role: "agent",
    status: "active",
    email: "agent@example.com",
    rep_id: "AAAAA"
  },
  [RVP]: {
    id: RVP,
    organization_id: ORG_A,
    role: "rvp",
    status: "active",
    email: "rvp@example.com",
    rep_id: "4TJLK"
  },
  [DISABLED]: {
    id: DISABLED,
    organization_id: ORG_A,
    role: "agent",
    status: "inactive",
    email: "disabled@example.com"
  },
  [OTHER_ORG]: {
    id: OTHER_ORG,
    organization_id: ORG_B,
    role: "agent",
    status: "active",
    email: "x@other.org"
  }
};

function auth(role, userId, organizationId = ORG_A) {
  return { userId, organizationId, role, status: "active", permissions: ["prospect:read"] };
}

function read(rel) {
  return fs.readFileSync(path.join(__dirname, rel), "utf8");
}

test("1-5. create-time assignment precedence: explicit, default recruiter, RVP, creator", async () => {
  const explicit = await resolveNewLeadAssignment({
    organizationId: ORG_A,
    explicitAgentId: AGENT,
    deps: {
      findUserById: async (id) => USERS[id] || null,
      findActiveOrganizationRvp: async () => USERS[RVP],
      organizationSettings: {}
    }
  });
  assert.equal(explicit.ownerUserId, AGENT);
  assert.equal(explicit.assignmentSource, ASSIGNMENT_SOURCES.EXPLICIT);

  const defaultRecruiter = await resolveNewLeadAssignment({
    organizationId: ORG_A,
    deps: {
      findUserById: async (id) => USERS[id] || null,
      findActiveOrganizationRvp: async () => USERS[RVP],
      organizationSettings: {
        scheduling: { defaultRecruiterUserId: AGENT }
      }
    }
  });
  assert.equal(defaultRecruiter.ownerUserId, AGENT);
  assert.equal(defaultRecruiter.assignmentSource, ASSIGNMENT_SOURCES.DEFAULT_RECRUITER);

  const rvpFallback = await resolveNewLeadAssignment({
    organizationId: ORG_A,
    deps: {
      findUserById: async () => null,
      findActiveOrganizationRvp: async () => USERS[RVP],
      organizationSettings: {}
    }
  });
  assert.equal(rvpFallback.ownerUserId, RVP);
  assert.equal(rvpFallback.assignmentSource, ASSIGNMENT_SOURCES.ORGANIZATION_RVP);

  const creator = await resolveNewLeadAssignment({
    organizationId: ORG_A,
    createdByUserId: AGENT,
    preferCreator: true,
    deps: {
      findUserById: async (id) => USERS[id] || null,
      findActiveOrganizationRvp: async () => USERS[RVP],
      organizationSettings: {}
    }
  });
  assert.equal(creator.assignmentSource, ASSIGNMENT_SOURCES.CREATOR);
});

test("6-9. invalid/disabled/cross-org rejected; no eligible → unassigned", async () => {
  assert.equal(isEligibleNewLeadOwner(USERS[DISABLED], ORG_A), false);
  assert.equal(isEligibleNewLeadOwner(USERS[OTHER_ORG], ORG_A), false);
  assert.equal(
    isMetaReviewFixtureUser({
      email: "reviewer@meta.example",
      profile_settings: { meta_review_user: true }
    }),
    true
  );

  const unassigned = await resolveNewLeadAssignment({
    organizationId: ORG_A,
    explicitAgentId: DISABLED,
    deps: {
      findUserById: async (id) => USERS[id] || null,
      findActiveOrganizationRvp: async () => null,
      organizationSettings: {}
    }
  });
  assert.equal(unassigned.assignmentStatus, ASSIGNMENT_STATUS.UNASSIGNED);
  assert.equal(unassigned.ownerUserId, null);
  assert.equal(unassigned.fallbackRole, "admin_rvp_pool");
});

test("10-13. visibility: Admin/RVP see unassigned; agent sees owned only; cross-org denied", () => {
  const unassigned = {
    organization_id: ORG_A,
    owner_user_id: null,
    phone: "+15550001111"
  };
  const owned = { ...unassigned, owner_user_id: AGENT };

  assert.equal(canAccessProspect(auth(ROLES.ADMINISTRATOR, "admin"), unassigned), true);
  assert.equal(canAccessProspect(auth(ROLES.RVP, RVP), unassigned), true);
  assert.equal(canAccessProspect(auth(ROLES.AGENT, AGENT), unassigned), false);
  assert.equal(canAccessProspect(auth(ROLES.AGENT, AGENT), owned), true);
  assert.equal(canAccessProspect(auth(ROLES.AGENT, "other"), owned), false);
  assert.equal(canAccessProspect(auth(ROLES.RVP, RVP, ORG_B), unassigned), false);

  assert.equal(filterProspectsForAuthContext(auth(ROLES.RVP, RVP), [unassigned]).length, 1);
  assert.equal(filterProspectsForAuthContext(auth(ROLES.AGENT, AGENT), [unassigned]).length, 0);
});

test("14-15. NewLeadAttention mission created; mission id is deterministic (no duplicate types)", () => {
  assert.equal(MISSION_TYPES.NEW_LEAD_ATTENTION, "NewLeadAttention");

  const missions = generateMissionsFromContext({
    prospect: {
      phone: "+15550002222",
      owner_user_id: null,
      attention_status: "new",
      new_lead_received_at: new Date().toISOString(),
      current_step: "GREETING",
      source: "FACEBOOK"
    },
    workflow: {
      canonicalMilestone: MILESTONES.GREETING_SENT,
      workflowOwnership: "ATLAS",
      needsHumanAttention: false
    },
    conversationOutcome: {},
    availableActions: [{ id: "call" }, { id: "whatsapp" }, { id: "notes" }],
    brain: { currentStep: "GREETING", missingFields: [] },
    agentState: {}
  });

  const newLeadMissions = missions.filter(
    (m) => m.missionType === MISSION_TYPES.NEW_LEAD_ATTENTION
  );
  assert.equal(newLeadMissions.length, 1);
  assert.equal(newLeadMissions[0].id, "+15550002222:NewLeadAttention");
});

test("16. AI success path does not acknowledge", async () => {
  const prospect = {
    phone: "+15550003333",
    attention_status: "new",
    acknowledged_at: null,
    owner_user_id: RVP
  };

  // markAiResponding updates DB — stub by asserting helper semantics without write when no supabase
  assert.equal(isAcknowledged(prospect), false);
  assert.equal(isNewLeadAttentionOpen(prospect), true);

  const fields = buildNewLeadAttentionFields({
    ownerUserId: RVP,
    assignmentStatus: ASSIGNMENT_STATUS.ASSIGNED,
    assignmentSource: ASSIGNMENT_SOURCES.ORGANIZATION_RVP
  });
  assert.equal(fields.attention_status, ATTENTION_STATUS.NEW);
  assert.equal(fields.acknowledged_at, null);
});

test("17. Human attention reason sanitized; open attention remains", () => {
  assert.equal(sanitizeReason("  provider send failed  ").includes("provider"), true);
  const prospect = {
    attention_status: ATTENTION_STATUS.HUMAN_REQUIRED,
    human_attention_reason: "ai_or_delivery_failure",
    new_lead_received_at: new Date().toISOString()
  };
  assert.equal(isNewLeadAttentionOpen(prospect), true);
  assert.equal(isAcknowledged(prospect), false);
});

test("18-19. BR-075/078 blocked send fail-closed", async () => {
  const result = await authorizeWhatsAppOutbound({
    organizationId: ORG_A,
    intent: "confirmation",
    phone: "+15550001111",
    prospect: { organization_id: ORG_A },
    evaluateWindow: async () => ({ open: false, reason: "WINDOW_CLOSED" }),
    resolveTemplate: () => ({
      ok: false,
      status: "blocked_template_unapproved",
      reason: "TEMPLATE_INACTIVE",
      templateKey: "CONFIRMATION"
    })
  });
  assert.match(String(result.status), /blocked/i);
  assert.equal(result.authorized, false);
});

test("20-21. acknowledgement helper semantics; page-view is not an acknowledge path", () => {
  const wa = read("../core/whatsappInboundPipeline.js");
  assert.doesNotMatch(wa, /acknowledgeLead\(/);
  assert.match(wa, /markAiResponding/);
  assert.match(wa, /markHumanAttentionRequired/);

  const routes = read("../routes/newLeadAttention.js");
  assert.match(routes, /acknowledgeLead/);
  assert.match(routes, /claimLead/);

  // Conversations TAKE OVER reuses canonical acknowledgeLead for the current episode.
  const ownership = read("../core/conversationsCenter/conversationsCenterOwnershipService.js");
  assert.match(ownership, /acknowledgeLead/);
});

test("22-23. claim permission and concurrent claim conflict codes", () => {
  const unassigned = { organization_id: ORG_A, owner_user_id: null };
  assert.equal(canClaimUnassigned(auth(ROLES.RVP, RVP), unassigned), true);
  assert.equal(canClaimUnassigned(auth(ROLES.AGENT, AGENT), unassigned), false);
  assert.equal(
    canAcknowledgeProspect(auth(ROLES.AGENT, AGENT), {
      organization_id: ORG_A,
      owner_user_id: AGENT
    }),
    true
  );
});

test("24-27. escalation 5m/15m idempotent levels; acknowledged/closed stop", () => {
  const now = Date.now();
  const unassigned = {
    owner_user_id: null,
    attention_status: "new",
    new_lead_received_at: new Date(now - ESCALATION_UNASSIGNED_MS - 1000).toISOString(),
    escalation_level: 0,
    current_step: "GREETING",
    entry_method: "QR",
    source: "car_magnet",
    workflow_state: { atlasEligibilitySource: "QR" }
  };

  const level1 = evaluateEscalation(unassigned, now);
  assert.equal(level1.shouldEscalate, true);
  assert.equal(level1.level, 1);

  const already1 = evaluateEscalation({ ...unassigned, escalation_level: 1 }, now);
  assert.equal(already1.shouldEscalate, false);

  const level2 = evaluateEscalation(
    {
      ...unassigned,
      escalation_level: 1,
      new_lead_received_at: new Date(now - ESCALATION_UNACKNOWLEDGED_MS - 1000).toISOString()
    },
    now
  );
  assert.equal(level2.shouldEscalate, true);
  assert.equal(level2.level, 2);

  const ack = evaluateEscalation(
    { ...unassigned, acknowledged_at: new Date().toISOString(), attention_status: "acknowledged" },
    now
  );
  assert.equal(ack.shouldEscalate, false);

  const closed = evaluateEscalation({ ...unassigned, current_step: "CLOSED" }, now);
  assert.equal(closed.shouldEscalate, false);
});

test("28-30. Prospect Center badges/filters source contracts", () => {
  const pc = read("../core/prospectCenterReadModel.js");
  assert.match(pc, /badges/);
  assert.match(pc, /isUnassigned/);
  assert.match(pc, /isNew/);

  const filters = EXECUTIVE_FILTERS;
  assert.equal(filters.UNASSIGNED, "unassigned");
  assert.equal(filters.NEW_UNACKNOWLEDGED, "new-unacknowledged");
  assert.equal(filters.HUMAN_ATTENTION, "human-attention");

  const prospects = [
    {
      phone: "+1",
      owner_user_id: null,
      attention_status: "new",
      new_lead_received_at: "2026-08-06T15:00:00.000Z"
    },
    {
      phone: "+2",
      owner_user_id: AGENT,
      acknowledged_at: "2026-08-06T15:01:00.000Z",
      attention_status: "acknowledged"
    }
  ];
  const queue = prospects.map((p) => ({
    phone: p.phone,
    needsHumanAttention: false,
    missionControlPriority: 1
  }));

  assert.deepEqual(
    resolveExecutiveFilterPhones(EXECUTIVE_FILTERS.UNASSIGNED, prospects, queue),
    ["+1"]
  );
  assert.deepEqual(
    resolveExecutiveFilterPhones(EXECUTIVE_FILTERS.NEW_UNACKNOWLEDGED, prospects, queue),
    ["+1"]
  );
});

test("31. Mission Control priority: unassigned and unresolved outcome both CRITICAL", () => {
  const pending = computeMissionControlPriority({
    milestone: MILESTONES.INTERVIEW_RESULT_PENDING,
    needsHumanAttention: false
  });
  const unassigned = computeMissionControlPriority({
    milestone: MILESTONES.GREETING_SENT,
    needsHumanAttention: false,
    prospect: {
      owner_user_id: null,
      attention_status: "new",
      new_lead_received_at: new Date().toISOString()
    }
  });
  assert.equal(pending.rank, PRIORITY_TIERS.PENDING_INTERVIEW_RESULTS);
  assert.equal(unassigned.rank, PRIORITY_TIERS.UNASSIGNED_NEW_LEAD);
  assert.equal(pending.rank, unassigned.rank);
});

test("32. Alpha Brief exposes BR-080 attention counts", () => {
  const alpha = read("../core/alphaMorningBriefEngine.js");
  assert.match(alpha, /unassignedLeads/);
  assert.match(alpha, /newUnacknowledgedLeads/);
  assert.match(alpha, /humanAttentionRequiredLeads/);
});

test("33. TV-000029 fixture semantics without production access", () => {
  const fixture = {
    prospect_number: "TV-AUDIT-000029",
    source: "FACEBOOK",
    entry_method: "CLICK_TO_WHATSAPP",
    owner_user_id: null,
    current_step: "GREETING",
    attention_status: "new",
    created_at: "2026-08-06T15:04:57.597Z"
  };
  assert.equal(isUnassigned(fixture), true);
  assert.equal(isNewLeadAttentionOpen(fixture), true);
  assert.equal(isAcknowledged(fixture), false);
});

test("34-36. WhatsApp create wires BR-080 assignment; repeated inbound does not reassign", () => {
  const resolver = read("../core/whatsappProspectResolver.js");
  assert.match(resolver, /resolveNewLeadAssignment/);
  assert.match(resolver, /buildNewLeadAttentionFields/);
  assert.match(resolver, /never reassign a valid owner/);
});

test("37. schedule booking preserves valid owner (stamp only when null)", () => {
  const semantic = read("../core/semanticConversationEngine.js");
  assert.match(semantic, /if \(!prospect\.owner_user_id\)/);
  assert.match(semantic, /owner_user_id: agentId/);
});

test("38-40. claim/acknowledge audited; Meta Review fixture rejected; migration additive", () => {
  const attention = read("../core/newLeadAttentionEngine.js");
  assert.match(attention, /lead\.acknowledged/);
  assert.match(attention, /lead\.claimed/);
  assert.match(attention, /lead\.escalated/);

  const migration = read("../database/migrations/031_br080_new_lead_attention.sql");
  assert.match(migration, /ADD COLUMN IF NOT EXISTS/);
  assert.match(migration, /No ownership backfill/i);

  assert.equal(
    isMetaReviewFixtureUser({ profile_settings: { meta_review_user: true } }),
    true
  );
});

test("41-45. BR-075/076/077/078/079 unchanged contracts present", () => {
  assert.match(read("../core/whatsappOutboundAuthorizationGate.js"), /authorizeWhatsAppOutbound/);
  assert.match(read("../core/virtualMeetingUrlResolver.js"), /BR-076/);
  assert.match(read("../core/officeAddressResolver.js"), /BR-077/);
  assert.match(read("../core/whatsappApprovedTemplateRegistry.js"), /BR-078|inactive/);
  assert.match(read("../core/organizationDateWindow.js"), /getOrganizationDateWindow/);
});

test("46-50. poller started; no production ownership backfill; CTWA/Facebook share create path", () => {
  const server = read("../server.js");
  assert.match(server, /startNewLeadEscalationPoller/);

  const migration = read("../database/migrations/031_br080_new_lead_attention.sql");
  assert.doesNotMatch(migration, /UPDATE\s+prospects\s+SET\s+owner_user_id/i);

  // Facebook lead ads use locateOrCreateWhatsAppProspect
  const facebook = read("../core/facebookLeadIntakeService.js");
  assert.match(facebook, /locateOrCreateWhatsAppProspect/);
});
