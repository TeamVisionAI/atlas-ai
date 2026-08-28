/**
 * BR-165 — Personal WhatsApp assigns the connection owner, is eligible for
 * Recruit AI, and default workspace lists are mine-only.
 */

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ASSIGNMENT_SOURCES,
  resolveNewLeadAssignment
} = require("../core/newLeadAssignmentEngine");
const {
  evaluateAtlasInboundAutomationEligibility,
  resolveVerifiedAtlasEligibilitySource,
  isPersonalWhatsAppConnection,
  VERIFIED_ATLAS_ELIGIBILITY_SOURCES
} = require("../core/atlasInboundAutomationEligibility");
const { evaluateProspectPromotion } = require("../core/prospectPromotionEligibility");
const { resolveCreateSourceFields } = require("../core/whatsappProspectResolver");
const { WHATSAPP_ENTRY_METHOD, WHATSAPP_SOURCE } = require("../core/whatsappConstants");
const {
  resolveWorkspaceListScope,
  isProspectInWorkspaceListScope,
  canAccessProspect,
  WORKSPACE_LIST_SCOPES
} = require("../security/authorizationService");
const { ROLES } = require("../security/roles");
const { applyProspectListScopeToQuery } = require("../core/executiveDashboardReadModel");

const ORG = "00000000-0000-4000-8000-000000000001";
const MISLEISYS = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NIOVEL = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const USERS = {
  [MISLEISYS]: {
    id: MISLEISYS,
    organization_id: ORG,
    role: "agent",
    status: "active",
    email: "agent@example.com",
    rep_id: "MMMMM"
  },
  [NIOVEL]: {
    id: NIOVEL,
    organization_id: ORG,
    role: "rvp",
    status: "active",
    email: "rvp@example.com",
    rep_id: "4TJLK"
  }
};

function auth(role, userId) {
  return {
    userId,
    organizationId: ORG,
    role,
    status: "active",
    permissions: ["prospect:read", "dashboard:team", "dashboard:executive"]
  };
}

test("personal WhatsApp owner wins over default recruiter and org RVP", async () => {
  const assignment = await resolveNewLeadAssignment({
    organizationId: ORG,
    whatsappOwnerUserId: MISLEISYS,
    deps: {
      findUserById: async (id) => USERS[id] || null,
      findActiveOrganizationRvp: async () => USERS[NIOVEL],
      organizationSettings: {
        scheduling: { defaultRecruiterUserId: NIOVEL }
      }
    }
  });
  assert.equal(assignment.ownerUserId, MISLEISYS);
  assert.equal(assignment.assignmentSource, ASSIGNMENT_SOURCES.PERSONAL_WHATSAPP);
});

test("ineligible personal WhatsApp owner does not fall back to Niovel/RVP", async () => {
  const assignment = await resolveNewLeadAssignment({
    organizationId: ORG,
    whatsappOwnerUserId: "inactive-user",
    deps: {
      findUserById: async () => ({
        id: "inactive-user",
        organization_id: ORG,
        role: "agent",
        status: "inactive"
      }),
      findActiveOrganizationRvp: async () => USERS[NIOVEL],
      organizationSettings: {
        scheduling: { defaultRecruiterUserId: NIOVEL }
      }
    }
  });
  assert.equal(assignment.ownerUserId, null);
  assert.equal(assignment.assignmentSource, ASSIGNMENT_SOURCES.UNASSIGNED);
});

test("org-owned WhatsApp still uses default recruiter", async () => {
  const assignment = await resolveNewLeadAssignment({
    organizationId: ORG,
    deps: {
      findUserById: async (id) => USERS[id] || null,
      findActiveOrganizationRvp: async () => USERS[NIOVEL],
      organizationSettings: {
        scheduling: { defaultRecruiterUserId: NIOVEL }
      }
    }
  });
  assert.equal(assignment.ownerUserId, NIOVEL);
  assert.equal(assignment.assignmentSource, ASSIGNMENT_SOURCES.DEFAULT_RECRUITER);
});

test("personal connection promotes and is Recruit AI eligible without CTWA referral", () => {
  assert.equal(isPersonalWhatsAppConnection("whatsapp_personal_connection"), true);
  assert.equal(isPersonalWhatsAppConnection("whatsapp_organization_connection"), false);

  const promotion = evaluateProspectPromotion({
    whatsappConnectionSource: "whatsapp_personal_connection"
  });
  assert.equal(promotion.promote, true);
  assert.equal(promotion.reason, "PERSONAL_WHATSAPP");

  const eligibility = evaluateAtlasInboundAutomationEligibility({
    prospect: { id: "p1", phone: "+17863061884", organization_id: ORG },
    inbound: { text: "Hola. ¿Puedes darme más información sobre esto?" }
  });
  assert.equal(eligibility.eligible, false);

  const personal = evaluateAtlasInboundAutomationEligibility({
    prospect: { id: "p1", phone: "+17863061884", organization_id: ORG },
    inbound: {
      text: "Hola. ¿Puedes darme más información sobre esto?",
      whatsappConnectionSource: "whatsapp_personal_connection"
    }
  });
  assert.equal(personal.eligible, true);
  assert.equal(personal.reason, "PERSONAL_WHATSAPP");
});

test("shared org connection without referral stays silent and unpromoted", () => {
  const promotion = evaluateProspectPromotion({
    whatsappConnectionSource: "whatsapp_organization_connection"
  });
  assert.equal(promotion.promote, false);

  const eligibility = evaluateAtlasInboundAutomationEligibility({
    prospect: { id: "p2", phone: "+17865557338", organization_id: ORG },
    inbound: {
      text: "Hola",
      whatsappConnectionSource: "whatsapp_organization_connection"
    }
  });
  assert.equal(eligibility.eligible, false);
});

test("create fields stamp personal WhatsApp owner, not default CTWA labels", () => {
  const fields = resolveCreateSourceFields(null, {
    whatsappConnectionSource: "whatsapp_personal_connection",
    whatsappConnectionOwnerUserId: MISLEISYS
  });
  assert.equal(fields.entryMethod, WHATSAPP_ENTRY_METHOD.PERSONAL_WHATSAPP);
  assert.equal(fields.source, WHATSAPP_SOURCE.PERSONAL_WHATSAPP);
  assert.equal(fields.whatsappOwnerUserId, MISLEISYS);
  assert.equal(
    resolveVerifiedAtlasEligibilitySource({
      whatsappConnectionSource: "whatsapp_personal_connection"
    }),
    VERIFIED_ATLAS_ELIGIBILITY_SOURCES.PERSONAL_WHATSAPP
  );
});

test("default workspace lists are mine; oversight is explicit; deep-link stays open", () => {
  const javier = {
    organization_id: ORG,
    owner_user_id: MISLEISYS,
    assigned_agent_id: null
  };
  const niovelLead = {
    organization_id: ORG,
    owner_user_id: NIOVEL,
    assigned_agent_id: null
  };

  const rvpMine = resolveWorkspaceListScope(auth(ROLES.RVP, NIOVEL));
  assert.equal(rvpMine.workspaceScope, WORKSPACE_LIST_SCOPES.MINE);
  assert.equal(rvpMine.ownerUserId, NIOVEL);
  assert.equal(isProspectInWorkspaceListScope(javier, rvpMine), false);
  assert.equal(isProspectInWorkspaceListScope(niovelLead, rvpMine), true);

  const agentMine = resolveWorkspaceListScope(auth(ROLES.AGENT, MISLEISYS));
  assert.equal(isProspectInWorkspaceListScope(javier, agentMine), true);
  assert.equal(isProspectInWorkspaceListScope(niovelLead, agentMine), false);

  const rvpOversight = resolveWorkspaceListScope(
    auth(ROLES.RVP, NIOVEL),
    "oversight"
  );
  assert.equal(rvpOversight.workspaceScope, WORKSPACE_LIST_SCOPES.OVERSIGHT);
  assert.equal(rvpOversight.ownerUserId, undefined);
  assert.equal(isProspectInWorkspaceListScope(javier, rvpOversight), true);

  assert.equal(canAccessProspect(auth(ROLES.RVP, NIOVEL), javier), true);
  assert.equal(canAccessProspect(auth(ROLES.AGENT, MISLEISYS), javier), true);
  assert.equal(canAccessProspect(auth(ROLES.AGENT, MISLEISYS), niovelLead), false);
});

test("list-scope query filter is applied before pagination", () => {
  const calls = [];
  const query = {
    or(value) {
      calls.push(value);
      return query;
    },
    eq() {
      return query;
    }
  };
  applyProspectListScopeToQuery(query, { ownerUserId: MISLEISYS });
  assert.equal(calls.length, 1);
  assert.match(calls[0], new RegExp(MISLEISYS));
  assert.match(calls[0], /owner_user_id/);
  assert.match(calls[0], /assigned_agent_id/);
});
