/**
 * BR-165 / BR-165A — Personal WhatsApp assigns the connection owner and default
 * workspace lists are mine-only, but personal connection alone is NOT Recruit AI eligibility.
 */

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  ASSIGNMENT_SOURCES,
  resolveNewLeadAssignment
} = require("../core/newLeadAssignmentEngine");
const {
  evaluateAtlasInboundAutomationEligibility,
  resolveVerifiedAtlasEligibilitySource,
  isPersonalWhatsAppConnection
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

test("personal connection assigns owner but is not promotion or Recruit AI eligibility", () => {
  assert.equal(isPersonalWhatsAppConnection("whatsapp_personal_connection"), true);
  assert.equal(isPersonalWhatsAppConnection("whatsapp_organization_connection"), false);

  const promotion = evaluateProspectPromotion({
    whatsappConnectionSource: "whatsapp_personal_connection"
  });
  assert.equal(promotion.promote, false);
  assert.equal(promotion.reason, "NO_VALID_PROMOTION_SIGNAL");

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
  assert.equal(personal.eligible, false);
  assert.equal(personal.reason, "NOT_ELIGIBLE");
});

test("personal connection with verified CTWA is still Recruit AI eligible", () => {
  const personal = evaluateAtlasInboundAutomationEligibility({
    prospect: { id: "p1", phone: "+17863061884", organization_id: ORG },
    inbound: {
      text: "Hola",
      whatsappConnectionSource: "whatsapp_personal_connection",
      ctwaReferral: { source_type: "ad", ctwa_clid: "personal-ctwa-1" }
    }
  });
  assert.equal(personal.eligible, true);
  assert.equal(personal.reason, "CTWA_REFERRAL");
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

test("create fields stamp personal WhatsApp owner but not verified automation eligibility", () => {
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
    null
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
  const eqCalls = [];
  const inCalls = [];
  const orCalls = [];
  const query = {
    or(value) {
      orCalls.push(value);
      return query;
    },
    eq(column, value) {
      eqCalls.push({ column, value });
      return query;
    },
    in(column, values) {
      inCalls.push({ column, values });
      return query;
    }
  };
  applyProspectListScopeToQuery(query, { ownerUserId: MISLEISYS });
  assert.deepEqual(eqCalls, [{ column: "owner_user_id", value: MISLEISYS }]);
  assert.deepEqual(orCalls, []);
  assert.deepEqual(inCalls, []);

  applyProspectListScopeToQuery(query, {
    ownerUserIds: [MISLEISYS, NIOVEL]
  });
  assert.deepEqual(inCalls, [{ column: "owner_user_id", values: [MISLEISYS, NIOVEL] }]);
});

test("prospects list query never filters assigned_agent_id (42703 regression)", () => {
  const listQuery = fs.readFileSync(
    path.join(__dirname, "../core/executiveDashboardReadModel.js"),
    "utf8"
  );
  const applyFn = listQuery.slice(
    listQuery.indexOf("function applyProspectListScopeToQuery"),
    listQuery.indexOf("async function loadProductionProspects")
  );
  assert.match(applyFn, /owner_user_id/);
  assert.doesNotMatch(applyFn, /assigned_agent_id/);
  assert.match(listQuery, /\.from\("prospects"\)/);

  const prospectsMigration = fs.readFileSync(
    path.join(__dirname, "../database/migrations/002_quick_capture.sql"),
    "utf8"
  );
  const coreMigration = fs.readFileSync(
    path.join(__dirname, "../database/migrations/003_atlas_core_prospects.sql"),
    "utf8"
  );
  assert.match(prospectsMigration, /ALTER TABLE prospects ADD COLUMN IF NOT EXISTS owner_user_id/);
  assert.doesNotMatch(prospectsMigration, /assigned_agent_id/);
  assert.match(coreMigration, /assigned_agent_id UUID REFERENCES atlas_users/);
});

test("Team Vision / Team Legacy / personal mine scopes stay isolated", () => {
  const TV = ORG;
  const TL = "af8fb707-f26c-4152-ad77-2d079d30bc8a";
  const tvMine = resolveWorkspaceListScope(auth(ROLES.AGENT, MISLEISYS));
  const tlRvp = {
    userId: NIOVEL,
    organizationId: TL,
    role: ROLES.RVP,
    status: "active",
    permissions: ["prospect:read", "dashboard:team", "dashboard:executive"]
  };
  const tlMine = resolveWorkspaceListScope(tlRvp);
  const tvOversight = resolveWorkspaceListScope(auth(ROLES.RVP, NIOVEL), "oversight");

  const misleisysLead = { organization_id: TV, owner_user_id: MISLEISYS };
  const niovelTvLead = { organization_id: TV, owner_user_id: NIOVEL };
  const tlLead = { organization_id: TL, owner_user_id: NIOVEL };

  assert.equal(isProspectInWorkspaceListScope(misleisysLead, tvMine), true);
  assert.equal(isProspectInWorkspaceListScope(niovelTvLead, tvMine), false);
  assert.equal(isProspectInWorkspaceListScope(tlLead, tvMine), false);
  assert.equal(isProspectInWorkspaceListScope(tlLead, tlMine), true);
  assert.equal(isProspectInWorkspaceListScope(misleisysLead, tlMine), false);
  assert.equal(isProspectInWorkspaceListScope(misleisysLead, tvOversight), true);
  assert.equal(isProspectInWorkspaceListScope(tlLead, tvOversight), false);
});
