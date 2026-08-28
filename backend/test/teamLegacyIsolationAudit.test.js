/**
 * Team Legacy isolation audit — conversations, reminders, branding, new tenant.
 * Implements BR-146 / BR-160. Does not change BR-159 or BR-161.
 */

process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("path");

const { TEAM_VISION_ORGANIZATION_ID } = require("../core/teamVisionSeedTenant");
const { SAAS_ROLES } = require("../security/saasRoles");
const { ROLES } = require("../security/roles");
const { permissionsForRole } = require("../security/permissions");
const {
  resolveEffectiveOrganizationId,
  isGlobalSuperAdminControlPlane
} = require("../core/effectiveOrganizationContext");
const {
  isProspectInConversationsTenantScope,
  isProspectInConversationsUserScope
} = require("../core/conversationsCenter/conversationsCenterAccess");
const {
  buildConversationsCenterReadModel
} = require("../core/conversationsCenter/conversationsCenterReadModel");
const {
  resolveTenantDisplayName,
  loadTenantOperationalIdentity,
  NEUTRAL_ATLAS_DISPLAY_NAME
} = require("../core/tenantOperationalIdentity");
const { buildReminderMessage, REMINDER_TYPES } = require("../services/appointmentReminderEngine");
const { buildZoomLinkMessage, buildOfficeLocationMessage } = require("../core/agentActionCopy");
const { canAccessProspect, filterProspectsForAuthContext } = require("../security/authorizationService");

const ORG_TV = TEAM_VISION_ORGANIZATION_ID;
const ORG_TL = "af8fb707-f26c-4152-ad77-2d079d30bc8a";
const ORG_NEW = "11111111-2222-4333-8444-555555555555";

const TV_PROSPECT = {
  id: "tv-1",
  phone: "+17865551001",
  name: "Vision Lead",
  organization_id: ORG_TV,
  owner_user_id: "admin-tv",
  current_step: "QUALIFICATION",
  source: "car_magnet",
  entry_method: "QR",
  appointment_status: "none",
  updated_at: "2026-08-20T12:00:00.000Z",
  workflow_state: { atlasEligibilitySource: "QR" }
};

const TL_PROSPECT = {
  id: "tl-1",
  phone: "+17865553001",
  name: "Legacy Lead",
  organization_id: ORG_TL,
  owner_user_id: "admin-tl",
  current_step: "QUALIFICATION",
  source: "car_magnet",
  entry_method: "QR",
  appointment_status: "none",
  updated_at: "2026-08-20T12:00:00.000Z",
  workflow_state: { atlasEligibilitySource: "QR" }
};

function tenantAdmin(organizationId) {
  return {
    userId: `admin-${organizationId.slice(0, 8)}`,
    organizationId,
    role: ROLES.ADMINISTRATOR,
    saasRole: SAAS_ROLES.ADMIN,
    permissions: permissionsForRole(ROLES.ADMINISTRATOR),
    status: "active"
  };
}

function superAdmin(organizationId = ORG_TV) {
  return {
    userId: "00000000-0000-4000-8000-000000000002",
    organizationId,
    role: ROLES.ADMINISTRATOR,
    saasRole: SAAS_ROLES.SUPER_ADMIN,
    permissions: permissionsForRole(ROLES.ADMINISTRATOR),
    status: "active"
  };
}

async function inbox(organizationId, authContext) {
  return buildConversationsCenterReadModel({
    organizationId,
    authContext,
    workspaceScope: "oversight",
    prospects: [TV_PROSPECT, TL_PROSPECT],
    conversationLogsByPhone: new Map()
  });
}

test("1. Team Vision Conversations = Vision only", async () => {
  const model = await inbox(ORG_TV, tenantAdmin(ORG_TV));
  assert.deepEqual(model.items.map((row) => row.id), [TV_PROSPECT.id]);
  assert.equal(model.items.some((row) => row.id === TL_PROSPECT.id), false);
});

test("2. Team Legacy Conversations = Legacy only", async () => {
  const model = await inbox(ORG_TL, tenantAdmin(ORG_TL));
  assert.deepEqual(model.items.map((row) => row.id), [TL_PROSPECT.id]);
  assert.equal(model.items.some((row) => row.id === TV_PROSPECT.id), false);
});

test("3. Team Legacy dashboard/MC/prospect helpers stay Legacy-only", () => {
  const scoped = filterProspectsForAuthContext(tenantAdmin(ORG_TL), [TV_PROSPECT, TL_PROSPECT]);
  assert.deepEqual(scoped.map((row) => row.id), [TL_PROSPECT.id]);
  assert.equal(canAccessProspect(tenantAdmin(ORG_TL), TV_PROSPECT), false);
});

test("4. Team Legacy search cannot see Vision name/phone", async () => {
  const model = await buildConversationsCenterReadModel({
    organizationId: ORG_TL,
    authContext: tenantAdmin(ORG_TL),
    workspaceScope: "oversight",
    search: "Vision",
    prospects: [TV_PROSPECT, TL_PROSPECT],
    conversationLogsByPhone: new Map()
  });
  assert.equal(model.items.length, 0);

  const byPhone = await buildConversationsCenterReadModel({
    organizationId: ORG_TL,
    authContext: tenantAdmin(ORG_TL),
    workspaceScope: "oversight",
    search: TV_PROSPECT.phone,
    prospects: [TV_PROSPECT, TL_PROSPECT],
    conversationLogsByPhone: new Map()
  });
  assert.equal(byPhone.items.length, 0);
});

test("5. Team Legacy reminders use Legacy brand/address/Zoom", () => {
  const msg = buildReminderMessage(
    {
      startDateTime: "2030-06-01T18:00:00.000Z",
      timezone: "America/New_York",
      meetingType: "virtual",
      virtualMeetingUrl: "https://zoom.example/legacy",
      metadata: { organizationDisplayName: "Team Legacy" }
    },
    REMINDER_TYPES.REMINDER_1H,
    { name: "Sam", preferred_language: "en" },
    { handoffDisplayName: "Team Legacy", displayName: "Team Legacy" }
  );
  assert.match(msg, /Team Legacy/);
  assert.match(msg, /zoom\.example\/legacy/);
  assert.doesNotMatch(msg, /Team Vision|79th|Suite 189/);
});

test("6. Missing Legacy config does not fall back to Vision", async () => {
  assert.equal(
    resolveTenantDisplayName({ organizationId: ORG_TL }),
    NEUTRAL_ATLAS_DISPLAY_NAME
  );
  assert.equal(
    resolveTenantDisplayName({ organizationId: ORG_NEW }),
    NEUTRAL_ATLAS_DISPLAY_NAME
  );

  const identity = await loadTenantOperationalIdentity(ORG_TL, {
    getOrganizationBranding: async () => null,
    getMeetingManagement: async () => ({ officeAddress: null })
  });
  assert.equal(identity.organizationName, NEUTRAL_ATLAS_DISPLAY_NAME);
  assert.equal(identity.office?.fullAddress || null, null);

  const missing = buildReminderMessage(
    {
      startDateTime: "2030-06-01T18:00:00.000Z",
      timezone: "America/New_York",
      meetingType: "in_person"
    },
    REMINDER_TYPES.REMINDER_24H,
    { name: "Sam", preferred_language: "en" },
    {}
  );
  assert.match(missing, /Atlas/);
  assert.doesNotMatch(missing, /Team Vision/);

  const zoom = buildZoomLinkMessage({ url: "https://zoom.example/x", language: "en" });
  assert.match(zoom, /Atlas/);
  assert.doesNotMatch(zoom, /Team Vision/);

  const office = buildOfficeLocationMessage({
    office: { name: "HQ", fullAddress: "1 Main St, Miami, FL 33101" },
    language: "en",
    organizationName: "Team Legacy"
  });
  assert.match(office, /Team Legacy/);
  assert.doesNotMatch(office, /Team Vision/);
});

test("7. Support Mode Vision → Legacy rebinds effective org", () => {
  const home = superAdmin(ORG_TV);
  const effective = resolveEffectiveOrganizationId(home, { organizationId: ORG_TL });
  assert.equal(effective, ORG_TL);
  assert.equal(isProspectInConversationsTenantScope(TV_PROSPECT, effective), false);
  assert.equal(isProspectInConversationsTenantScope(TL_PROSPECT, effective), true);
});

test("8. Exit Support Mode is control-plane only", () => {
  const home = superAdmin(ORG_TV);
  assert.equal(isGlobalSuperAdminControlPlane(home, null), true);
  assert.equal(resolveEffectiveOrganizationId(home, null), null);
});

test("9. Global Super Admin has no operational tenant data", async () => {
  const home = superAdmin(ORG_TV);
  assert.equal(isGlobalSuperAdminControlPlane(home, {}), true);
  assert.equal(canAccessProspect({ ...home, organizationId: null }, TV_PROSPECT), false);
  assert.equal(canAccessProspect({ ...home, organizationId: null }, TL_PROSPECT), false);
});

test("10. Arbitrary new tenant stays isolated", async () => {
  const model = await buildConversationsCenterReadModel({
    organizationId: ORG_NEW,
    authContext: tenantAdmin(ORG_NEW),
    prospects: [TV_PROSPECT, TL_PROSPECT],
    conversationLogsByPhone: new Map()
  });
  assert.deepEqual(model.items, []);
  assert.equal(resolveTenantDisplayName({ organizationId: ORG_NEW }), "Atlas");
});

test("11. Conversations cache keys include tenant and MainLayout is not hardcoded TV", () => {
  const service = fs.readFileSync(
    path.join(__dirname, "../../frontend/src/services/conversationsCenterService.js"),
    "utf8"
  );
  const page = fs.readFileSync(
    path.join(__dirname, "../../frontend/src/pages/ConversationsPage.jsx"),
    "utf8"
  );
  const layout = fs.readFileSync(
    path.join(__dirname, "../../frontend/src/layouts/MainLayout.jsx"),
    "utf8"
  );

  assert.match(service, /organizationId \|\| "none"/);
  assert.match(service, /clearConversationsCaches/);
  assert.match(page, /tenantCacheKey/);
  assert.match(page, /clearConversationsCaches/);
  assert.doesNotMatch(layout, /← Team Vision Financial/);
  assert.doesNotMatch(layout, /translate\("teamVisionRecruiting"\)/);
  assert.match(layout, /fetchOrganizationBranding/);
});

test("12. Normal tenant ADMIN/RVP behavior unchanged", () => {
  const admin = tenantAdmin(ORG_TV);
  assert.equal(isProspectInConversationsUserScope(TV_PROSPECT, ORG_TV, admin), true);
  assert.equal(canAccessProspect(admin, TV_PROSPECT), true);
  assert.equal(resolveEffectiveOrganizationId(admin, { organizationId: ORG_TL }), ORG_TV);
  assert.equal(isGlobalSuperAdminControlPlane(admin, null), false);
});
