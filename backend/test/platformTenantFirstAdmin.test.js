process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";
process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isFirstAdminCandidate,
  presentFirstAdmin,
  resolveFirstAdminFromLoadedUsers,
  hasAssignedFirstAdmin
} = require("../core/platformTenantFirstAdmin");
const { presentTenant } = require("../services/platformTenantService");

const ORG = "org-overcomers";
const JOSSY = {
  id: "user-jossy",
  organization_id: ORG,
  first_name: "Jossy",
  last_name: "Diaz",
  display_name: "Jossy Diaz",
  email: "jossy@example.com",
  status: "pending_invitation",
  role: "administrator",
  business_rank: "RVP",
  created_at: "2026-08-20T00:00:00.000Z"
};

test("pending invitation admin is a first-admin candidate", () => {
  assert.equal(isFirstAdminCandidate(JOSSY), true);
  const presented = presentFirstAdmin(JOSSY);
  assert.equal(presented.invitationPending, true);
  assert.equal(presented.displayName, "Jossy Diaz");
});

test("resolve prefers owner, then earliest pending/active tenant admin", () => {
  const laterAdmin = {
    ...JOSSY,
    id: "user-later",
    first_name: "Later",
    created_at: "2026-08-25T00:00:00.000Z"
  };

  const pending = resolveFirstAdminFromLoadedUsers({
    ownerUserId: null,
    organizationId: ORG,
    users: [laterAdmin, JOSSY]
  });
  assert.equal(pending.id, JOSSY.id);

  const owned = resolveFirstAdminFromLoadedUsers({
    ownerUserId: laterAdmin.id,
    organizationId: ORG,
    users: [laterAdmin, JOSSY]
  });
  assert.equal(owned.id, laterAdmin.id);
});

test("Super Admin is not used as a fallback first-admin candidate", () => {
  const superAdmin = {
    id: "sa-1",
    organization_id: ORG,
    first_name: "Niovel",
    last_name: "Perez",
    email: "sa@example.com",
    status: "active",
    role: "SUPER_ADMIN",
    saas_role: "SUPER_ADMIN",
    created_at: "2026-01-01T00:00:00.000Z"
  };

  const resolved = resolveFirstAdminFromLoadedUsers({
    ownerUserId: null,
    organizationId: ORG,
    users: [superAdmin, JOSSY]
  });
  assert.equal(resolved.id, JOSSY.id);
});

test("archived owner yields to an active tenant RVP/admin", () => {
  const archivedOwner = {
    ...JOSSY,
    id: "user-archived",
    status: "archived"
  };
  const activeRvp = {
    id: "user-active-rvp",
    organization_id: ORG,
    first_name: "Josylady",
    last_name: "De Alvarado",
    display_name: "Josylady De Alvarado",
    email: "josylady@example.com",
    status: "active",
    role: "rvp",
    business_rank: "RVP",
    created_at: "2026-08-21T00:00:00.000Z"
  };

  const resolved = resolveFirstAdminFromLoadedUsers({
    ownerUserId: archivedOwner.id,
    organizationId: ORG,
    users: [archivedOwner, activeRvp]
  });

  assert.equal(resolved.id, activeRvp.id);
  assert.equal(resolved.invitationPending, false);
  assert.equal(
    hasAssignedFirstAdmin({ ownerUserId: archivedOwner.id, firstAdmin: resolved }),
    true
  );
});

test("presentTenant never requires the UI to show a raw owner UUID", () => {
  const dto = presentTenant(
    {
      id: ORG,
      name: "Team Overcomers",
      slug: "team-overcomers",
      owner_user_id: JOSSY.id,
      status: "trial",
      is_active: true
    },
    null,
    presentFirstAdmin(JOSSY)
  );

  assert.equal(dto.hasFirstAdmin, true);
  assert.equal(dto.firstAdmin.email, "jossy@example.com");
  assert.equal(dto.firstAdmin.invitationPending, true);
  assert.equal(hasAssignedFirstAdmin(dto), true);
});
