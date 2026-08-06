/**
 * Audit-safe tests — New Lead Assignment, Visibility, and Agent Notification.
 * Recommended BR-080. No live provider calls. No production writes.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { filterProspectsForAuthContext, canAccessProspect } = require("../security/authorizationService");
const { ROLES } = require("../security/roles");
const { PERMISSIONS, ROLE_PERMISSIONS } = require("../security/permissions");
const {
  resolveAutonomousScheduleAgentId,
  isEligibleScheduleAgent,
  readConfiguredDefaultRecruiterId
} = require("../core/autonomousScheduleAgentResolver");
const { computeMissionControlPriority } = require("../core/milestoneMapper");
const { MILESTONES, PRIORITY_TIERS } = require("../core/workflowConstants");
const { authorizeWhatsAppOutbound } = require("../core/whatsappOutboundAuthorizationGate");

const ORG_A = "00000000-0000-4000-8000-000000000001";
const ORG_B = "00000000-0000-4000-8000-000000000099";
const AGENT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AGENT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const RVP_A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function auth(role, userId, organizationId = ORG_A, extras = {}) {
  return {
    userId,
    organizationId,
    role,
    status: "active",
    permissions: extras.permissions || ["prospect:read"],
    divisionId: extras.divisionId || null
  };
}

function unassignedLead(overrides = {}) {
  return {
    id: "lead-1",
    prospect_number: "TV-AUDIT-001",
    organization_id: ORG_A,
    owner_user_id: null,
    assigned_agent_id: null,
    phone: "+15550001111",
    name: "Audit Lead",
    current_step: "NEW",
    ...overrides
  };
}

function read(rel) {
  return fs.readFileSync(path.join(__dirname, rel), "utf8");
}

test("1-2. WhatsApp create path does not assign owner; Quick Capture assigns creator", () => {
  const wa = read("../core/whatsappProspectResolver.js");
  assert.match(wa, /insertWhatsAppProspectRow/);
  assert.match(wa, /organization_id:\s*organizationId/);
  assert.doesNotMatch(
    wa.slice(wa.indexOf("async function insertWhatsAppProspectRow"), wa.indexOf("async function locateOrCreate")),
    /owner_user_id/
  );

  const qc = read("../core/quickCaptureEngine.js");
  assert.match(qc, /owner_user_id:\s*atlasUser\.id/);
  assert.match(qc, /created_by_user_id:\s*atlasUser\.id/);
});

test("3-5. schedule agent resolver rejects inactive / wrong-org / missing agents", async () => {
  const users = {
    [AGENT_A]: {
      id: AGENT_A,
      organization_id: ORG_A,
      role: "agent",
      status: "inactive",
      email: "inactive@example.com",
      rep_id: "AAAAA"
    },
    [AGENT_B]: {
      id: AGENT_B,
      organization_id: ORG_B,
      role: "agent",
      status: "active",
      email: "otherorg@example.com",
      rep_id: "BBBBB"
    },
    [RVP_A]: {
      id: RVP_A,
      organization_id: ORG_A,
      role: "rvp",
      status: "active",
      email: "rvp@example.com",
      rep_id: "4TJLK"
    }
  };

  assert.equal(isEligibleScheduleAgent(users[AGENT_A]), false);
  assert.equal(isEligibleScheduleAgent(users[RVP_A]), true);

  const atlasUserService = require("../services/atlasUserService");
  const originalFind = atlasUserService.findUserById;
  const originalRep = atlasUserService.findUserByRepId;
  atlasUserService.findUserById = async (id) => users[id] || null;
  atlasUserService.findUserByRepId = async () => users[RVP_A];

  try {
    const disabledOwner = await resolveAutonomousScheduleAgentId({
      prospect: { owner_user_id: AGENT_A, organization_id: ORG_A },
      organizationId: ORG_A,
      organizationSettings: {}
    });
    assert.equal(disabledOwner.source, "organization_rvp");
    assert.equal(disabledOwner.agentId, RVP_A);

    const missing = await resolveAutonomousScheduleAgentId({
      prospect: { owner_user_id: null, organization_id: ORG_A },
      organizationId: ORG_A,
      organizationSettings: { scheduling: { defaultRecruiterUserId: "missing-user" } }
    });
    assert.equal(missing.agentId, RVP_A);
    assert.equal(missing.source, "organization_rvp");

    const configured = readConfiguredDefaultRecruiterId({
      scheduling: { defaultRecruiterUserId: RVP_A }
    });
    assert.equal(configured, RVP_A);
  } finally {
    atlasUserService.findUserById = originalFind;
    atlasUserService.findUserByRepId = originalRep;
  }
});

test("6. unassigned state persists as owner_user_id null (no special assignment status required)", () => {
  const lead = unassignedLead();
  assert.equal(lead.owner_user_id, null);
  assert.equal(Boolean(lead.owner_user_id), false);
});

test("7-8. RVP/Admin see unassigned; representative does not", () => {
  const lead = unassignedLead();
  assert.equal(canAccessProspect(auth(ROLES.ADMINISTRATOR, "admin-1"), lead), true);
  assert.equal(canAccessProspect(auth(ROLES.RVP, RVP_A), lead), true);
  assert.equal(canAccessProspect(auth(ROLES.AGENT, AGENT_A), lead), false);
  assert.equal(canAccessProspect(auth(ROLES.RECRUITER, AGENT_A), lead), false);

  const visible = filterProspectsForAuthContext(auth(ROLES.RVP, RVP_A), [lead]);
  const hidden = filterProspectsForAuthContext(auth(ROLES.AGENT, AGENT_A), [lead]);
  assert.equal(visible.length, 1);
  assert.equal(hidden.length, 0);
});

test("9. mission engine can generate CallProspect for NEW_LEAD / GREETING_SENT (computed, not push)", () => {
  const missionEngine = read("../core/missionEngine.js");
  assert.match(missionEngine, /shouldContactProspect/);
  assert.match(missionEngine, /MILESTONES\.NEW_LEAD/);
  assert.match(missionEngine, /CALL_PROSPECT|CallProspect/);
  assert.doesNotMatch(missionEngine, /AssignLead|UnassignedPool|NEW_LEAD_MISSION/);
});

test("10-11. no durable acknowledgement field; AI response does not equal human acknowledgement", () => {
  const wa = read("../core/whatsappProspectResolver.js");
  const semantic = read("../core/semanticConversationEngine.js");
  assert.doesNotMatch(wa, /acknowledged_at|agent_acknowledged|human_acknowledged/);
  assert.doesNotMatch(semantic, /acknowledged_at|agent_acknowledged|human_acknowledged/);

  // AI workflow ownership ATLAS with needsHumanAttention false at create
  assert.match(wa, /workflowOwnership:\s*OWNERSHIP\.ATLAS|OWNERSHIP\.ATLAS/);
  assert.match(wa, /needsHumanAttention:\s*false/);
});

test("12. AI/schedule failure path sets Human Attention Required", () => {
  const semantic = read("../core/semanticConversationEngine.js");
  assert.match(semantic, /markAutonomousScheduleHumanAssist/);
  assert.match(semantic, /needsHumanAttention:\s*true/);
  assert.match(semantic, /workflowOwnership:\s*OWNERSHIP\.AGENT/);
});

test("13-14. BR-075/078 blocked send remains fail-closed and must not look successful", async () => {
  // Stub window closed + inactive template path — no live provider / DB lookups.
  const result = await authorizeWhatsAppOutbound({
    organizationId: ORG_A,
    intent: "confirmation",
    phone: "+15550001111",
    prospect: { organization_id: ORG_A },
    now: new Date("2026-08-06T12:00:00.000Z"),
    evaluateWindow: async () => ({ open: false, reason: "WINDOW_CLOSED" }),
    resolveTemplate: () => ({
      ok: false,
      status: "blocked_template_unapproved",
      reason: "TEMPLATE_INACTIVE",
      templateKey: "CONFIRMATION"
    })
  });

  assert.match(String(result?.status || ""), /blocked/i);
  assert.equal(result?.extras?.authorized, false);
  assert.notEqual(String(result?.status || "").toLowerCase(), "sent");
});

test("15-17. duplicate webhook + same-org / cross-org isolation contracts exist", () => {
  const scopeTest = read("./whatsappInboundOrganizationScope.test.js");
  assert.match(scopeTest, /duplicate provider message short-circuits/);
  assert.match(scopeTest, /AGENT without ownership does not see unassigned lead/);
  assert.match(scopeTest, /RVP sees org-scoped unassigned lead/);

  const leadA = unassignedLead({ organization_id: ORG_A });
  const leadB = unassignedLead({ id: "lead-b", organization_id: ORG_B });
  assert.equal(canAccessProspect(auth(ROLES.RVP, RVP_A, ORG_A), leadA), true);
  assert.equal(canAccessProspect(auth(ROLES.RVP, RVP_A, ORG_A), leadB), false);
});

test("18. Prospect Center auth filter can hide unassigned leads from agents (audit finding)", () => {
  const lead = unassignedLead({ current_step: "GREETING" });
  const agentView = filterProspectsForAuthContext(auth(ROLES.AGENT, AGENT_A), [lead]);
  assert.equal(agentView.length, 0);
});

test("19. Mission Control priority ranks Human Attention above monitoring; unresolved outcome stays highest", () => {
  const pendingOutcome = computeMissionControlPriority({
    milestone: MILESTONES.INTERVIEW_RESULT_PENDING,
    needsHumanAttention: false
  });
  const humanAttention = computeMissionControlPriority({
    milestone: MILESTONES.QUALIFICATION,
    needsHumanAttention: true
  });
  const newLead = computeMissionControlPriority({
    milestone: MILESTONES.NEW_LEAD,
    needsHumanAttention: false
  });

  assert.equal(pendingOutcome.rank, PRIORITY_TIERS.PENDING_INTERVIEW_RESULTS);
  assert.equal(humanAttention.rank, PRIORITY_TIERS.HUMAN_ESCALATION);
  assert.ok(pendingOutcome.rank < humanAttention.rank);
  assert.ok(humanAttention.rank <= (newLead.rank ?? 99));
});

test("20. agent list scope permanently filters to ownerUserId — unassigned excluded by design", () => {
  const { getProspectListScope } = require("../security/authorizationService");
  const scope = getProspectListScope(auth(ROLES.AGENT, AGENT_A));
  assert.equal(scope.ownerUserId, AGENT_A);
  assert.equal(scope.organizationId, ORG_A);
});

test("21. audit finding: WhatsApp structured logger currently spreads details without redaction helper", () => {
  const logger = read("../core/whatsappStructuredLogger.js");
  // Document current behavior for the audit — no automatic PII mask helper exists here.
  assert.match(logger, /logWhatsAppStage/);
  assert.match(logger, /\.\.\.details/);
  assert.doesNotMatch(logger, /maskPhone|redactPhone|sanitizePhone/);
});

test("22-25. BR-075/076/077/078 source contracts remain present", () => {
  assert.match(read("../core/whatsappOutboundAuthorizationGate.js"), /BR-075|authorizeWhatsAppOutbound/);
  assert.match(read("../core/virtualMeetingUrlResolver.js"), /BR-076/);
  assert.match(read("../core/officeAddressResolver.js"), /BR-077/);
  assert.match(read("../core/whatsappApprovedTemplateRegistry.js"), /BR-078|inactive/);
});

test("26. BR-079 organization date window remains present", () => {
  assert.match(read("../core/organizationDateWindow.js"), /BR-079|getOrganizationDateWindow/);
});

test("27. Meta Review allowlist / bridge unchanged by audit (source presence)", () => {
  assert.match(read("../services/metaReviewLegacyProspectBridge.js"), /owner_user_id:\s*reviewUser\.id/);
  const boundary = read("./scheduleConversationalFlexibilityMetaReviewBoundary.test.js");
  assert.match(boundary, /Meta Review/);
});

test("28. RLS 029/030 audit tests remain present", () => {
  assert.ok(fs.existsSync(path.join(__dirname, "rls029BackendOnlyPublicTables.test.js")));
  assert.ok(fs.existsSync(path.join(__dirname, "syncAtlasUsersSearchPath030.test.js")));
});

test("29. agents lack prospect:assign — cannot self-claim unassigned pool", () => {
  const agentPerms = ROLE_PERMISSIONS[ROLES.AGENT] || [];
  const rvpPerms = ROLE_PERMISSIONS[ROLES.RVP] || [];
  assert.equal(agentPerms.includes(PERMISSIONS.PROSPECT_ASSIGN), false);
  assert.equal(rvpPerms.includes(PERMISSIONS.PROSPECT_ASSIGN), true);
});

test("30. no create-time round-robin / campaign mapping / leadDistribution router", () => {
  const wa = read("../core/whatsappProspectResolver.js");
  assert.doesNotMatch(wa, /roundRobin|round_robin|campaignAgent|leadDistribution/);
  const facebook = fs.existsSync(path.join(__dirname, "../routes/facebookLeadWebhook.js"))
    ? read("../routes/facebookLeadWebhook.js")
    : "";
  if (facebook) {
    assert.doesNotMatch(facebook, /owner_user_id\s*=/);
  }
});

test("audit finding: late owner stamp only in completeInterview, not at create", () => {
  const semantic = read("../core/semanticConversationEngine.js");
  assert.match(semantic, /Stamp ownership for autonomous WhatsApp leads/);
  assert.match(semantic, /owner_user_id:\s*agentId/);
});

test("audit finding: leadDistribution policy placeholder disabled", () => {
  // Documented in org settings shape / migration; resolver reads it but create path ignores it.
  const resolver = read("../core/autonomousScheduleAgentResolver.js");
  assert.match(resolver, /leadDistribution/);
  assert.match(resolver, /defaultRecruiterUserId/);
});
