# Atlas Current State

## AI Summary

Atlas Core Platform v1.0 is feature-complete. Sprint 15.5 delivers RC1 certification tooling and documents the Supabase database baseline required before Team Vision UAT.

## Current Sprint

Sprint 15.5 — Database Baseline & RC1 Certification

## Product Stage

Release Candidate 1 — Atlas Core Platform v1.0

## Overall Status

🟡 Conditional — RC1 certification pending Supabase migrations 002–007

## Current Objective

Synchronize Supabase with Atlas Core migrations, seed RC1 demo data, and certify the release candidate for user acceptance testing.

## Working

- **RC1 environment tooling** — `backend/dev/environment/` (reset, seed, replay, verify, certify)
- **Migration apply script** — `applyAtlasCoreMigrations.js` (002 prerequisite + 003–007)
- **Database baseline verify** — `verifyDatabaseBaseline.js`
- **Combined SQL baseline** — `atlas-core-baseline.sql` for Supabase SQL editor
- **Shared UI kit** — skeletons, toasts, empty/error states, confirm dialog
- **Prospect Workspace UX** — lazy timeline, keyboard shortcuts, action feedback
- **Prospect Workspace feature** — composition layer over read models + Prospect Engine
- **Mission Control projection** — operational metrics from Business Events
- **Executive Dashboard projection** — funnel, conversion, trends, KPIs
- **Projection Framework** — central dispatch, replay, failure isolation
- **Engine unit verification** — all core verify scripts pass

## Pending (RC1 blockers)

- Apply Supabase migrations **002–007** (Atlas Core tables not yet present)
- Configure `DATABASE_URL` or `SUPABASE_DB_PASSWORD` in `.env`
- Run `node backend/dev/environment/certifyRC1.js` after baseline

See [RC1_CERTIFICATION.md](./10-release-candidate/RC1_CERTIFICATION.md).

## Architecture freeze (v1.0)

- Prospect Engine — bug fixes only
- Business Event Engine — bug fixes only
- Projection Framework — bug fixes only
- Timeline Engine — bug fixes only
- Mission Control — bug fixes only
- Executive Dashboard — bug fixes only

## Recent Decisions

- **2026-07-24:** RC1 certification uses Prospect Engine + Business Events only — no direct projection inserts
- **2026-07-24:** Migration 002 is a prerequisite for 003 (`atlas_users` FK)
- **2026-07-24:** Dev tooling fails fast when Atlas Core tables are missing (no silent in-memory fallback for RC1)

## Recently Updated Documents

| Document | Path |
|----------|------|
| RC1 Certification | [10-release-candidate/RC1_CERTIFICATION.md](./10-release-candidate/RC1_CERTIFICATION.md) |
| Environment tooling | [backend/dev/environment/](../backend/dev/environment/) |
| Sprint 15.3 | [09-releases/sprints/SPRINT_15_3_UX_POLISH.md](./09-releases/sprints/SPRINT_15_3_UX_POLISH.md) |

## Environment Status

### Development

| Component | Status |
|-----------|--------|
| Engine unit verifies | ✅ All pass |
| Contact Form verify | ✅ Pass |
| Supabase Atlas Core tables | ⏳ Pending migrations 002–007 |
| RC1 seed/verify | ⏳ Pending baseline |
| Frontend lint/build | ✅ (Sprint 15.3) |

## Last Updated

2026-07-24
