# Atlas RC1 Development Environment

Development-only tooling for resetting, seeding, replaying projections, and validating the Atlas RC1 demo dataset.

**This is not production code and is not part of the Atlas application.**

All scripts live under `backend/dev/environment/` and compose existing Atlas Core modules without modifying business logic.

---

## Purpose

| Script | Purpose |
|--------|---------|
| `applyAtlasCoreMigrations.js` | Apply migrations 002 (prerequisite) + 003–007 via Postgres |
| `verifyDatabaseBaseline.js` | Verify tables, indexes, and constraints exist |
| `certifyRC1.js` | Full RC1 certification pipeline (migrate → seed → verify) |
| `resetDevelopmentDatabase.js` | Clear demo data while preserving schema and auth seed users |
| `seedRC1.js` | Reset + insert three RC1 prospects via Prospect Engine + Business Events |
| `replayProjections.js` | Rebuild Timeline, Mission Control, and Executive Dashboard from persisted events |
| `verifyRC1.js` | Run core verification scripts and validate RC1 data/read models |

---

## Prerequisites

- `.env` with `SUPABASE_URL` and `SUPABASE_ANON_KEY`
- **Required:** Atlas database migrations `002`–`007` applied in Supabase
- **For automated apply:** `DATABASE_URL` or `SUPABASE_DB_PASSWORD` (Supabase → Project Settings → Database)
- `NODE_ENV` must **not** be `production`

Manual alternative: paste `atlas-core-baseline.sql` in the Supabase SQL editor.

If migrations are missing, scripts fail fast instead of silently using in-memory stores.

Optional:

- `ATLAS_RC1_NIOVEL_AGENT_ID` — agent UUID for Carlos Rodriguez assignment (defaults to `00000000-0000-4000-8000-000000000002`)

---

## RC1 demo prospects

| Prospect | Status | Source | Assigned |
|----------|--------|--------|----------|
| Maria Gonzalez | New Lead | Facebook | Unassigned |
| Carlos Rodriguez | Interview Scheduled | Website | Niovel Perez |
| Andrea Morales | Archived | Referral | Ana Perez |

Prospects are created through **Prospect Engine** (`createProspect`, `assignProspect`, `archiveProspect`). Timeline events are recorded through **Business Event Engine** (`BusinessEventService.record`). Projections are rebuilt only via `replayProjections.js`.

---

## How to reset

Clears:

- `atlas_core_prospects`
- `atlas_business_events`
- `atlas_timeline_entries`
- Mission Control read model tables
- Executive Dashboard read model tables
- Legacy `prospects`, `conversation_logs`, `workflow_events`

Preserves schema and `atlas_users` seed data.

```bash
node backend/dev/environment/resetDevelopmentDatabase.js --confirm
```

---

## How to seed

Resets the database, seeds three RC1 prospects, replays projections, and writes `rc1-manifest.json`.

```bash
node backend/dev/environment/seedRC1.js --confirm
```

---

## How to replay

Rebuilds all projections from persisted Business Events using the Projection Framework (no duplicated logic).

```bash
node backend/dev/environment/replayProjections.js
```

Prints:

```
Timeline rebuilt
Mission Control rebuilt
Executive Dashboard rebuilt
```

---

## How to verify

Runs Prospect, Business Event, Timeline, Projection Framework, Mission Control, and Executive Dashboard verification scripts, then validates RC1 counts, metrics, timeline entries, and workspace-equivalent read services.

```bash
node backend/dev/environment/verifyRC1.js
```

Fast RC1-only check (skips unit verify scripts):

```bash
node backend/dev/environment/verifyRC1.js --rc1-only
```

Success output:

```
====================================

ATLAS RC1 READY

====================================
```

---

## Sprint 15.5 — Database baseline & certification

Apply Atlas Core migrations:

```bash
node backend/dev/environment/applyAtlasCoreMigrations.js
node backend/dev/environment/verifyDatabaseBaseline.js
```

Full RC1 certification (migrate, seed, verify, contact form, API smoke test):

```bash
node backend/dev/environment/certifyRC1.js
```

See [RC1_CERTIFICATION.md](../../../docs/10-release-candidate/RC1_CERTIFICATION.md).

---

## Typical workflow

```bash
node backend/dev/environment/seedRC1.js --confirm
node backend/dev/environment/verifyRC1.js
```

---

## Notes

- Destructive commands require `--confirm`.
- Supabase REST deletes run in a fixed order (logical transaction). If a step fails, the script exits before later steps complete.
- `seedRC1.js` never inserts projection rows directly — only Business Events, then replay.
- No Atlas Core modules are modified by this tooling.

---

## Related

- [RC1_CERTIFICATION.md](../../../docs/10-release-candidate/RC1_CERTIFICATION.md)
- [CURRENT_STATE.md](../../../docs/CURRENT_STATE.md)
- [SPRINT_15_0_MISSION_CONTROL.md](../../../docs/09-releases/sprints/SPRINT_15_0_MISSION_CONTROL.md)
- [SPRINT_15_1_EXECUTIVE_DASHBOARD.md](../../../docs/09-releases/sprints/SPRINT_15_1_EXECUTIVE_DASHBOARD.md)
