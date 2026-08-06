/**
 * Migration 029 — backend-only RLS for public tables exposed to anon.
 *
 * Default suite is production-safe (SQL contract + local regressions).
 * Optional live PostgREST probes run only when ATLAS_RLS_029_LIVE=1
 * (intended after production apply; not required for PR merge gate).
 */

require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  RLS_029_TABLES,
  authenticatedDenyPolicyName,
  anonDenyPolicyName
} = require("../database/rls029Tables");

const MIGRATION_PATH = path.join(
  __dirname,
  "../database/migrations/029_rls_backend_only_public_tables.sql"
);
const DOWN_PATH = path.join(
  __dirname,
  "../database/migrations/029_rls_backend_only_public_tables_down.sql"
);

const LIVE = process.env.ATLAS_RLS_029_LIVE === "1";

function loadSql(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function stripSqlComments(sql) {
  return sql
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

test("029 covers exactly the 18 audited public tables", () => {
  assert.equal(RLS_029_TABLES.length, 18);
  const sql = loadSql(MIGRATION_PATH);
  for (const table of RLS_029_TABLES) {
    assert.match(
      sql,
      new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, "i")
    );
  }
  assert.doesNotMatch(sql, /026_|027_|028_/);
  assert.doesNotMatch(sql, /sync_atlas_users_from_users/i);
  assert.doesNotMatch(sql, /storage\.|avatars/i);
});

test("029 enables RLS and creates deny policies in one transaction", () => {
  const sql = loadSql(MIGRATION_PATH);
  const body = stripSqlComments(sql);
  assert.match(sql, /^\s*BEGIN\s*;/im);
  assert.match(sql, /\bCOMMIT\s*;\s*$/im);
  assert.doesNotMatch(body, /\bUSING\s*\(\s*true\s*\)/i);
  assert.doesNotMatch(body, /SECURITY\s+DEFINER/i);
  assert.doesNotMatch(body, /auth\.uid\s*\(/i);
  assert.doesNotMatch(body, /organization_id\s*=/i);
});

test("029 creates explicit anon and authenticated deny policies per table", () => {
  const sql = stripSqlComments(loadSql(MIGRATION_PATH));
  for (const table of RLS_029_TABLES) {
    const anonPolicy = anonDenyPolicyName(table);
    const authPolicy = authenticatedDenyPolicyName(table);
    assert.ok(authPolicy.length <= 63, `${authPolicy} exceeds 63 chars`);
    assert.match(
      sql,
      new RegExp(
        `CREATE POLICY ${anonPolicy}\\s+ON public\\.${table}[\\s\\S]*?TO anon[\\s\\S]*?USING \\(false\\)[\\s\\S]*?WITH CHECK \\(false\\)`,
        "i"
      )
    );
    assert.match(
      sql,
      new RegExp(
        `CREATE POLICY ${authPolicy}\\s+ON public\\.${table}[\\s\\S]*?TO authenticated[\\s\\S]*?USING \\(false\\)[\\s\\S]*?WITH CHECK \\(false\\)`,
        "i"
      )
    );
  }
});

test("029 revokes anon/authenticated and preserves service_role grants", () => {
  const sql = stripSqlComments(loadSql(MIGRATION_PATH));
  for (const table of RLS_029_TABLES) {
    assert.match(
      sql,
      new RegExp(
        `REVOKE ALL ON TABLE public\\.${table} FROM anon, authenticated`,
        "i"
      )
    );
    assert.match(
      sql,
      new RegExp(`GRANT ALL ON TABLE public\\.${table} TO service_role`, "i")
    );
  }
});

test("029 does not mutate data, FKs, ownership columns, or Meta Review identity", () => {
  const sql = stripSqlComments(loadSql(MIGRATION_PATH));
  assert.doesNotMatch(sql, /\bINSERT\b/i);
  assert.doesNotMatch(sql, /\bUPDATE\b/i);
  assert.doesNotMatch(sql, /\bDELETE\b/i);
  assert.doesNotMatch(sql, /\bTRUNCATE\b/i);
  assert.doesNotMatch(sql, /meta_review_user/i);
  assert.doesNotMatch(sql, /profile_settings/i);
  assert.doesNotMatch(sql, /ALTER TABLE[\s\S]*ADD COLUMN/i);
  assert.doesNotMatch(sql, /ALTER TABLE[\s\S]*DROP COLUMN/i);
});

test("029 down migration warns and restores pre-029 exposure when authorized", () => {
  const down = loadSql(DOWN_PATH);
  assert.match(down, /WARNING/i);
  assert.match(down, /re-?opens/i);
  assert.match(down, /^\s*BEGIN\s*;/im);
  assert.match(down, /\bCOMMIT\s*;\s*$/im);
  for (const table of RLS_029_TABLES) {
    assert.match(
      down,
      new RegExp(`ALTER TABLE public\\.${table} DISABLE ROW LEVEL SECURITY`, "i")
    );
    assert.match(
      down,
      new RegExp(
        `GRANT ALL ON TABLE public\\.${table} TO anon, authenticated`,
        "i"
      )
    );
    assert.match(
      down,
      new RegExp(`GRANT ALL ON TABLE public\\.${table} TO service_role`, "i")
    );
  }
});

test("029 shortens only authenticated policy names that exceed 63 chars", () => {
  assert.equal(
    authenticatedDenyPolicyName("atlas_organization_securities_authority_bootstrap"),
    "atlas_organization_securities_authority_bootstrap_deny_auth"
  );
  assert.equal(
    authenticatedDenyPolicyName("atlas_user_securities_authorization_history"),
    "atlas_user_securities_authorization_history_deny_authenticated"
  );
  assert.equal(
    authenticatedDenyPolicyName("conversation_logs"),
    "conversation_logs_deny_authenticated"
  );
});

test("frontend source tree never embeds service-role secrets", () => {
  const frontendRoot = path.join(__dirname, "../../frontend");
  const hits = [];

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (
        entry.name === "node_modules" ||
        entry.name === "dist" ||
        entry.name === "build" ||
        entry.name === "coverage"
      ) {
        continue;
      }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(js|jsx|ts|tsx|env|json|md)$/i.test(entry.name)) {
        continue;
      }
      const text = fs.readFileSync(full, "utf8");
      if (/SERVICE_ROLE|service_role_key/i.test(text)) {
        hits.push(path.relative(frontendRoot, full));
      }
    }
  }

  walk(path.join(frontendRoot, "src"));
  walk(path.join(frontendRoot, "public"));
  assert.deepEqual(hits, []);
});

test("frontend has no Supabase client initialization path", () => {
  const srcRoot = path.join(__dirname, "../../frontend/src");
  let createClientHits = 0;

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(js|jsx|ts|tsx)$/i.test(entry.name)) continue;
      const text = fs.readFileSync(full, "utf8");
      if (/createClient\s*\(|@supabase\/supabase-js/.test(text)) {
        createClientHits += 1;
      }
    }
  }

  walk(srcRoot);
  assert.equal(createClientHits, 0);
});

async function liveProbeSuite() {
  const { createClient } = require("@supabase/supabase-js");
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  assert.ok(url && anonKey && serviceKey, "live probe requires Supabase env");

  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  const service = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  for (const table of RLS_029_TABLES) {
    const selectResult = await anon.from(table).select("*").limit(1);
    assert.ok(
      selectResult.error,
      `anon SELECT should fail for ${table} after 029`
    );

    const insertResult = await anon.from(table).insert({}).select("*").limit(1);
    assert.ok(
      insertResult.error,
      `anon INSERT should fail for ${table} after 029`
    );
  }

  const conversationInsert = await anon
    .from("conversation_logs")
    .insert({
      prospect_phone: "+10000000000",
      direction: "outgoing",
      message: "RLS_029_SHOULD_DENY"
    })
    .select("id")
    .maybeSingle();
  assert.ok(conversationInsert.error, "anon conversation_logs insert must deny");

  const appt = await anon.from("atlas_appointments").select("*").limit(1);
  assert.ok(appt.error, "anon cannot read appointments");

  const policy = await anon.from("atlas_policy_reviews").select("*").limit(1);
  assert.ok(policy.error, "anon cannot read policy reviews");

  const serviceConversation = await service
    .from("conversation_logs")
    .select("id")
    .limit(1);
  assert.equal(serviceConversation.error, null, "service-role conversation_logs read");

  const serviceWorkflow = await service.from("workflow_events").select("id").limit(1);
  assert.equal(serviceWorkflow.error, null, "service-role workflow_events read");

  const serviceAppt = await service.from("atlas_appointments").select("id").limit(1);
  assert.equal(serviceAppt.error, null, "service-role appointments read");

  const mc = await service
    .from("atlas_mission_control_state")
    .select("organization_id")
    .limit(1);
  assert.equal(mc.error, null, "service-role mission control read");

  const ed = await service
    .from("atlas_executive_dashboard_state")
    .select("organization_id")
    .limit(1);
  assert.equal(ed.error, null, "service-role executive dashboard read");

  const pi = await service.from("atlas_policy_reviews").select("id").limit(1);
  assert.equal(pi.error, null, "service-role policy intelligence read");

  const sec = await service
    .from("atlas_user_securities_authorization")
    .select("id, securities_access_status")
    .limit(1);
  assert.equal(sec.error, null, "service-role securities read");

  const wa = await service
    .from("whatsapp_outbound_deliveries")
    .select("id")
    .limit(1);
  assert.equal(wa.error, null, "service-role whatsapp outbound read");
}

test(
  "live PostgREST probes after 029 (gated by ATLAS_RLS_029_LIVE=1)",
  { skip: !LIVE },
  async () => {
    await liveProbeSuite();
  }
);
