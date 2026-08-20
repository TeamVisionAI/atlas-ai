/**
 * Canonical SaaS role is users.role; atlas_users.role is the LC1 workspace mirror.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  SAAS_ROLES,
  isSuperAdmin,
  resolveCanonicalIdentity,
  resolveCanonicalSaasRole,
  resolveLegacyWorkspaceRole
} = require("../security/saasRoles");
const { ROLES } = require("../security/roles");
const { buildAuthContext } = require("../security/authorizationService");
const { requireSuperAdmin } = require("../middleware/requireSuperAdmin");

test("SUPER_ADMIN users.role is not downgraded by atlas_users administrator", () => {
  const identity = resolveCanonicalIdentity({
    usersRole: SAAS_ROLES.SUPER_ADMIN,
    atlasRole: ROLES.ADMINISTRATOR
  });

  assert.equal(identity.saasRole, SAAS_ROLES.SUPER_ADMIN);
  assert.equal(identity.legacyRole, ROLES.ADMINISTRATOR);
  assert.equal(identity.isSuperAdmin, true);
  assert.equal(isSuperAdmin(identity.saasRole), true);
});

test("ADMIN users.role stays tenant admin when atlas_users is administrator", () => {
  const identity = resolveCanonicalIdentity({
    usersRole: SAAS_ROLES.ADMIN,
    atlasRole: ROLES.ADMINISTRATOR
  });

  assert.equal(identity.saasRole, SAAS_ROLES.ADMIN);
  assert.equal(identity.legacyRole, ROLES.ADMINISTRATOR);
  assert.equal(identity.isSuperAdmin, false);
});

test("legacy workspace role remains administrator for both platform and tenant admin", () => {
  assert.equal(
    resolveLegacyWorkspaceRole({
      atlasRole: ROLES.ADMINISTRATOR,
      saasRole: SAAS_ROLES.SUPER_ADMIN
    }),
    ROLES.ADMINISTRATOR
  );
  assert.equal(
    resolveLegacyWorkspaceRole({
      atlasRole: ROLES.ADMINISTRATOR,
      saasRole: SAAS_ROLES.ADMIN
    }),
    ROLES.ADMINISTRATOR
  );
});

test("buildAuthContext prefers users.role over atlas workspace role", () => {
  const superAdmin = buildAuthContext({
    id: "00000000-0000-4000-8000-000000000002",
    email: "support@teamvisionfinancial.com",
    role: ROLES.ADMINISTRATOR,
    users_role: SAAS_ROLES.SUPER_ADMIN,
    saas_role: SAAS_ROLES.SUPER_ADMIN
  });

  assert.equal(superAdmin.role, ROLES.ADMINISTRATOR);
  assert.equal(superAdmin.saasRole, SAAS_ROLES.SUPER_ADMIN);
  assert.equal(isSuperAdmin(superAdmin.saasRole), true);

  const tenantAdmin = buildAuthContext({
    id: "5fc05181-aebd-477d-ad96-01bcf6511495",
    email: "admin@teamvision.ai",
    role: ROLES.ADMINISTRATOR,
    users_role: SAAS_ROLES.ADMIN,
    saas_role: SAAS_ROLES.ADMIN
  });

  assert.equal(tenantAdmin.role, ROLES.ADMINISTRATOR);
  assert.equal(tenantAdmin.saasRole, SAAS_ROLES.ADMIN);
  assert.equal(isSuperAdmin(tenantAdmin.saasRole), false);
});

test("requireSuperAdmin allows SUPER_ADMIN saasRole and blocks tenant ADMIN", async () => {
  function invoke(authContext) {
    return new Promise((resolve) => {
      const res = {
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(payload) {
          resolve({ next: false, statusCode: this.statusCode, payload });
        }
      };

      requireSuperAdmin({ authContext }, res, () => resolve({ next: true }));
    });
  }

  const allowed = await invoke({
    saasRole: SAAS_ROLES.SUPER_ADMIN,
    role: ROLES.ADMINISTRATOR
  });
  const blocked = await invoke({
    saasRole: SAAS_ROLES.ADMIN,
    role: ROLES.ADMINISTRATOR
  });

  assert.equal(allowed.next, true);
  assert.equal(blocked.next, false);
  assert.equal(blocked.statusCode, 403);
});

test("administrator alone never normalizes to SUPER_ADMIN", () => {
  assert.equal(resolveCanonicalSaasRole({ atlasRole: "administrator" }), SAAS_ROLES.ADMIN);
  assert.equal(resolveCanonicalSaasRole({ usersRole: "administrator" }), SAAS_ROLES.ADMIN);
});
