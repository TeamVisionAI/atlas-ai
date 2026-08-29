/**
 * Platform-wide personal WhatsApp privacy + Conversations ownership.
 * Ordinary personal contacts stay out of operational surfaces for every tenant.
 * Does not rewrite owner_user_id.
 */

require("dotenv").config();
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";
process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");

const { TEAM_VISION_ORGANIZATION_ID } = require("../core/teamVisionSeedTenant");
const { buildConversationsCenterReadModel } = require("../core/conversationsCenter/conversationsCenterReadModel");
const {
  evaluateRecruitingInboxEligibility
} = require("../core/conversationsCenter/conversationsCenterInboxEligibility");
const {
  evaluateProspectPromotion,
  isOperationalProspectRecord
} = require("../core/prospectPromotionEligibility");
const {
  resolveWorkspaceListScope,
  isProspectInWorkspaceListScope,
  WORKSPACE_LIST_SCOPES
} = require("../security/authorizationService");
const { HIERARCHY_MODES } = require("../core/hierarchyScopeEngine");
const { ROLES } = require("../security/roles");
const { permissionsForRole } = require("../security/permissions");
const { recruitingProspectFixture } = require("./helpers/conversationsCenterRecruitingFixture");

const ORG_A = TEAM_VISION_ORGANIZATION_ID;
const ORG_B = "af8fb707-f26c-4152-ad77-2d079d30bc8a";
const USER_LEADER_A = "11111111-1111-4111-8111-111111111111";
const USER_AGENT_A = "22222222-2222-4222-8222-222222222222";
const USER_OTHER_A = "33333333-3333-4333-8333-333333333333";
const USER_LEADER_B = "44444444-4444-4444-8444-444444444444";

function auth(role, userId, extra = {}) {
  return {
    userId,
    role,
    organizationId: extra.organizationId || ORG_A,
    status: "active",
    permissions: extra.permissions || permissionsForRole(role),
    hierarchyMode: extra.hierarchyMode || null,
    hierarchyUserIds: extra.hierarchyUserIds
  };
}

function row({
  id,
  ownerUserId,
  organizationId = ORG_A,
  eligibilitySource = null,
  source = "UNKNOWN",
  entryMethod = "UNATTRIBUTED",
  extra = {}
}) {
  return recruitingProspectFixture({
    id,
    organization_id: organizationId,
    owner_user_id: ownerUserId,
    source,
    entry_method: entryMethod,
    phone: extra.phone || `+1786555${String(id).replace(/\D/g, "").slice(-4).padStart(4, "0")}`,
    name: extra.name || id,
    workflow_state: {
      atlasEligibilitySource: eligibilitySource,
      ...(extra.workflow_state || {})
    },
    ...extra
  });
}

async function loadInbox({ authContext, workspaceScope = null, prospects }) {
  return buildConversationsCenterReadModel({
    organizationId: authContext.organizationId,
    authContext,
    workspaceScope,
    prospects,
    conversationLogsByPhone: new Map(),
    persistWindowArchive: false,
    view: "full"
  });
}

test("My Prospects is owner_user_id === current user only", async () => {
  const mine = resolveWorkspaceListScope(auth(ROLES.RVP, USER_LEADER_A));
  assert.equal(mine.workspaceScope, WORKSPACE_LIST_SCOPES.MINE);
  assert.equal(mine.ownerUserId, USER_LEADER_A);

  const owned = row({
    id: "leader-qr",
    ownerUserId: USER_LEADER_A,
    eligibilitySource: "QR",
    source: "car_magnet",
    entryMethod: "QR",
    extra: { phone: "+17865552001" }
  });
  assert.equal(isProspectInWorkspaceListScope(owned, mine), true);

  const model = await loadInbox({
    authContext: auth(ROLES.RVP, USER_LEADER_A),
    workspaceScope: "mine",
    prospects: [
      owned,
      row({
        id: "other-qr",
        ownerUserId: USER_OTHER_A,
        eligibilitySource: "QR",
        source: "car_magnet",
        entryMethod: "QR",
        extra: { phone: "+17865552002" }
      })
    ]
  });
  assert.deepEqual(
    model.items.map((item) => item.id),
    ["leader-qr"]
  );
});

test("other-user-owned Atlas row is excluded from My Prospects", async () => {
  const otherOwned = {
    organization_id: ORG_A,
    owner_user_id: USER_AGENT_A,
    assigned_agent_id: USER_LEADER_A
  };
  const mine = resolveWorkspaceListScope(auth(ROLES.RVP, USER_LEADER_A), "mine");
  assert.equal(isProspectInWorkspaceListScope(otherOwned, mine), false);
});

test("ordinary personal contact is hidden from the owner workspace", async () => {
  const personal = row({
    id: "personal-owner",
    ownerUserId: USER_AGENT_A,
    eligibilitySource: "PERSONAL_WHATSAPP",
    extra: { phone: "+17865552003", name: "Ordinary personal" }
  });

  assert.equal(
    evaluateProspectPromotion({
      whatsappConnectionSource: "whatsapp_personal_connection"
    }).promote,
    false
  );
  assert.equal(isOperationalProspectRecord(personal), false);
  assert.equal(
    evaluateRecruitingInboxEligibility(personal, personal.workflow_state).eligible,
    false
  );

  const model = await loadInbox({
    authContext: auth(ROLES.AGENT, USER_AGENT_A),
    workspaceScope: "mine",
    prospects: [
      personal,
      row({
        id: "owner-qr",
        ownerUserId: USER_AGENT_A,
        eligibilitySource: "QR",
        source: "car_magnet",
        entryMethod: "QR",
        extra: { phone: "+17865552004" }
      })
    ]
  });
  assert.deepEqual(
    model.items.map((item) => item.id),
    ["owner-qr"]
  );
});

test("ordinary downstream personal contact is hidden from leader Team Prospects", async () => {
  const dl = auth(ROLES.DIVISION_LEADER, USER_LEADER_A, {
    hierarchyMode: HIERARCHY_MODES.SUBTREE,
    hierarchyUserIds: [USER_LEADER_A, USER_AGENT_A]
  });
  const model = await loadInbox({
    authContext: dl,
    workspaceScope: "oversight",
    prospects: [
      row({
        id: "downstream-personal",
        ownerUserId: USER_AGENT_A,
        eligibilitySource: "PERSONAL_WHATSAPP",
        extra: { phone: "+17865552005" }
      }),
      row({
        id: "downstream-qr",
        ownerUserId: USER_AGENT_A,
        eligibilitySource: "QR",
        source: "car_magnet",
        entryMethod: "QR",
        extra: { phone: "+17865552006" }
      })
    ]
  });
  assert.equal(model.workspaceScope, WORKSPACE_LIST_SCOPES.OVERSIGHT);
  assert.deepEqual(
    model.items.map((item) => item.id),
    ["downstream-qr"]
  );
});

test("valid ad/intake personal-channel lead remains visible", async () => {
  const adLead = row({
    id: "personal-ctwa",
    ownerUserId: USER_AGENT_A,
    eligibilitySource: "CTWA_REFERRAL",
    source: "PERSONAL_WHATSAPP",
    entryMethod: "PERSONAL_WHATSAPP",
    extra: { phone: "+17865552007" }
  });
  const intakeLead = row({
    id: "personal-intake",
    ownerUserId: USER_AGENT_A,
    eligibilitySource: "CAMPAIGN_INTAKE_CODE",
    source: "CAMPAIGN_INTAKE",
    entryMethod: "CAMPAIGN_INTAKE_CODE",
    extra: { phone: "+17865552008" }
  });

  assert.equal(isOperationalProspectRecord(adLead), true);
  assert.equal(isOperationalProspectRecord(intakeLead), true);
  assert.equal(
    evaluateRecruitingInboxEligibility(adLead, adLead.workflow_state).eligible,
    true
  );

  const model = await loadInbox({
    authContext: auth(ROLES.AGENT, USER_AGENT_A),
    workspaceScope: "mine",
    prospects: [
      adLead,
      intakeLead,
      row({
        id: "ordinary",
        ownerUserId: USER_AGENT_A,
        eligibilitySource: "PERSONAL_WHATSAPP",
        extra: { phone: "+17865552009" }
      })
    ]
  });
  assert.deepEqual(
    model.items.map((item) => item.id).sort(),
    ["personal-ctwa", "personal-intake"]
  );
});

test("Team Prospects is hierarchy-only valid Atlas leads", async () => {
  const dl = auth(ROLES.DIVISION_LEADER, USER_LEADER_A, {
    hierarchyMode: HIERARCHY_MODES.SUBTREE,
    hierarchyUserIds: [USER_LEADER_A, USER_AGENT_A]
  });
  const model = await loadInbox({
    authContext: dl,
    workspaceScope: "oversight",
    prospects: [
      row({
        id: "outside-tree",
        ownerUserId: USER_OTHER_A,
        eligibilitySource: "QR",
        source: "car_magnet",
        entryMethod: "QR",
        extra: { phone: "+17865552010" }
      }),
      row({
        id: "in-tree",
        ownerUserId: USER_AGENT_A,
        eligibilitySource: "QR",
        source: "car_magnet",
        entryMethod: "QR",
        extra: { phone: "+17865552011" }
      })
    ]
  });
  assert.deepEqual(
    model.items.map((item) => item.id),
    ["in-tree"]
  );
});

test("tenant isolation preserved for personal and Atlas rows", async () => {
  const tvLeader = auth(ROLES.RVP, USER_LEADER_A, { organizationId: ORG_A });
  const tlLead = {
    organization_id: ORG_B,
    owner_user_id: USER_LEADER_B,
    source: "PERSONAL_WHATSAPP",
    entry_method: "PERSONAL_WHATSAPP"
  };
  const tvOversight = resolveWorkspaceListScope(tvLeader, "oversight");
  assert.equal(isProspectInWorkspaceListScope(tlLead, tvOversight), false);

  const model = await loadInbox({
    authContext: tvLeader,
    workspaceScope: "oversight",
    prospects: [
      row({
        id: "tv-ad",
        ownerUserId: USER_OTHER_A,
        organizationId: ORG_A,
        eligibilitySource: "CTWA_REFERRAL",
        extra: { phone: "+17865552012" }
      }),
      row({
        id: "org-b-ad",
        ownerUserId: USER_LEADER_B,
        organizationId: ORG_B,
        eligibilitySource: "CTWA_REFERRAL",
        extra: { phone: "+17865552013" }
      }),
      row({
        id: "org-b-personal",
        ownerUserId: USER_LEADER_B,
        organizationId: ORG_B,
        eligibilitySource: "PERSONAL_WHATSAPP",
        extra: { phone: "+17865552014" }
      })
    ]
  });
  assert.deepEqual(
    model.items.map((item) => item.id),
    ["tv-ad"]
  );
});
