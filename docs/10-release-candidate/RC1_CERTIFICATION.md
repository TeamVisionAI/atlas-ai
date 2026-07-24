# Atlas RC1 Certification

## AI Summary

Atlas RC1 is **certified**. Atlas Core migrations **002–007** are applied, default users (Ana + Niovel) are seeded, and the RC1 demo environment passes full engine + integration verification.

## Document control

| Field | Value |
|-------|-------|
| **Release** | RC1 — Atlas Core Platform v1.0 |
| **Sprint** | 15.6 — RC1 Verification & Timeline Certification |
| **Certification date** | 2026-07-24 |
| **Status** | **Certified** |
| **Git tag** | `atlas-rc1` (prepare after merge) |

---

## Migration versions

| Version | File | Purpose |
|---------|------|---------|
| 002 | `002_quick_capture.sql` | Prerequisite — `atlas_users` (Ana + Niovel), `atlas_sessions` |
| 003 | `003_atlas_core_prospects.sql` | Atlas Core Prospect Engine |
| 004 | `004_atlas_business_events.sql` | Business Event store |
| 005 | `005_atlas_timeline_entries.sql` | Timeline projection store |
| 006 | `006_atlas_mission_control_read_model.sql` | Mission Control read model |
| 007 | `007_atlas_executive_dashboard_read_model.sql` | Executive Dashboard read model |

**Combined manual script:** `backend/dev/environment/atlas-core-baseline.sql`

---

## RC1 certification pipeline

```bash
node backend/dev/environment/certifyRC1.js
```

Or step-by-step:

```bash
node backend/dev/environment/applyAtlasCoreMigrations.js
node backend/dev/environment/verifyDatabaseBaseline.js
node backend/dev/environment/seedRC1.js --confirm
node backend/dev/environment/verifyRC1.js
```

Success output:

```
ATLAS RC1 CERTIFIED
```

---

## Verification results (2026-07-24)

### Engine unit verification — Pass

| Script | Result |
|--------|--------|
| `verifyProspectEngine.js` | Pass |
| `verifyBusinessEventEngine.js` | Pass |
| `verifyTimelineEngine.js` | Pass |
| `verifyProjectionFramework.js` | Pass |
| `verifyMissionControlProjection.js` | Pass |
| `verifyExecutiveDashboardProjection.js` | Pass |

### Supabase baseline — Pass

| Check | Result |
|-------|--------|
| `atlas_users` | Present — Ana + Niovel seeded |
| `atlas_core_prospects` | Present |
| `atlas_business_events` | Present |
| `atlas_timeline_entries` | Present |
| `atlas_mission_control_state` | Present |
| `atlas_executive_dashboard_state` | Present |

### RC1 integration — Pass

| Check | Expected | Status |
|-------|----------|--------|
| Exactly 3 RC1 prospects | Maria, Carlos, Andrea | Pass |
| Business Events replay | Projection Framework rebuild | Pass |
| Timeline rebuilt | Idempotent replay; `prospect_created` → "Lead created" | Pass |
| Mission Control metrics | 2 active, 3 new leads, etc. | Pass |
| Executive Dashboard metrics | 3 leads created, funnel populated | Pass |
| Prospect Workspace reads | 3 prospects + timelines | Pass |

---

## RC1 demo prospects (seed manifest)

| Name | Status | Source | Assigned |
|------|--------|--------|----------|
| Maria Gonzalez | New Lead | Facebook | Unassigned |
| Carlos Rodriguez | Interview Scheduled | Website | Niovel |
| Andrea Morales | Archived | Referral | Ana |

Seeded via Prospect Engine only — projections rebuilt by `replayProjections.js`.

---

## Timeline certification (Sprint 15.6)

**Root cause:** `ProspectApplicationService.emitBusinessEvent()` passed `eventType` as summary when none was provided. That blocked `EventFactory` defaults (e.g. `prospect_created` → **"Lead created"** per `BUSINESS_EVENTS.md`).

**Fix:** `EventFactory.fromProspectEmit()` ignores eventType-as-summary placeholders so factory defaults apply. No FK, assignment, or projection logic changes.

---

## Git tag

After merge to the release branch:

```bash
git tag -a atlas-rc1 -m "Atlas RC1 — Atlas Core Platform v1.0 certified"
git push origin atlas-rc1
```

---

## Related documents

- [Environment tooling README](../../backend/dev/environment/README.md)
- [CURRENT_STATE.md](../CURRENT_STATE.md)
- [Database migrations README](../../backend/database/README.md)
