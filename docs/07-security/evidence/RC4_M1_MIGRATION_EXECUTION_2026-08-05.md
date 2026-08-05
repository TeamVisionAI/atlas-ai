# RC4 M1 Migration Execution Evidence

**Final status:** MIGRATIONS APPLIED — see Phase A bootstrap + fund-catalog hotfix evidence  
**Follow-up:** Phase A bootstrap executed for `support@teamvisionfinancial.com`. Placeholder `fundCatalog` leakage for `VERIFIED_ACTIVE` contained by hotfix `canExposeVerifiedFundCatalog` (see `RC4_M1_FUND_CATALOG_HOTFIX_2026-08-05.md`).  
**UTC window:** 2026-08-05T02:23Z – 2026-08-05T02:30Z  
**Operator:** Cursor agent (authorized runbook resume)  
**Business rule:** BR-074  
**Required / observed code SHA:** `895b6674775828093644bca8b632d90aaafd8cfa`  
**Production API:** `atlas-ai-production-01de.up.railway.app` (`/health/production` → `mvpReady: true`)

---

## 1. Environment identity (no secrets)

| Field | Value |
|-------|-------|
| Supabase project ref (confirmed) | `gjuheeztwxbnscjobkzm` |
| Railway `SUPABASE_URL` match | Confirmed by operator; local `SUPABASE_URL` host ref matches |
| `DATABASE_URL` | Set in operator session — **never printed** |
| DB host class observed | Supabase pooler `aws-0-us-east-1.pooler.supabase.com` (not `db.<ref>.supabase.co`) |
| Project ref from DB credentials | `gjuheeztwxbnscjobkzm` (matches confirmed production) |
| Latest scheduled backup | **04 Aug 2026 at 07:24:27 UTC** (operator-confirmed) |
| PITR | **Not enabled** (operator-confirmed) |
| `atlas_users` / `organizations` | 31 / 1 |
| FI 025 table | Present |

---

## 2. Migration file checksums (at `895b667`)

| File | SHA-256 | Match |
|------|---------|-------|
| `026_securities_access_authorization.sql` | `5cf7276d512f464524cf75455d595fd8e26cca34d6b8f0ed4ed2fe569fe749c3` | yes |
| `027_securities_authority_bootstrap_lock.sql` | `5e300c6b50b994d01944ec9bb6130f806adf4662eccfb9f59ec3eeff5e8da480` | yes |

Down scripts present (not executed):  
`026_…_down.sql`, `027_…_down.sql` — rollback order remains **027 → 026**.

---

## 3. Preflight

**Classification:** `POST_APPLY_CLEAN_VERIFY_PATH`  
(Objects already present from first apply in this maintenance window; zero grants/rows.)

| Check | Result |
|-------|--------|
| `securities:verify` catalog | Present (1 row) — expected after 026 |
| `role_permissions` / `user_permissions` for `securities:verify` | 0 / 0 |
| `atlas_user_securities_authorization` | Present, **0 rows** |
| `atlas_user_securities_authorization_history` | Present, **0 rows** |
| `atlas_organization_securities_authority_bootstrap` | Present, **0 rows** |
| `VERIFIED_ACTIVE` rows | 0 |
| Unexpected dirty/partial state | No |

---

## 4. Migration 026

| Item | Result |
|------|--------|
| First apply (this window) | **Applied** `2026-08-05T02:23:49.497Z` via Node/`pg` `BEGIN`→SQL→`COMMIT`, gate `CONFIRM_SECURITIES_MIGRATION_026=yes` |
| Resume re-apply | **Skipped** — objects already present (refused blind re-apply) |
| Verify | **PASS** |

Verify details:

- Permission `securities:verify` / `Verify Securities Access` / `Compliance` — exactly 1  
- Role grants 0; user grants 0  
- Required columns, constraints (`org_user_unique`, `status_chk`, `dates_chk`), indexes present  
- History table + indexes present  
- Auth / history / verified-active row counts: **0 / 0 / 0**

---

## 5. Migration 027

| Item | Result |
|------|--------|
| First apply (this window) | **Applied** `2026-08-05T02:24:28.022Z` via Node/`pg` `BEGIN`→SQL→`COMMIT`, gate `CONFIRM_SECURITIES_MIGRATION_027=yes` |
| Resume re-apply | **Skipped** — objects already present |
| Verify | **PASS** |

Verify details:

- Lock table present; PK on `organization_id`  
- `atlas_org_securities_bootstrap_source_chk` present  
- `idx_atlas_org_securities_bootstrap_target` present  
- Bootstrap rows 0; grants still 0; auth/history still 0  
- 026 objects still present

---

## 6. Fail-closed securities acceptance (§7) — PASS

Target: production Railway API. Temporary opaque `atlas_sessions` created for smoke, then revoked. Tokens not logged.

| Check | Expected | Observed |
|-------|----------|----------|
| Unauthenticated `GET /api/securities-access/probe` | 401 `UNAUTHORIZED` | PASS |
| Recruiter `GET /api/auth/me` | `UNKNOWN`, verified false, both capabilities false | PASS |
| Recruiter `GET /api/securities-access/probe` | 403 `SECURITIES_ACCESS_DENIED` / `UNKNOWN` | PASS |
| Admin `GET /api/securities-access/capabilities` | `canVerifySecuritiesAuthorization: false` | PASS |
| Admin `PUT …/users/:other` without grant | 403 `SECURITIES_VERIFY_FORBIDDEN` | PASS |
| Admin `PUT …/users/:self` | 403 `SELF_VERIFICATION_FORBIDDEN` | PASS |
| Admin `GET …/users/:other` summary | `UNKNOWN`, cannot verify | PASS |
| Auth rows after failed verify attempts | 0 | PASS |
| `user_permissions` `securities:verify` | 0 | PASS |

Note: production roles include `administrator` (no distinct `SUPER_ADMIN` role value in `atlas_users`). Admin without explicit grant was used for the verify-forbidden path.

UI Admin Users badge was not screenshot-captured in this session; API summary confirms `UNKNOWN` / not verified / cannot verify for existing users.

---

## 7. Generic FI English/Spanish smoke (§7.5) — PASS

| Check | Result |
|-------|--------|
| Production `GET /api/financial-intelligence` (unverified recruiter) | 200; `securitiesContentRestricted: true`; `fundCatalog` absent; no ticker/SB-72 leakage |
| Local `fiReportMessages.test.js` | 13/13 pass |
| Local `financialIntelligenceLocaleBoundary.test.js` | 2/2 pass |
| Local `securitiesAccessFoundation.test.js` (includes generic 4/7/10) | 24/24 pass |
| EN/ES localized view from visual fixture `fi-eval-visual-m11-001` v3 | Same id/version/numbers; rates **4% / 7% / 10%**; labels differ; no securities leakage; presentation-only (no write) |

No production FI evaluation write was performed. List endpoint returned 404; EN/ES numeric identity used the checked-in visual acceptance evaluation snapshot.

---

## 8. Explicitly not performed

- Phase A / Niovel securities-authority bootstrap  
- Any `securities:verify` grant  
- Any `VERIFIED_ACTIVE` authorization  
- Changes to `backend/data/workflowState.json`  
- Env var mutations  
- Rollback

---

## 9. Final status

**MIGRATIONS APPLIED — BOOTSTRAP PENDING**

Next requires **separate authorization** for Phase A bootstrap only.
