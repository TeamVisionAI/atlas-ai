# RC4 M1 — Controlled Production Migration Runbook

**Status:** RUNBOOK READY — do not execute until an approved maintenance window  
**Code SHA (required):** `895b6674775828093644bca8b632d90aaafd8cfa`  
**Business rule:** BR-074  
**Order:** apply **026**, verify, then apply **027**, verify  
**Stop after 027 verification + fail-closed acceptance**  
**Do not** run Phase A bootstrap in this window unless separately authorized  

| Artifact | Path | SHA-256 (at `895b667`) |
|----------|------|-------------------------|
| Migration 026 | `backend/database/migrations/026_securities_access_authorization.sql` | `5cf7276d512f464524cf75455d595fd8e26cca34d6b8f0ed4ed2fe569fe749c3` |
| Migration 027 | `backend/database/migrations/027_securities_authority_bootstrap_lock.sql` | `5e300c6b50b994d01944ec9bb6130f806adf4662eccfb9f59ec3eeff5e8da480` |
| Down 027 | `backend/database/migrations/027_securities_authority_bootstrap_lock_down.sql` | `a86c7b4b750eb5398fa367cc73d17532bef122d275ecef89f918b13ddb933066` |
| Down 026 | `backend/database/migrations/026_securities_access_authorization_down.sql` | `b33f4e0f980575ecd2d340fdf480e70e38f88d0edfaae2faa3cd80012d6d9e90` |

**Repository tooling note (important):**  
Atlas has **no** checked-in `applySecuritiesMigration026.js` / `027` helper.  
Canonical production apply pattern is the RC3 helper style in `backend/dev/applyFiMigration025.js`:

- Working directory = repo root  
- `DATABASE_URL` from a secure production env source (never paste into chat/logs)  
- Explicit confirmation env var  
- `pg` client  
- `BEGIN` → run SQL file → `COMMIT` (rollback on error)  
- Never print connection strings  

This runbook uses that same mechanism via `psql` (or an equivalent one-shot `node`/`pg` session). Do **not** invent a permanent helper mid-window unless a follow-up PR lands first.

There is **no** `schema_migrations` / `atlas_migrations` tracking table in repository truth. Migration state is verified by object presence (`to_regclass`, `permissions`, constraints).

---

## 1. Environment and backup checks

### 1.1 Verify production identity

| Check | How |
|-------|-----|
| Application SHA | Confirm Railway/Vercel production deploy is `895b667…` (or a descendant that still contains 026/027 unchanged). |
| Supabase project | Confirm dashboard project ref matches the production Atlas project (compare to ops runbook / secrets store — not this repo). |
| Database target | Confirm `DATABASE_URL` host/project ref is production. Prefer direct DB URL over pooler for DDL. |
| Operator access | Production DB role capable of DDL + DML on `public` (typically postgres / service role). |
| Maintenance window | Approved window recorded; stakeholders notified that securities features remain fail-closed until Phase A. |

### 1.2 Backup / recovery readiness

Before any apply:

1. Create or confirm a **fresh production backup / snapshot** in Supabase (or firm backup system).
2. Record:
   - Backup / snapshot ID  
   - Timestamp (UTC)  
   - PITR availability / earliest restore point  
3. Confirm restore procedure is known (who can restore, SLA).

**Stop if:** backup missing, snapshot ID unknown, or PITR unavailable for the change window.

### 1.3 Schema stop conditions (preflight)

**STOP and do not apply 026 if any of the following are true:**

| Condition | Why |
|-----------|-----|
| Wrong Supabase project / DB host | Wrong-tenant DDL |
| Production app SHA ≠ `895b667` (or approved descendant) | Code/schema mismatch |
| `DATABASE_URL` unset / connectivity fails | Cannot apply safely |
| No verified backup/snapshot ID recorded | No recovery |
| `atlas_user_securities_authorization` already exists with unexpected columns/constraints | Partial/foreign schema |
| `atlas_user_securities_authorization_history` exists unexpectedly | Partial prior migration |
| `atlas_organization_securities_authority_bootstrap` already exists with rows | Unexpected prior bootstrap |
| `permissions` already has `securities:verify` **and** any `role_permissions` / `user_permissions` grant | Seeded authority outside process |
| Any row in securities authorization tables | Not a clean fail-closed start |

**STOP before 027 if 026 verification fails.**

---

## 2. Pre-migration read-only queries

Connect with a read-only session if available; otherwise use a normal session but **run only SELECT / `\d` equivalents**.

```sql
-- Identity / scale (baseline counts)
SELECT COUNT(*)::int AS atlas_users_count FROM atlas_users;
SELECT COUNT(*)::int AS organizations_count FROM organizations;

-- Permission catalog: securities:verify must NOT exist yet (expected pre-026)
SELECT code, name, category
FROM permissions
WHERE code = 'securities:verify';
-- PASS pre-026: 0 rows

-- Role grants must be zero for securities:verify
SELECT role_code, permission_code, granted
FROM role_permissions
WHERE permission_code = 'securities:verify';
-- PASS: 0 rows

-- User grants must be zero for securities:verify
SELECT user_id, permission_code, granted, expires_at
FROM user_permissions
WHERE permission_code = 'securities:verify';
-- PASS: 0 rows

-- Tables must not exist yet
SELECT to_regclass('public.atlas_user_securities_authorization') AS auth_table;
SELECT to_regclass('public.atlas_user_securities_authorization_history') AS history_table;
SELECT to_regclass('public.atlas_organization_securities_authority_bootstrap') AS bootstrap_lock;
-- PASS pre-026: all NULL

-- Migration tracking table (repository has none; confirm none unexpected)
SELECT to_regclass('public.schema_migrations') AS schema_migrations;
SELECT to_regclass('public.atlas_migrations') AS atlas_migrations;
-- Informational: both expected NULL unless ops introduced an external tracker
```

If `auth_table` / `history_table` / `bootstrap_lock` are **not** NULL, treat as **partial prior migration** and stop for investigation (do not re-apply blindly).

---

## 3. Migration 026 execution

### 3.1 Preconditions

- [ ] Preflight + backup complete  
- [ ] Pre-migration SQL all PASS  
- [ ] Working directory: repository root at SHA `895b667`  
- [ ] Secure shell with production `DATABASE_URL` loaded (dotenv / secret manager)  
- [ ] Confirmation token prepared: `CONFIRM_SECURITIES_MIGRATION_026=yes`

### 3.2 Environment variables

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | Yes | Production Postgres URL. **Never echo / commit / paste into tickets.** |
| `CONFIRM_SECURITIES_MIGRATION_026` | Yes (`yes`) | Operator gate patterned on `CONFIRM_FI_MIGRATION_025` |

Optional for connectivity helpers used elsewhere: `SUPABASE_URL`, `SUPABASE_DB_PASSWORD` — prefer explicit `DATABASE_URL` for this window.

### 3.3 Syntax / file check (no DB writes)

```bash
cd /path/to/atlas-ai
git rev-parse HEAD   # must be 895b667… (or approved descendant)
test -f backend/database/migrations/026_securities_access_authorization.sql
shasum -a 256 backend/database/migrations/026_securities_access_authorization.sql
# Expect: 5cf7276d512f464524cf75455d595fd8e26cca34d6b8f0ed4ed2fe569fe749c3
```

There is **no** repository dry-run for DDL. Do not use `ON CONFLICT` / `IF NOT EXISTS` success as proof of a clean first apply — still run verification SQL in §4.

### 3.4 Exact apply command (canonical)

**Preferred (psql + confirmation gate):**

```bash
cd /path/to/atlas-ai

# Load production secrets without printing them
set -a
source /secure/path/production.env   # must define DATABASE_URL; do not cat this file into chat
set +a

# Confirmation gate (typed deliberately)
export CONFIRM_SECURITIES_MIGRATION_026=yes

# Refuse unless gate is exact
if [ "$CONFIRM_SECURITIES_MIGRATION_026" != "yes" ]; then
  echo "Refusing: confirmation gate failed"; exit 1
fi

# Apply inside a single transaction
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
\i backend/database/migrations/026_securities_access_authorization.sql
COMMIT;
SQL
```

**Equivalent Node/`pg` pattern** (mirrors `backend/dev/applyFiMigration025.js`; no dedicated helper in repo):

```bash
CONFIRM_SECURITIES_MIGRATION_026=yes \
node -r dotenv/config -e '
if (process.env.CONFIRM_SECURITIES_MIGRATION_026 !== "yes") {
  console.error(JSON.stringify({ ok:false, error:"confirmation required" }));
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error(JSON.stringify({ ok:false, error:"DATABASE_URL not set" }));
  process.exit(1);
}
const fs = require("fs");
const { Client } = require("pg");
const sql = fs.readFileSync(
  "backend/database/migrations/026_securities_access_authorization.sql",
  "utf8"
);
(async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 30000
  });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    console.log(JSON.stringify({ ok:true, applied:"026" }));
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error(JSON.stringify({ ok:false, error:e.message }));
    process.exit(1);
  } finally {
    await client.end();
  }
})();
'
```

### 3.5 Expected behavior

| Topic | Expectation |
|-------|-------------|
| Transaction | Single `BEGIN`/`COMMIT`; error → `ROLLBACK` |
| Output | `COMMIT` / `{ "ok": true, "applied": "026" }` — no secrets |
| Idempotence notes | SQL uses `ON CONFLICT DO NOTHING` for permission insert and `CREATE TABLE IF NOT EXISTS` — still treat unexpected pre-existing objects as a stop condition |
| Logging | Record UTC time, operator, SHA, backup ID, command used (**not** `DATABASE_URL`) |
| Terminal history | Do **not** paste `DATABASE_URL`, passwords, or connection strings into shell history, Slack, or tickets |

### 3.6 What not to paste into terminal history

- Production `DATABASE_URL`  
- Supabase service keys / DB passwords  
- User UUIDs in bootstrap configs (not used in this window)  
- Full `.env` dumps  

---

## 4. Migration 026 verification

### 4.1 SQL checks (all required)

```sql
-- Permission catalog
SELECT code, name, category
FROM permissions
WHERE code = 'securities:verify';
-- PASS: exactly 1 row

-- Zero role grants
SELECT COUNT(*)::int AS role_grants
FROM role_permissions
WHERE permission_code = 'securities:verify';
-- PASS: 0

-- Zero user grants
SELECT COUNT(*)::int AS user_grants
FROM user_permissions
WHERE permission_code = 'securities:verify';
-- PASS: 0

-- Tables exist
SELECT to_regclass('public.atlas_user_securities_authorization') AS auth_table;
SELECT to_regclass('public.atlas_user_securities_authorization_history') AS history_table;
-- PASS: both non-NULL

-- Required columns on current authorization
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'atlas_user_securities_authorization'
ORDER BY ordinal_position;
-- PASS: includes at least:
-- id, organization_id, user_id, securities_access_status, registration_type,
-- permitted_product_scope, verification_source, verified_by, verified_at,
-- effective_from, effective_to, jurisdiction_scope, principal_scope,
-- supervisory_restrictions, status_reason, last_reviewed_at,
-- created_at, updated_at, deleted_at

-- Constraints
SELECT conname, contype
FROM pg_constraint
WHERE conrelid = 'public.atlas_user_securities_authorization'::regclass
ORDER BY conname;
-- PASS includes:
-- atlas_user_securities_authorization_org_user_unique (UNIQUE org/user)
-- atlas_user_securities_authorization_status_chk
-- atlas_user_securities_authorization_dates_chk
-- FKs to organizations(id), atlas_users(id) (user_id, verified_by)

-- Indexes
SELECT indexname
FROM pg_indexes
WHERE tablename = 'atlas_user_securities_authorization'
ORDER BY indexname;
-- PASS includes:
-- idx_atlas_user_securities_auth_org
-- idx_atlas_user_securities_auth_user
-- idx_atlas_user_securities_auth_status

-- History table + indexes
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'atlas_user_securities_authorization_history'
ORDER BY ordinal_position;

SELECT indexname
FROM pg_indexes
WHERE tablename = 'atlas_user_securities_authorization_history'
ORDER BY indexname;
-- PASS includes:
-- idx_atlas_user_securities_auth_history_org_user
-- idx_atlas_user_securities_auth_history_auth

-- No authorization rows / no VERIFIED_ACTIVE
SELECT COUNT(*)::int AS auth_rows FROM atlas_user_securities_authorization;
SELECT COUNT(*)::int AS verified_active_rows
FROM atlas_user_securities_authorization
WHERE securities_access_status = 'VERIFIED_ACTIVE'
  AND deleted_at IS NULL;
-- PASS: auth_rows = 0, verified_active_rows = 0

-- Bootstrap lock must still be absent before 027
SELECT to_regclass('public.atlas_organization_securities_authority_bootstrap') AS bootstrap_lock;
-- PASS before 027: NULL
```

### 4.2 Application checks after 026 (before 027)

With production app already on `895b667`:

1. `GET /api/auth/me` as a normal existing user →  
   `securities_access_status: "UNKNOWN"`,  
   `capabilities.canAccessSecuritiesContent: false`,  
   `capabilities.canVerifySecuritiesAuthorization: false`
2. `GET /api/securities-access/probe` as that user → **403**  
   body includes `error: "SECURITIES_ACCESS_DENIED"` and `securities_access_status: "UNKNOWN"`
3. Generic FI discussion scenarios still load (4% / 7% / 10%).

### 4.3 Pass / fail

| Result | Action |
|--------|--------|
| All §4.1 + §4.2 PASS | Proceed to §5 (027) |
| Any FAIL | **STOP.** Do not apply 027. Investigate; use §8 rollback if 026 left a bad partial state |

---

## 5. Migration 027 execution

### 5.1 Preconditions

- [ ] §4 PASS  
- [ ] Same production `DATABASE_URL` / project as 026  
- [ ] Confirmation: `CONFIRM_SECURITIES_MIGRATION_027=yes`

### 5.2 File check

```bash
cd /path/to/atlas-ai
shasum -a 256 backend/database/migrations/027_securities_authority_bootstrap_lock.sql
# Expect: 5e300c6b50b994d01944ec9bb6130f806adf4662eccfb9f59ec3eeff5e8da480
```

### 5.3 Exact apply command

```bash
cd /path/to/atlas-ai
set -a
source /secure/path/production.env
set +a

export CONFIRM_SECURITIES_MIGRATION_027=yes
if [ "$CONFIRM_SECURITIES_MIGRATION_027" != "yes" ]; then
  echo "Refusing: confirmation gate failed"; exit 1
fi

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
\i backend/database/migrations/027_securities_authority_bootstrap_lock.sql
COMMIT;
SQL
```

Node/`pg` equivalent: same pattern as §3.4 with file  
`backend/database/migrations/027_securities_authority_bootstrap_lock.sql`  
and gate `CONFIRM_SECURITIES_MIGRATION_027=yes`.

### 5.4 Expected behavior

Same as 026: single transaction, no seeds, no secrets in logs, `{ ok: true, applied: "027" }` or `COMMIT`.

---

## 6. Migration 027 verification

```sql
-- Lock table exists
SELECT to_regclass('public.atlas_organization_securities_authority_bootstrap') AS bootstrap_lock;
-- PASS: non-NULL

-- Columns
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'atlas_organization_securities_authority_bootstrap'
ORDER BY ordinal_position;
-- PASS includes:
-- organization_id (PK), target_user_id, completed_at, technical_actor,
-- verification_source, evidence_source, evidence_reference, evidence_verified_at,
-- authorization_id, reason_sanitized, metadata, created_at

-- One-row-per-organization = PRIMARY KEY on organization_id
SELECT conname, contype
FROM pg_constraint
WHERE conrelid = 'public.atlas_organization_securities_authority_bootstrap'::regclass;
-- PASS: PRIMARY KEY on organization_id; CHECK atlas_org_securities_bootstrap_source_chk

-- Index
SELECT indexname
FROM pg_indexes
WHERE tablename = 'atlas_organization_securities_authority_bootstrap';
-- PASS includes: idx_atlas_org_securities_bootstrap_target

-- Zero seeded locks
SELECT COUNT(*)::int AS bootstrap_rows
FROM atlas_organization_securities_authority_bootstrap;
-- PASS: 0

-- Still zero verifier grants / authorizations
SELECT COUNT(*)::int FROM role_permissions WHERE permission_code = 'securities:verify';
-- PASS: 0
SELECT COUNT(*)::int FROM user_permissions WHERE permission_code = 'securities:verify';
-- PASS: 0
SELECT COUNT(*)::int FROM atlas_user_securities_authorization;
-- PASS: 0
SELECT COUNT(*)::int FROM atlas_user_securities_authorization_history;
-- PASS: 0

-- Ordering intact: 026 objects still present
SELECT to_regclass('public.atlas_user_securities_authorization') IS NOT NULL AS has_026_auth;
SELECT EXISTS(SELECT 1 FROM permissions WHERE code = 'securities:verify') AS has_026_permission;
-- PASS: both true
```

**Pass / fail:** all PASS → continue §7. Any FAIL → **STOP**; consider §8 (027-only rollback first).

---

## 7. Post-migration fail-closed checks

Perform against **production** app at SHA `895b667` after 026+027.

### 7.1 Session / capabilities

`GET /api/auth/me` (authenticated existing user, no securities row):

| Field | Expected |
|-------|----------|
| `securities_access_status` | `"UNKNOWN"` |
| `securities_access_verified` | `false` |
| `capabilities.canAccessSecuritiesContent` | `false` |
| `capabilities.canVerifySecuritiesAuthorization` | `false` |

### 7.2 Probe

`GET /api/securities-access/probe`

| Actor | Expected |
|-------|----------|
| Unverified user | **403** `{ "error": "SECURITIES_ACCESS_DENIED", "securities_access_status": "UNKNOWN", ... }` |
| Unauthenticated | **401** `{ "error": "UNAUTHORIZED", ... }` |

Success body (**200**) must **not** appear for unverified users. Authorized probe (only after Phase A / later verification) returns:

```json
{
  "ok": true,
  "resource": "securities.probe",
  "message": "Securities content access authorized.",
  "payload": { "access": "authorized", "contentType": "probe" }
}
```

(no fund names / tickers / SB-72)

### 7.3 Admin / SUPER_ADMIN cannot verify without explicit grant

Attempt update via Admin securities API (requires `users:manage` / admin users permission **plus** explicit `securities:verify` inside service):

`PUT /api/admin/securities-access/users/:otherUserId`  
(or mounted `/api/securities-access/users/:userId` under admin mount)

| Actor | Expected |
|-------|----------|
| Admin without `user_permissions.securities:verify` | **403** `SECURITIES_VERIFY_FORBIDDEN` |
| SUPER_ADMIN without explicit grant | **403** `SECURITIES_VERIFY_FORBIDDEN` |
| Self-target (actor == target) | **403** `SELF_VERIFICATION_FORBIDDEN` |

`GET /api/securities-access/capabilities` → `{ "canVerifySecuritiesAuthorization": false }` for those actors.

### 7.4 Admin Users UI

- No “Securities Access Verified” badge for existing users  
- No securities controls enabling verification without explicit grant  
- Self-row remains non-editable for verification  

### 7.5 Generic FI + bilingual (M1.1)

| Check | Expected |
|-------|----------|
| Open FI discussion scenarios | Loads |
| Rates visible | 4%, 7%, 10% |
| Language EN → ES → EN | Same evaluation id/version/numbers; no write / no new revision |
| Fund names / tickers / SB-72 / share classes / model portfolios | **Absent** |
| Meta Review locker behavior | Unchanged |

### 7.6 Pass / fail

All §7 checks PASS → record evidence (§9) and **STOP before bootstrap**.  
Any FAIL → do not bootstrap; investigate; rollback only if authorized (§8).

---

## 8. Rollback runbook

**Do not execute unless authorized.**  
**Safe window:** before Phase A bootstrap and before any authorization / grant rows exist (expected immediately after this migration window).

### 8.1 Reverse order (required)

1. Rollback **027** first  
2. Rollback **026** second  

### 8.2 Pre-rollback

- [ ] Fresh backup / snapshot ID recorded  
- [ ] Confirm row counts still zero (auth, history, bootstrap, grants)  
- [ ] Confirm no Phase A has been executed  

### 8.3 Rollback 027 only

```bash
cd /path/to/atlas-ai
set -a; source /secure/path/production.env; set +a
export CONFIRM_SECURITIES_ROLLBACK_027=yes

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
\i backend/database/migrations/027_securities_authority_bootstrap_lock_down.sql
COMMIT;
SQL
```

Verify:

```sql
SELECT to_regclass('public.atlas_organization_securities_authority_bootstrap'); -- NULL
SELECT to_regclass('public.atlas_user_securities_authorization'); -- still present if only 027 rolled back
```

### 8.4 Rollback 026 and 027 together

```bash
# 027 first, then 026
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
\i backend/database/migrations/027_securities_authority_bootstrap_lock_down.sql
\i backend/database/migrations/026_securities_access_authorization_down.sql
COMMIT;
SQL
```

Down 026 effects (repository truth):

- Drops history indexes/table  
- Drops auth indexes/table  
- `DELETE FROM permissions WHERE code = 'securities:verify'`

Verify:

```sql
SELECT to_regclass('public.atlas_user_securities_authorization'); -- NULL
SELECT to_regclass('public.atlas_user_securities_authorization_history'); -- NULL
SELECT to_regclass('public.atlas_organization_securities_authority_bootstrap'); -- NULL
SELECT COUNT(*) FROM permissions WHERE code = 'securities:verify'; -- 0
```

### 8.5 Application rollback

If schema is rolled back but app remains on `895b667`, securities routes still fail closed when tables are missing (repository services treat missing relations / null rows as deny / UNKNOWN). Prefer keeping app deploy and only rolling schema if required. Full app rollback to pre-M1 SHA is a separate change-control decision and is **not** required for a clean pre-bootstrap schema rollback.

### 8.6 Expected data loss / sensitivity

| Timing | Risk |
|--------|------|
| Before any grants / auth rows / bootstrap lock | Rollback drops empty tables + permission catalog entry only — **low sensitivity** |
| After Phase A or any `VERIFIED_ACTIVE` / history / grants | Rollback **destroys authorization history and grants** — **high sensitivity**; requires compliance approval; restore-from-backup may be safer than down scripts |

**Stop conditions for rollback:** wrong project, missing backup, non-zero authorization/grant/bootstrap rows without compliance approval.

---

## 9. Audit and evidence record

Operator must record (no secrets):

| Field | Example |
|-------|---------|
| Date/time (UTC) | |
| Operator name | |
| Production app SHA | `895b6674775828093644bca8b632d90aaafd8cfa` |
| Database project identifier | Supabase project ref (not password) |
| Backup / snapshot ID + timestamp | |
| PITR confirmed | yes/no |
| Migration file checksums | § table at top |
| Commands executed | `psql … \i 026…` / `027…` (redact URL) |
| Pre/post row counts | users, orgs, auth=0, history=0, bootstrap=0, grants=0 |
| Verification SQL results | PASS/FAIL checklist |
| API smoke results | `/api/auth/me`, probe 403, admin verify 403 |
| FI EN/ES smoke | PASS/FAIL |
| Rollback readiness | down scripts present; reverse order known |
| Screenshots / logs | Admin Users (no badge), FI EN/ES; **exclude** tokens, URLs with secrets, registration numbers |

---

## 10. Final operator checklist

- [ ] **Preflight** — correct project, SHA `895b667`, connectivity, maintenance window  
- [ ] **Backup** — snapshot/PITR recorded  
- [ ] **Pre-migration SQL** — tables absent; no `securities:verify` grants  
- [ ] **Apply 026** — confirmation gate + single transaction  
- [ ] **Verify 026** — permission exists; zero grants; tables/constraints/indexes; zero auth rows; app UNKNOWN + probe 403  
- [ ] **Apply 027** — confirmation gate + single transaction  
- [ ] **Verify 027** — lock table exists; zero lock rows; still zero grants/auth  
- [ ] **Fail-closed acceptance** — admin/SUPER_ADMIN cannot verify; Admin Users no verified badge  
- [ ] **Generic FI EN/ES acceptance** — 4/7/10 visible; no securities leakage; language switch presentation-only  
- [ ] **Evidence capture** — §9 complete  
- [ ] **STOP before bootstrap** — Phase A not run unless separately authorized  

---

## 11. Final status

**RUNBOOK READY**

Not blocked on repository truth. Operator must still supply out-of-repo items at execution time:

- Production Supabase project ref / `DATABASE_URL`  
- Backup/snapshot ID  
- Maintenance window approval  

**Explicitly out of this runbook’s execution scope**

- Applying 026/027 (document only)  
- Phase A Niovel / initial-authority bootstrap  
- Granting `securities:verify`  
- Activating `VERIFIED_ACTIVE`  
- Deploy changes  
- Modifying `backend/data/workflowState.json`
