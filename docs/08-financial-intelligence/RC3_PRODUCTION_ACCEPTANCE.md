# RC3 Production Deployment and Acceptance

## Final RC3 status (this environment)

**NOT APPROVED** — production deployment blocked pending operator actions.

| Gate | Result |
|------|--------|
| Pre-deploy tests (local) | Pass — see § Pre-deployment verification |
| Clean working tree for deploy | **Fail** — unrelated local modifications present |
| Approved commits on branch | Pass — `9278e0a`, `600a0b6` |
| Commits published to `origin/main` | **Fail** — branch ahead by 2 commits (not pushed) |
| Verified production DB backup | **Not performed** — no Supabase/Railway CLI; no recorded snapshot ID |
| Migration 025 applied in target DB | **Not applied** — `atlas_fi_strategy_evaluations` absent (read-only probe) |
| Backend/frontend production deploy | **Not performed** — Railway/Vercel CLIs unavailable; `gh` not authenticated |
| Live production API/browser acceptance | **Not tested** |

Per RC3 release-candidate rules: migration must not proceed without a verified backup. Deployment tooling and publish access are required for production acceptance.

---

## Approved deployment candidate

```text
RC3 Phase A: 9278e0a
RC3 Phase B: 600a0b6   ← deployment candidate SHA
```

Record at deploy time: exact SHA = `600a0b669cc77e31a3f54e74288427d0bf6cbd3c` (or a narrowly corrected descendant).

---

## Pre-deployment verification (executed 2026-08-04)

| Command | Exit | Result |
|---------|------|--------|
| `git status` | 0 | Dirty: `knowledgeHubService.js`, `appointmentReminders.json`, `workflowState.json` (unrelated; do not include in RC3 deploy) |
| `git log --oneline -5` | 0 | HEAD = `600a0b6` |
| `node backend/dev/verifyFiMigration025.js` | 0 | Structural OK; DB probe skipped unless `DATABASE_URL` loaded via dotenv |
| `node --test backend/test/financialIntelligence*.test.js` | 0 | **30/30 pass** |
| `node --test backend/test/policyIntelligenceRuleEngine.test.js backend/test/annualValuesEngine.test.js` | 0 | **2/2 pass** (includes language layer) |
| `cd frontend && npm test` | 0 | **65/65 pass** |
| `cd frontend && npm run lint` | 0 | Warnings only (pre-existing Dashboard/hooks) |
| `cd frontend && npm run build` | 0 | Production artifact generated (`dist/`) |

Environment-dependent: full `backend/test/*.test.js` may fail `sprint19_1` on Supabase DNS — treat as environment, not FI regression.

Read-only DB probe (local `.env` `DATABASE_URL`, values not disclosed):

- Connected: yes  
- `atlas_policy_reviews`: present  
- `atlas_fi_strategy_evaluations`: **absent** (migration 025 not applied)

Local `VITE_API_BASE_URL` resolves to **localhost** — not used as production target.

---

## Blockers (must clear before production approval)

### Blocker B1 — No verified backup / snapshot
- No `supabase`, `railway`, or documented automated backup was executed in this session.
- **Action:** Create a Supabase project backup / PITR restore point (or approved ops snapshot). Record snapshot ID, actor, and timestamp. Then proceed.

### Blocker B2 — RC3 commits not on `origin/main`
- Local `main` is ahead of `origin/main` by 2 commits.
- **Action:** Review dirty tree; stash/discard unrelated files; `git push origin HEAD` (or PR merge) so Railway/Vercel deploy the candidate SHA.

### Blocker B3 — Deploy tooling / auth unavailable here
- `railway`, `vercel`, `supabase` CLIs not installed.
- `gh` not authenticated.
- **Action:** Deploy from an operator machine with Railway + Vercel access after push.

### Production access still required

| Access | Purpose |
|--------|---------|
| Authorized Supabase migration access | Apply / verify migration 025 |
| Verified backup or snapshot capability | Pre-migration restore point |
| Railway backend deployment access | Deploy FI API |
| Vercel frontend deployment access | Deploy Discussion scenarios UI |
| GitHub push or PR access | Publish release branch |
| Production test account with FI permissions | Live acceptance |
| Approved second test organization (when available) | Tenant-isolation verification |

Local `localhost` API results and local builds are **not** production evidence.

### Blocker B4 — Unrelated dirty working tree
- Do not ship `appointmentReminders.json` / `workflowState.json` / incidental Knowledge Hub edits with RC3.
- **Action:** Keep deploy artifact = clean checkout of `600a0b6` (or approved descendant).

---

## Operator runbook (after blockers cleared)

### 1. Backup gate (required before migration)

Do not attempt a production backup from an environment without authorized tools.
The migration helper is **not** a substitute for a backup.

The production operator must record **before** applying migration 025:

| Field | Value (operator fills) |
|-------|------------------------|
| Environment name | |
| Backup / snapshot method | e.g. Supabase PITR / project backup |
| Backup timestamp (UTC) | |
| Snapshot or backup identifier | when the platform provides one |
| Operator identity / deployment record | |
| Confirmation backup predates migration 025 | yes / no |

Do not copy credentials, connection strings, or tokens into documentation.

### 2. Apply migration 025
Preferred: Supabase SQL editor or approved migration runner, execute:

`backend/database/migrations/025_financial_intelligence_strategy_evaluations.sql`

Then verify:

```bash
node -r dotenv/config backend/dev/verifyFiMigration025.js
# and/or
node -r dotenv/config backend/dev/verifyFiProductionSchema.js
```

If already applied, **do not re-apply**; verify schema only. Corrections → new migration number.

### 3. Backend deploy (Railway)
1. Deploy commit `600a0b6`.  
2. `GET {RAILWAY_URL}/health` → 200  
3. `GET {RAILWAY_URL}/health/production` → mvpReady as expected  
4. `GET {RAILWAY_URL}/api/financial-intelligence` → **401** unauthenticated  
5. Authenticated GET → module summary; org from auth context only.

### 4. Production API acceptance (authorized test org / test review)
Follow sections 7 and 10–14 of the RC3 release-candidate brief:

- Create evaluation (v1, no fabricated investable difference)  
- Preliminary term quote revision  
- Horizon → 4%/7%/10% projections  
- Risk profile emphasis (BR-070)  
- Replacement acknowledgement (warnings remain)  
- History: sequential versions, one current  
- Formula checks (±$0.02); positive/zero/negative difference  
- PI Fact version unchanged after revisions  
- Cross-tenant not-found  
- `policy:read` vs `policy:write` UI/API alignment  

### 5. Frontend deploy (Vercel) — only after DB + backend OK
1. Ensure `VITE_ENABLE_INTERNAL_PREVIEWS` is **not** enabling production demos.  
2. Deploy frontend for same SHA.  
3. Browser E2E checklist (release brief §9).  
4. Print preview (§16).  
5. Log review for sensitive payloads (§15).

### 6. Rollback (non-destructive default)
1. Hide/disable FI tab or redeploy prior frontend.  
2. Redeploy prior backend.  
3. **Leave migration 025 in place** unless schema causes outage.  
4. Do **not** run down migration in production without explicit destructive decision + backup.  
5. Confirm PI still healthy.

---

## Evidence to attach when complete

- Deployed commit SHA  
- Backup/snapshot ID  
- Migration verify output (no connection strings)  
- Sanitized API create/revision/history responses  
- Formula + projection independent check  
- Tenant isolation + permission results  
- Print preview note  
- Log review summary  
- Final status: APPROVED / APPROVED WITH MINOR LIMITATIONS / NOT APPROVED  

---

## Deferred (unchanged)

Official Primerica quotes · automated eligibility · verified fund catalog · suitability · PDF · transaction initiation

---

## Recommendation

**RC4 planning may begin only after RC3 production acceptance is APPROVED (or APPROVED WITH MINOR LIMITATIONS).**  
Until blockers B1–B4 are cleared and live acceptance evidence exists, keep RC4 development frozen.
