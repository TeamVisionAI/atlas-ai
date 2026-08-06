/**
 * Migration 030 — harden public.sync_atlas_users_from_users search_path / EXECUTE.
 *
 * Default suite is production-safe (SQL + contract).
 * Optional transactional dry-run (apply + probe + ROLLBACK) when:
 *   ATLAS_030_LIVE_DRY_RUN=1
 */

require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ROLE_MAP,
  mapLegacyRole,
  splitDisplayName,
  mapUsersRowToAtlasUsersSync
} = require("../core/syncAtlasUsersFromUsersContract");
const { sanitizeUser } = require("../services/atlasUserService");

const MIGRATION_PATH = path.join(
  __dirname,
  "../database/migrations/030_fix_sync_atlas_users_search_path.sql"
);
const DOWN_PATH = path.join(
  __dirname,
  "../database/migrations/030_fix_sync_atlas_users_search_path_down.sql"
);
const M017_PATH = path.join(__dirname, "../database/migrations/017_rep_id.sql");
const M029_PATH = path.join(
  __dirname,
  "../database/migrations/029_rls_backend_only_public_tables.sql"
);

const LIVE_DRY_RUN = process.env.ATLAS_030_LIVE_DRY_RUN === "1";

function loadSql(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function stripSqlComments(sql) {
  return sql
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

function migrationBodyWithoutTxn(sql) {
  return stripSqlComments(sql)
    .replace(/^\s*BEGIN\s*;/im, "")
    .replace(/\bCOMMIT\s*;\s*$/im, "");
}

test("030 pins search_path, stays SECURITY INVOKER VOLATILE, no DEFINER/dynamic SQL", () => {
  const sql = loadSql(MIGRATION_PATH);
  const body = stripSqlComments(sql);
  assert.match(body, /SET\s+search_path\s+TO\s+pg_catalog,\s*public/i);
  assert.match(body, /SECURITY\s+INVOKER/i);
  assert.match(body, /\bVOLATILE\b/i);
  assert.doesNotMatch(body, /SECURITY\s+DEFINER/i);
  assert.doesNotMatch(body, /\bEXECUTE\s+IMMEDIATE\b|\bEXECUTE\s+format\s*\(|\bEXECUTE\s+'/i);
  assert.doesNotMatch(body, /DROP\s+TRIGGER/i);
  assert.doesNotMatch(body, /CREATE\s+TRIGGER/i);
  assert.match(sql, /^\s*BEGIN\s*;/im);
  assert.match(sql, /\bCOMMIT\s*;\s*$/im);
});

test("030 fully qualifies atlas_users and selected builtins; no unqualified table refs", () => {
  const body = stripSqlComments(loadSql(MIGRATION_PATH));
  assert.match(body, /DELETE\s+FROM\s+public\.atlas_users/i);
  assert.match(body, /INSERT\s+INTO\s+public\.atlas_users/i);
  assert.match(body, /public\.atlas_users\.password_hash/i);
  assert.match(body, /pg_catalog\.split_part\s*\(/i);
  assert.match(body, /pg_catalog\.lower\s*\(/i);
  assert.match(body, /pg_catalog\.replace\s*\(/i);
  // COALESCE is a SQL special form; pin + qualified atlas_users column is the safe pattern.
  assert.match(body, /COALESCE\s*\(\s*EXCLUDED\.password_hash,\s*public\.atlas_users\.password_hash\s*\)/i);
  assert.match(body, /pg_catalog\.now\s*\(\s*\)/i);
  assert.match(body, /NULLIF\s*\(\s*TRIM\s*\(\s*SUBSTRING/i);
  assert.match(body, /POSITION\s*\(/i);
  assert.doesNotMatch(body, /DELETE\s+FROM\s+atlas_users\b/i);
  assert.doesNotMatch(body, /INSERT\s+INTO\s+atlas_users\b/i);
  const unqualified = body.match(/(?:FROM|INTO|UPDATE)\s+(?!public\.)atlas_users\b/gi);
  assert.equal(unqualified, null);
});

test("030 revokes direct EXECUTE from PUBLIC/anon/authenticated; grants service_role", () => {
  const sql = loadSql(MIGRATION_PATH);
  assert.match(
    sql,
    /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.sync_atlas_users_from_users\s*\(\s*\)\s+FROM\s+PUBLIC/i
  );
  assert.match(
    sql,
    /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.sync_atlas_users_from_users\s*\(\s*\)\s+FROM\s+anon/i
  );
  assert.match(
    sql,
    /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.sync_atlas_users_from_users\s*\(\s*\)\s+FROM\s+authenticated/i
  );
  assert.match(
    sql,
    /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.sync_atlas_users_from_users\s*\(\s*\)\s+TO\s+service_role/i
  );
});

test("030 preserves 017 role CASE + rep_id and does not touch Meta Review fields", () => {
  const sql030 = loadSql(MIGRATION_PATH);
  const sql017 = loadSql(M017_PATH);
  const body = stripSqlComments(sql030);
  for (const role of Object.keys(ROLE_MAP)) {
    assert.match(sql030, new RegExp(`WHEN\\s+'${role}'\\s+THEN`, "i"));
    assert.match(sql017, new RegExp(`WHEN\\s+'${role}'\\s+THEN`, "i"));
  }
  assert.match(body, /NEW\.rep_id/);
  assert.match(body, /rep_id\s*=\s*EXCLUDED\.rep_id/);
  assert.doesNotMatch(body, /meta_review_user/i);
  assert.doesNotMatch(body, /profile_settings/i);
});

test("030 does not modify migration 029 contents", () => {
  const m029 = loadSql(M029_PATH);
  assert.match(m029, /029_rls_backend_only_public_tables|Backend-only RLS/i);
  assert.doesNotMatch(m029, /sync_atlas_users_from_users/i);
  assert.doesNotMatch(loadSql(MIGRATION_PATH), /ENABLE ROW LEVEL SECURITY/i);
});

test("030 down restores mutable search_path body and prior EXECUTE grants", () => {
  const down = loadSql(DOWN_PATH);
  const body = stripSqlComments(down);
  assert.match(down, /WARNING/i);
  assert.doesNotMatch(body, /SET\s+search_path/i);
  assert.match(body, /INSERT\s+INTO\s+atlas_users/i);
  assert.match(down, /GRANT\s+EXECUTE[\s\S]*TO\s+PUBLIC/i);
  assert.match(down, /GRANT\s+EXECUTE[\s\S]*TO\s+anon/i);
  assert.match(down, /GRANT\s+EXECUTE[\s\S]*TO\s+authenticated/i);
  assert.match(down, /GRANT\s+EXECUTE[\s\S]*TO\s+service_role/i);
});

test("sync contract maps INSERT/UPDATE fields identically to 017 semantics", () => {
  const mapped = mapUsersRowToAtlasUsersSync({
    id: "00000000-0000-4000-8000-000000000099",
    email: "ana@example.com",
    name: "Ana Perez",
    organization_id: "00000000-0000-4000-8000-000000000001",
    role: "RVP",
    is_active: true,
    password_hash: "hash",
    rep_id: "4XHKH",
    last_login: "2026-08-01T12:00:00.000Z",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-08-01T12:00:00.000Z"
  });
  assert.deepEqual(mapped, {
    id: "00000000-0000-4000-8000-000000000099",
    email: "ana@example.com",
    first_name: "Ana",
    last_name: "Perez",
    display_name: "Ana Perez",
    organization_id: "00000000-0000-4000-8000-000000000001",
    role: "rvp",
    status: "active",
    password_hash: "hash",
    rep_id: "4XHKH",
    last_login_at: "2026-08-01T12:00:00.000Z",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-08-01T12:00:00.000Z"
  });
});

test("sync contract preserves inactive/single-name/null rep_id handling", () => {
  const mapped = mapUsersRowToAtlasUsersSync({
    id: "u2",
    email: "solo@example.com",
    name: "Solo",
    organization_id: "org",
    role: "REPRESENTATIVE",
    is_active: false,
    password_hash: null,
    rep_id: null,
    last_login: null,
    created_at: "t0",
    updated_at: "t1"
  });
  assert.equal(mapped.role, "recruiter");
  assert.equal(mapped.status, "suspended");
  assert.equal(mapped.first_name, "Solo");
  assert.equal(mapped.last_name, null);
  assert.equal(mapped.rep_id, null);
  assert.equal(mapLegacyRole("CUSTOM_ROLE"), "custom role");
  assert.deepEqual(splitDisplayName("Maria  Lopez"), {
    firstName: "Maria",
    lastName: "Lopez",
    displayName: "Maria  Lopez"
  });
});

test("Meta Review identity remains outside sync contract and sanitizeUser", () => {
  const review = sanitizeUser({
    id: "00000000-0000-4000-8000-000000000100",
    email: "review@example.com",
    first_name: "Meta",
    last_name: "Reviewer",
    role: "recruiter",
    status: "active",
    organization_id: "00000000-0000-4000-8000-000000000001",
    rep_id: null,
    profile_settings: { meta_review_user: true }
  });
  assert.equal(review.meta_review_user, true);
  assert.equal(Object.prototype.hasOwnProperty.call(review, "profile_settings"), false);
  const synced = mapUsersRowToAtlasUsersSync({
    id: review.id,
    email: review.email,
    name: "Meta Reviewer",
    organization_id: review.organization_id,
    role: "REPRESENTATIVE",
    is_active: true,
    password_hash: "x",
    rep_id: null,
    last_login: null,
    created_at: "t0",
    updated_at: "t1"
  });
  assert.equal(Object.prototype.hasOwnProperty.call(synced, "profile_settings"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(synced, "meta_review_user"), false);
});

async function runTransactionalDryRun() {
  const { Client } = require("pg");
  const pg = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await pg.connect();

  const orgId = "00000000-0000-4000-8000-000000000001";
  const userId = crypto.randomUUID();
  const email = `rls030.probe.${userId.slice(0, 8)}@example.invalid`;

  try {
    await pg.query("BEGIN");

    // Apply 030 body inside this transaction (no nested COMMIT).
    await pg.query(migrationBodyWithoutTxn(loadSql(MIGRATION_PATH)));

    const fn = await pg.query(`
      SELECT p.proconfig,
             p.prosecdef AS security_definer,
             CASE p.provolatile WHEN 'v' THEN 'VOLATILE' END AS volatility,
             pg_get_functiondef(p.oid) AS def
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'sync_atlas_users_from_users'
    `);
    assert.deepEqual(fn.rows[0].proconfig, ["search_path=pg_catalog, public"]);
    assert.equal(fn.rows[0].security_definer, false);
    assert.equal(fn.rows[0].volatility, "VOLATILE");
    assert.match(fn.rows[0].def, /public\.atlas_users/);

    const trigger = await pg.query(`
      SELECT tgname, pg_get_triggerdef(t.oid) AS def
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'users'
        AND tgname = 'trg_sync_atlas_users_from_users'
        AND NOT t.tgisinternal
    `);
    assert.equal(trigger.rows.length, 1);
    assert.match(trigger.rows[0].def, /AFTER INSERT OR DELETE OR UPDATE/i);

    // EXECUTE grant matrix
    const hasExec = async (role) => {
      const r = await pg.query(
        `SELECT has_function_privilege($1, 'public.sync_atlas_users_from_users()', 'EXECUTE') AS ok`,
        [role]
      );
      return r.rows[0].ok === true;
    };
    assert.equal(await hasExec("anon"), false);
    assert.equal(await hasExec("authenticated"), false);
    assert.equal(await hasExec("service_role"), true);
    assert.equal(await hasExec("postgres"), true);

    // Direct call as anon should fail (trigger functions also reject normal SELECT calls)
    await pg.query("SAVEPOINT grant_probe");
    try {
      await pg.query("SET LOCAL ROLE anon");
      await pg.query("SELECT public.sync_atlas_users_from_users()");
      assert.fail("anon direct execute should fail");
    } catch (error) {
      assert.match(String(error.message), /permission denied|cannot be called|trigger/i);
    }
    await pg.query("ROLLBACK TO SAVEPOINT grant_probe");

    // Trigger still fires for backend writer (current session = DB owner / superuser-like)
    await pg.query(
      `INSERT INTO public.users (
         id, organization_id, name, email, password_hash, role, is_active, rep_id, created_at, updated_at
       ) VALUES (
         $1, $2, 'Probe User', $3, 'probe-hash', 'RVP', true, '9ZZZZ', now(), now()
       )`,
      [userId, orgId, email]
    );

    const inserted = await pg.query(
      `SELECT id, email, first_name, last_name, display_name, role, status, organization_id, rep_id
       FROM public.atlas_users WHERE id = $1`,
      [userId]
    );
    assert.equal(inserted.rows.length, 1);
    assert.equal(inserted.rows[0].email, email);
    assert.equal(inserted.rows[0].first_name, "Probe");
    assert.equal(inserted.rows[0].last_name, "User");
    assert.equal(inserted.rows[0].role, "rvp");
    assert.equal(inserted.rows[0].status, "active");
    assert.equal(inserted.rows[0].rep_id, "9ZZZZ");
    assert.equal(inserted.rows[0].organization_id, orgId);

    const updatedRepId = `Z${userId.replace(/-/g, "").slice(0, 4).toUpperCase()}`;
    await pg.query(
      `UPDATE public.users
       SET name = 'Ana Updated', email = $2, role = 'REPRESENTATIVE', is_active = false, rep_id = $3
       WHERE id = $1`,
      [userId, `updated.${email}`, updatedRepId]
    );
    const updated = await pg.query(
      `SELECT email, first_name, last_name, role, status, rep_id FROM public.atlas_users WHERE id = $1`,
      [userId]
    );
    assert.equal(updated.rows[0].email, `updated.${email}`);
    assert.equal(updated.rows[0].first_name, "Ana");
    assert.equal(updated.rows[0].last_name, "Updated");
    assert.equal(updated.rows[0].role, "recruiter");
    assert.equal(updated.rows[0].status, "suspended");
    assert.equal(updated.rows[0].rep_id, updatedRepId);

    // No duplicate atlas_users rows
    const count = await pg.query(
      `SELECT count(*)::int AS n FROM public.atlas_users WHERE id = $1`,
      [userId]
    );
    assert.equal(count.rows[0].n, 1);

    // service_role can still invoke via privilege check + simulated write role
    await pg.query("SAVEPOINT service_role_write");
    try {
      await pg.query("SET LOCAL ROLE service_role");
      // service_role may lack direct table rights depending on grant model; privilege on function is required.
      assert.equal(await hasExec("service_role"), true);
    } finally {
      await pg.query("ROLLBACK TO SAVEPOINT service_role_write");
    }

    await pg.query(`DELETE FROM public.users WHERE id = $1`, [userId]);
    const deleted = await pg.query(
      `SELECT count(*)::int AS n FROM public.atlas_users WHERE id = $1`,
      [userId]
    );
    assert.equal(deleted.rows[0].n, 0);
  } finally {
    // Always roll back — never persist dry-run hardening or probe rows.
    try {
      await pg.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    await pg.end();
  }
}

test(
  "transactional dry-run: grants + INSERT/UPDATE/DELETE sync then ROLLBACK",
  { skip: !LIVE_DRY_RUN },
  async () => {
    await runTransactionalDryRun();
  }
);
