/**
 * Sprint 19.1 — Verify Administration → Users list resolves workspace org from atlas_users.
 * Run: node backend/dev/verifyAdminUsersList.js
 */

require("dotenv").config();

const { supabase } = require("../services/supabaseService");
const { findUserByEmail } = require("../services/atlasUserService");
const { buildAuthContext } = require("../security/authorizationService");
const { resolveWorkspaceOrganizationId } = require("../core/tenantOrganization");
const identityAdminService = require("../services/identityAdminService");
const { DEFAULT_ORGANIZATION_ID } = require("../modules/prospects/domain/constants");

const SUPPORT_EMAIL = "support@teamvisionfinancial.com";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  console.log("=== Admin Users List Verification ===\n");

  const supportUser = await findUserByEmail(SUPPORT_EMAIL);

  if (!supportUser) {
    console.warn(`⚠ ${SUPPORT_EMAIL} not found in atlas_users — using synthetic auth context`);
  } else {
    console.log("atlas_users row:", {
      id: supportUser.id,
      email: supportUser.email,
      role: supportUser.role,
      status: supportUser.status,
      organization_id: supportUser.organization_id
    });

    const { data: usersRow } = await supabase
      .from("users")
      .select("id, email, organization_id, role")
      .eq("id", supportUser.id)
      .maybeSingle();

    console.log("users table row:", usersRow || null);

    const { count: orgUserCount } = await supabase
      .from("atlas_users")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", supportUser.organization_id);

    console.log(`atlas_users in workspace ${supportUser.organization_id}:`, orgUserCount ?? 0);
  }

  const atlasOrg = supportUser?.organization_id || DEFAULT_ORGANIZATION_ID;
  const wrongOrgContext = buildAuthContext({
    id: supportUser?.id || "00000000-0000-4000-8000-000000000099",
    email: SUPPORT_EMAIL,
    role: "administrator",
    status: "active",
    organization_id: DEFAULT_ORGANIZATION_ID
  });

  if (supportUser && String(atlasOrg) !== String(DEFAULT_ORGANIZATION_ID)) {
    wrongOrgContext.organizationId = DEFAULT_ORGANIZATION_ID;
  } else {
    wrongOrgContext.organizationId = "00000000-0000-4000-8000-000000000002";
  }

  const resolvedOrg = await resolveWorkspaceOrganizationId(wrongOrgContext);
  console.log("\nresolveWorkspaceOrganizationId (stale authContext):", {
    authContextOrg: wrongOrgContext.organizationId,
    resolvedOrg,
    atlasOrg
  });

  assert(String(resolvedOrg) === String(atlasOrg), "Workspace org must come from atlas_users, not stale authContext");

  const listResult = await identityAdminService.listUsers({ limit: 50 }, wrongOrgContext);
  console.log("\nlistUsers with stale authContext:", {
    total: listResult.total,
    returned: listResult.items.length
  });

  assert(listResult.total > 0, "listUsers must return workspace users when atlas_users org differs from authContext");

  const buggyParamsResult = await identityAdminService.listUsers(
    { limit: 50, q: "undefined", status: "undefined" },
    wrongOrgContext
  );
  assert(
    buggyParamsResult.total > 0,
    "listUsers must ignore q/status=undefined query params"
  );

  if (supportUser) {
    const emails = listResult.items.map((item) => item.email);
    assert(
      emails.includes(SUPPORT_EMAIL),
      `${SUPPORT_EMAIL} must appear in admin user list`
    );
  }

  console.log("\n=== All admin users list checks passed ===");
}

main().catch((error) => {
  console.error("\n✗ FAIL:", error.message);
  process.exit(1);
});
