/**
 * Conversations ownership UX — My Prospects default vs Team Prospects oversight.
 * Implements BR-165. Does not rewrite owner_user_id.
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
  resolveWorkspaceListScope,
  isProspectInWorkspaceListScope,
  canUseOversightWorkspaceList,
  WORKSPACE_LIST_SCOPES
} = require("../security/authorizationService");
const { HIERARCHY_MODES } = require("../core/hierarchyScopeEngine");
const { ROLES } = require("../security/roles");
const { permissionsForRole } = require("../security/permissions");
const { recruitingProspectFixture } = require("./helpers/conversationsCenterRecruitingFixture");

const ORG_TV = TEAM_VISION_ORGANIZATION_ID;
const ORG_TL = "af8fb707-f26c-4152-ad77-2d079d30bc8a";
const USER_RVP = "00000000-0000-4000-8000-000000000011";
const USER_DL = "00000000-0000-4000-8000-000000000012";
const USER_AGENT = "00000000-0000-4000-8000-000000000013";
const USER_OTHER = "00000000-0000-4000-8000-000000000014";

function auth(role, userId, extra = {}) {
  return {
    userId,
    role,
    organizationId: extra.organizationId || ORG_TV,
    status: "active",
    permissions: extra.permissions || permissionsForRole(role),
    hierarchyMode: extra.hierarchyMode || null,
    hierarchyUserIds: extra.hierarchyUserIds
  };
}

function ownedProspect({ id, ownerUserId, organizationId = ORG_TV, extra = {} }) {
  return recruitingProspectFixture({
    id,
    organization_id: organizationId,
    owner_user_id: ownerUserId,
    phone: extra.phone || `+1786555${String(id).replace(/\D/g, "").slice(-4).padStart(4, "0")}`,
    name: extra.name || id,
    workflow_state: {
      atlasEligibilitySource: "QR",
      workflowOwnership: extra.workflowOwnership || "ATLAS",
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

test("mine-only default: Conversations list is owner_user_id = current user", async () => {
  const mine = resolveWorkspaceListScope(auth(ROLES.RVP, USER_RVP));
  assert.equal(mine.workspaceScope, WORKSPACE_LIST_SCOPES.MINE);
  assert.equal(mine.ownerUserId, USER_RVP);

  const model = await loadInbox({
    authContext: auth(ROLES.RVP, USER_RVP),
    prospects: [
      ownedProspect({
        id: "mine-1",
        ownerUserId: USER_RVP,
        extra: { phone: "+17865551101", workflowOwnership: "ATLAS" }
      }),
      ownedProspect({
        id: "other-1",
        ownerUserId: USER_OTHER,
        extra: { phone: "+17865551102", name: "Misleisys personal WA" }
      })
    ]
  });

  assert.equal(model.workspaceScope, WORKSPACE_LIST_SCOPES.MINE);
  assert.deepEqual(
    model.items.map((item) => item.id),
    ["mine-1"]
  );
  assert.equal(model.items[0].ownershipState, "ATLAS");
  assert.equal(model.items[0].ownerUserId, USER_RVP);
});

test("other user excluded from My Prospects even when assigned_agent_id matches", async () => {
  const otherOwned = {
    organization_id: ORG_TV,
    owner_user_id: USER_OTHER,
    assigned_agent_id: USER_RVP
  };
  const rvpMine = resolveWorkspaceListScope(auth(ROLES.RVP, USER_RVP));
  assert.equal(isProspectInWorkspaceListScope(otherOwned, rvpMine), false);

  const model = await loadInbox({
    authContext: auth(ROLES.RVP, USER_RVP),
    workspaceScope: "mine",
    prospects: [
      ownedProspect({
        id: "personal-wa-other",
        ownerUserId: USER_OTHER,
        extra: {
          phone: "+17865551103",
          assigned_agent_id: USER_RVP,
          name: "Other user's personal WhatsApp"
        }
      })
    ]
  });

  assert.equal(model.items.length, 0);
});

test("authorized leader sees downstream user under Team Prospects", async () => {
  const dlContext = auth(ROLES.DIVISION_LEADER, USER_DL, {
    hierarchyMode: HIERARCHY_MODES.SUBTREE,
    hierarchyUserIds: [USER_DL, USER_AGENT]
  });
  assert.equal(canUseOversightWorkspaceList(dlContext), true);

  const teamScope = resolveWorkspaceListScope(dlContext, "oversight");
  assert.equal(teamScope.workspaceScope, WORKSPACE_LIST_SCOPES.OVERSIGHT);
  assert.deepEqual(teamScope.ownerUserIds, [USER_DL, USER_AGENT]);

  const model = await loadInbox({
    authContext: dlContext,
    workspaceScope: "oversight",
    prospects: [
      ownedProspect({
        id: "dl-own",
        ownerUserId: USER_DL,
        extra: { phone: "+17865551104" }
      }),
      ownedProspect({
        id: "downstream",
        ownerUserId: USER_AGENT,
        extra: { phone: "+17865551105" }
      }),
      ownedProspect({
        id: "outside-tree",
        ownerUserId: USER_OTHER,
        extra: { phone: "+17865551106" }
      })
    ]
  });

  assert.equal(model.workspaceScope, WORKSPACE_LIST_SCOPES.OVERSIGHT);
  const ids = model.items.map((item) => item.id).sort();
  assert.deepEqual(ids, ["dl-own", "downstream"]);
  assert.ok(
    model.items.every((item) => item.ownershipState === "ATLAS" || item.ownershipState === "HUMAN")
  );
});

test("unauthorized user cannot access Team Prospects", async () => {
  const agentContext = auth(ROLES.AGENT, USER_AGENT);
  assert.equal(canUseOversightWorkspaceList(agentContext), false);

  const coerced = resolveWorkspaceListScope(agentContext, "oversight");
  assert.equal(coerced.workspaceScope, WORKSPACE_LIST_SCOPES.MINE);
  assert.equal(coerced.ownerUserId, USER_AGENT);

  const model = await loadInbox({
    authContext: agentContext,
    workspaceScope: "oversight",
    prospects: [
      ownedProspect({
        id: "agent-own",
        ownerUserId: USER_AGENT,
        extra: { phone: "+17865551107" }
      }),
      ownedProspect({
        id: "leader-own",
        ownerUserId: USER_RVP,
        extra: { phone: "+17865551108" }
      })
    ]
  });

  assert.equal(model.workspaceScope, WORKSPACE_LIST_SCOPES.MINE);
  assert.deepEqual(
    model.items.map((item) => item.id),
    ["agent-own"]
  );
});

test("tenant isolation preserved on mine and Team Prospects", async () => {
  const tvRvp = auth(ROLES.RVP, USER_RVP, { organizationId: ORG_TV });
  const tvOversight = resolveWorkspaceListScope(tvRvp, "oversight");
  const tlLead = { organization_id: ORG_TL, owner_user_id: USER_RVP };
  const tvLead = { organization_id: ORG_TV, owner_user_id: USER_OTHER };

  assert.equal(isProspectInWorkspaceListScope(tlLead, tvOversight), false);
  assert.equal(isProspectInWorkspaceListScope(tvLead, tvOversight), true);
  assert.equal(
    isProspectInWorkspaceListScope(tlLead, resolveWorkspaceListScope(tvRvp)),
    false
  );

  const model = await loadInbox({
    authContext: tvRvp,
    workspaceScope: "oversight",
    prospects: [
      ownedProspect({
        id: "tv-other",
        ownerUserId: USER_OTHER,
        extra: { phone: "+17865551109" }
      }),
      ownedProspect({
        id: "tl-foreign",
        ownerUserId: USER_RVP,
        organizationId: ORG_TL,
        extra: { phone: "+17865551110" }
      })
    ]
  });

  assert.deepEqual(
    model.items.map((item) => item.id),
    ["tv-other"]
  );
});
