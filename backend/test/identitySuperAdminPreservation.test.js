/**
 * Atlas→users sync must not downgrade an existing SUPER_ADMIN
 * when atlas_users.role is the workspace mirror "administrator".
 */

require("dotenv").config();

process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

const test = require("node:test");
const assert = require("node:assert/strict");

const savedDatabaseUrl = process.env.DATABASE_URL;
const savedDbPassword = process.env.SUPABASE_DB_PASSWORD;
delete process.env.DATABASE_URL;
delete process.env.SUPABASE_DB_PASSWORD;

const supabaseService = require("../services/supabaseService");
const identityWriteService = require("../services/identityWriteService");
const {
  mapLegacyRoleToSaas,
  buildUsersRowFromAtlasUser,
  resolveUsersRoleFromAtlasSync
} = require("../services/userIdentitySyncService");
const { SAAS_ROLES, isSuperAdmin, resolveCanonicalIdentity } = require("../security/saasRoles");
const { ROLES } = require("../security/roles");
const { buildAuthContext } = require("../security/authorizationService");

delete process.env.DATABASE_URL;
delete process.env.SUPABASE_DB_PASSWORD;

const SUPER_ID = "00000000-0000-4000-8000-000000000002";
const TENANT_ADMIN_ID = "5fc05181-aebd-477d-ad96-01bcf6511495";
const ORG_ID = "00000000-0000-4000-8000-000000000001";

const originalFrom = supabaseService.supabase.from.bind(supabaseService.supabase);
let memory = null;

function atlasAdministrator({ id, email }) {
  return {
    id,
    email,
    first_name: "Support",
    last_name: "User",
    display_name: "Support User",
    organization_id: ORG_ID,
    role: ROLES.ADMINISTRATOR,
    status: "active",
    password_hash: "hash",
    last_login_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z"
  };
}

function usersRow({ id, email, role }) {
  return {
    id,
    email,
    organization_id: ORG_ID,
    name: "Support User",
    role,
    is_active: true,
    password_hash: "hash",
    last_login: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z"
  };
}

function createMemoryDb({ atlasRows = [], usersRows = [] } = {}) {
  const atlas = new Map(atlasRows.map((row) => [String(row.id), { ...row }]));
  const users = new Map(usersRows.map((row) => [String(row.id), { ...row }]));

  function storeFor(table) {
    if (table === "atlas_users") {
      return atlas;
    }
    if (table === "users") {
      return users;
    }
    return null;
  }

  supabaseService.supabase.from = (table) => {
    const store = storeFor(table);
    let operation = "select";
    let patch = null;
    let filterId = null;

    async function execute() {
      if (!store) {
        return { data: null, error: { code: "42P01", message: "missing table" } };
      }

      if (operation === "upsert") {
        const id = String(patch.id);
        store.set(id, { ...(store.get(id) || {}), ...patch });
        return { data: store.get(id), error: null };
      }

      if (operation === "update") {
        if (!filterId || !store.has(String(filterId))) {
          return { data: null, error: null };
        }
        const next = { ...store.get(String(filterId)), ...patch };
        store.set(String(filterId), next);
        return { data: next, error: null };
      }

      if (filterId) {
        return { data: store.get(String(filterId)) || null, error: null };
      }

      return { data: [...store.values()], error: null };
    }

    const chain = {
      select() {
        return chain;
      },
      eq(_column, value) {
        filterId = value;
        return chain;
      },
      update(row) {
        operation = "update";
        patch = row;
        return chain;
      },
      upsert(row) {
        operation = "upsert";
        patch = row;
        return execute();
      },
      maybeSingle: execute,
      single: execute,
      then(resolve, reject) {
        return execute().then(resolve, reject);
      }
    };

    return chain;
  };

  return { atlas, users };
}

function serializeAuthMe(mergedUser) {
  const authContext = buildAuthContext(mergedUser);
  return {
    role: mergedUser.role,
    saasRole: authContext.saasRole || null,
    isSuperAdmin: isSuperAdmin(authContext.saasRole)
  };
}

test.beforeEach(() => {
  delete process.env.DATABASE_URL;
  delete process.env.SUPABASE_DB_PASSWORD;
});

test.afterEach(() => {
  supabaseService.supabase.from = originalFrom;
  memory = null;
});

test.after(() => {
  if (savedDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = savedDatabaseUrl;
  }
  if (savedDbPassword === undefined) {
    delete process.env.SUPABASE_DB_PASSWORD;
  } else {
    process.env.SUPABASE_DB_PASSWORD = savedDbPassword;
  }
});

test("atlas administrator never maps to SUPER_ADMIN", () => {
  assert.equal(mapLegacyRoleToSaas("administrator"), SAAS_ROLES.ADMIN);
  assert.equal(
    resolveUsersRoleFromAtlasSync({ atlasRole: "administrator" }),
    SAAS_ROLES.ADMIN
  );
  assert.equal(
    buildUsersRowFromAtlasUser(atlasAdministrator({ id: SUPER_ID, email: "a@example.com" })).role,
    SAAS_ROLES.ADMIN
  );
});

test("existing SUPER_ADMIN is preserved; existing ADMIN stays ADMIN", () => {
  assert.equal(
    resolveUsersRoleFromAtlasSync({
      atlasRole: "administrator",
      existingUsersRole: SAAS_ROLES.SUPER_ADMIN
    }),
    SAAS_ROLES.SUPER_ADMIN
  );
  assert.equal(
    resolveUsersRoleFromAtlasSync({
      atlasRole: "administrator",
      existingUsersRole: SAAS_ROLES.ADMIN
    }),
    SAAS_ROLES.ADMIN
  );
});

test("recordLastLogin does not downgrade existing SUPER_ADMIN", async () => {
  memory = createMemoryDb({
    atlasRows: [atlasAdministrator({ id: SUPER_ID, email: "support@teamvisionfinancial.com" })],
    usersRows: [
      usersRow({
        id: SUPER_ID,
        email: "support@teamvisionfinancial.com",
        role: SAAS_ROLES.SUPER_ADMIN
      })
    ]
  });

  await identityWriteService.recordLastLogin(SUPER_ID);
  assert.equal(memory.users.get(SUPER_ID).role, SAAS_ROLES.SUPER_ADMIN);
  assert.ok(memory.users.get(SUPER_ID).last_login);
});

test("repairIdentityFromAtlas preserves existing SUPER_ADMIN", async () => {
  memory = createMemoryDb({
    atlasRows: [atlasAdministrator({ id: SUPER_ID, email: "support@teamvisionfinancial.com" })],
    usersRows: [
      usersRow({
        id: SUPER_ID,
        email: "support@teamvisionfinancial.com",
        role: SAAS_ROLES.SUPER_ADMIN
      })
    ]
  });

  await identityWriteService.repairIdentityFromAtlas(SUPER_ID);
  assert.equal(memory.users.get(SUPER_ID).role, SAAS_ROLES.SUPER_ADMIN);
});

test("upsertUsersRowFromAtlas preserves existing SUPER_ADMIN", async () => {
  memory = createMemoryDb({
    atlasRows: [atlasAdministrator({ id: SUPER_ID, email: "support@teamvisionfinancial.com" })],
    usersRows: [
      usersRow({
        id: SUPER_ID,
        email: "support@teamvisionfinancial.com",
        role: SAAS_ROLES.SUPER_ADMIN
      })
    ]
  });

  const written = await identityWriteService.upsertUsersRowFromAtlas(
    atlasAdministrator({ id: SUPER_ID, email: "support@teamvisionfinancial.com" })
  );
  assert.equal(written.role, SAAS_ROLES.SUPER_ADMIN);
  assert.equal(memory.users.get(SUPER_ID).role, SAAS_ROLES.SUPER_ADMIN);
});

test("existing ADMIN + atlas administrator remains ADMIN", async () => {
  memory = createMemoryDb({
    atlasRows: [atlasAdministrator({ id: TENANT_ADMIN_ID, email: "admin@teamvision.ai" })],
    usersRows: [
      usersRow({
        id: TENANT_ADMIN_ID,
        email: "admin@teamvision.ai",
        role: SAAS_ROLES.ADMIN
      })
    ]
  });

  await identityWriteService.upsertUsersRowFromAtlas(
    atlasAdministrator({ id: TENANT_ADMIN_ID, email: "admin@teamvision.ai" })
  );
  await identityWriteService.recordLastLogin(TENANT_ADMIN_ID);
  assert.equal(memory.users.get(TENANT_ADMIN_ID).role, SAAS_ROLES.ADMIN);
});

test("missing users row + atlas administrator creates ADMIN, never SUPER_ADMIN", async () => {
  memory = createMemoryDb({
    atlasRows: [atlasAdministrator({ id: SUPER_ID, email: "support@teamvisionfinancial.com" })],
    usersRows: []
  });

  await identityWriteService.upsertUsersRowFromAtlas(
    atlasAdministrator({ id: SUPER_ID, email: "support@teamvisionfinancial.com" })
  );
  assert.equal(memory.users.get(SUPER_ID).role, SAAS_ROLES.ADMIN);
  assert.notEqual(memory.users.get(SUPER_ID).role, SAAS_ROLES.SUPER_ADMIN);
});

test("/auth/me serialization after preserved SUPER_ADMIN", () => {
  const identity = resolveCanonicalIdentity({
    usersRole: SAAS_ROLES.SUPER_ADMIN,
    atlasRole: ROLES.ADMINISTRATOR
  });
  const me = serializeAuthMe({
    id: SUPER_ID,
    email: "support@teamvisionfinancial.com",
    role: identity.legacyRole,
    users_role: SAAS_ROLES.SUPER_ADMIN,
    saas_role: identity.saasRole
  });

  assert.equal(me.role, "administrator");
  assert.equal(me.saasRole, SAAS_ROLES.SUPER_ADMIN);
  assert.equal(me.isSuperAdmin, true);
});

test("compareIdentityRows does not treat preserved SUPER_ADMIN as drift", () => {
  const issues = identityWriteService.compareIdentityRows(
    atlasAdministrator({ id: SUPER_ID, email: "support@teamvisionfinancial.com" }),
    usersRow({
      id: SUPER_ID,
      email: "support@teamvisionfinancial.com",
      role: SAAS_ROLES.SUPER_ADMIN
    })
  );
  assert.equal(issues.some((issue) => issue.field === "role"), false);
});

test("tenant admin /auth/me stays ADMIN", () => {
  const identity = resolveCanonicalIdentity({
    usersRole: SAAS_ROLES.ADMIN,
    atlasRole: ROLES.ADMINISTRATOR
  });
  const me = serializeAuthMe({
    id: TENANT_ADMIN_ID,
    email: "admin@teamvision.ai",
    role: identity.legacyRole,
    users_role: SAAS_ROLES.ADMIN,
    saas_role: identity.saasRole
  });

  assert.equal(me.role, "administrator");
  assert.equal(me.saasRole, SAAS_ROLES.ADMIN);
  assert.equal(me.isSuperAdmin, false);
});
