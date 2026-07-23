# Atlas Release History

**Status:** FROZEN (Version 1)  
**Last Updated:** 2026-07-21  

**Related:** [ROADMAP.md](../00-executive/Roadmap.md) · [02-architecture/ATLAS_PLATFORM_V1.md](../02-architecture/ATLAS_PLATFORM_V1.md)

---

## Version 1 Summary

| Version | Name | Date | Git Tag | Verification |
|---------|------|------|---------|--------------|
| v1.0 | Atlas Core | 2026-07-21 | — | Journey verify scripts |
| v1.1 | Team Vision Recruiting Pack | 2026-07-21 | — | `verifyRelease1_1.js` ✅ |
| v1.2 | Organization Console | 2026-07-21 | — | `verifyRelease1_2.js` ✅ |
| v1.3 | Daily Brief | 2026-07-21 | `v1.3.0` | `verifyRelease1_3.js` ✅ |
| v1.4 | Mission Control | 2026-07-21 | `v1.4.0` | `verifyRelease1_4.js` ✅ |

---

## v1.0 — Atlas Core

**Date:** 2026-07-21 (conceptual freeze)  
**Git Tag:** None (Journey-based verification)  
**Branch:** `sprint-7-engine-integration`

### Summary

Foundation platform providing conversation automation, workflow execution, scheduling, business rules, and production integrations. Atlas Core is **generic** — no industry-specific logic.

### Major Components

| Journey | Domain | Path |
|---------|--------|------|
| #1 | Onboarding & Auth | `backend/routes/onboarding.js`, `backend/services/onboardingService.js` |
| #2 | Appointments | `backend/appointments/` |
| #3 | Meetings | `backend/meetings/` |
| #4 | Agent Architecture (design) | `docs/02-architecture/ATLAS_AGENT_ARCHITECTURE.md` |
| #5 Inc 1 | Atlas Agent | `backend/agent/` |
| #5 Inc 2 | Workflow Intelligence | `backend/workflows/intelligence/` |
| #5 Inc 3 | Tool Execution | `backend/agent/tools/` |
| #5 Inc 4 | Autonomous Conversations | `backend/agent/runtime/` |
| #6 | Communication Gateway | `backend/gateway/` |
| #7 | Production Connectors | `backend/connectors/` |
| Core | Business Rules, Scheduling | `backend/core/` |

### Breaking Changes

N/A — initial foundation.

### Migration Notes

Atlas Core is locked. Future changes require bug-fix justification only.

### Verification

```bash
node backend/dev/verifyJourney7.js    # includes J6, J5 Inc 4, J2, J3
node backend/dev/verifyJourney1.js
node backend/dev/verifyJourney5Increment1.js
node backend/dev/verifyJourney5Increment2.js
node backend/dev/verifyJourney5Increment3.js
```

---

## v1.1 — Team Vision Recruiting Pack

**Date:** 2026-07-21  
**Git Tag:** — (included in `sprint-7-engine-integration` commits)  
**Docs:** [RELEASE_1_1.md](archive/v1-platform/RELEASE_1_1.md)

### Summary

First complete production package. Implements Team Vision recruiting workflow on Atlas Core without modifying Core.

### Major Components

- `backend/packages/teamvision/` — RecruitingPackage, QualificationRules, InterviewManager, FollowUpEngine, RecruitingAnalytics
- Workflow: qualify → interview → presentation → licensing → orientation → fast start → follow-up

### Breaking Changes

None.

### Migration Notes

Register via `registerTeamVisionRecruitingPackage({ eventBus, configuration })`. Configuration injected from Organization Console in Release 1.2+.

### Verification Status

✅ `node backend/dev/verifyRelease1_1.js`

---

## v1.2 — Organization Console

**Date:** 2026-07-21  
**Commit:** `5939e6a`  
**Git Tag:** —  
**Docs:** [RELEASE_1_2.md](archive/v1-platform/RELEASE_1_2.md)

### Summary

Administration layer enabling organizations to install, configure, and operate Atlas without code changes.

### Major Components

- `backend/organizations/` — 17 modules (Manager, Store, Profile, Branding, Locations, Users, Roles, Packages, Connectors, Policies, Settings, Validator, Analytics)
- Store: `backend/data/organizationConsole.json`

### Breaking Changes

None. Additive domain.

### Migration Notes

Separate store from Journey #1 `organizations.json` (onboarding auth). Organization Console uses `organizationConsole.json`.

### Verification Status

✅ `node backend/dev/verifyRelease1_2.js`

---

## v1.3 — Daily Brief

**Date:** 2026-07-21  
**Commit:** `b90663c`  
**Git Tag:** `v1.3.0`  
**Docs:** [RELEASE_1_3.md](archive/v1-platform/RELEASE_1_3.md)

### Summary

Executive intelligence engine. Produces one structured morning briefing per organization from snapshot, metrics, trends, insights, priorities, and recommendations.

### Major Components

- `backend/intelligence/` — DailyBriefEngine, OrganizationSnapshot, MetricsCollector, TrendAnalyzer, InsightGenerator, PriorityEngine, RecommendationEngine, BriefFormatter
- Store: `backend/data/dailyBrief.json`
- RFC: [RFC-008](../10-rfcs/RFC-008-daily-brief-schema.md)

### Breaking Changes

None. Additive domain.

### Migration Notes

First implementation of Atlas Never Sleeps "Thinking" mode for daily synthesis.

### Verification Status

✅ `node backend/dev/verifyRelease1_3.js`

---

## v1.4 — Mission Control

**Date:** 2026-07-21  
**Commit:** `b6a868f`  
**Git Tag:** `v1.4.0`  
**Docs:** [RELEASE_1_4.md](archive/v1-platform/RELEASE_1_4.md)

### Summary

Live operational command center. Event-driven incremental state updates — no polling. Complements Daily Brief with real-time operational awareness.

### Major Components

- `backend/mission-control/` — MissionControlEngine, MissionState, MissionEventProcessor, MissionMetrics, MissionAlerts, MissionTimeline, MissionHealth, MissionFilters, MissionStore
- Store: `backend/data/missionControl.json`
- RFC: [RFC-009](../10-rfcs/RFC-009-mission-control-state.md)

### Breaking Changes

None. Release 1.4 extends existing Sprint 12.5 MissionControlService without modifying it.

### Migration Notes

MissionControlEngine (Release 1.4) and MissionControlService (Sprint 12.5) coexist. New integrations should use MissionControlEngine.

### Verification Status

✅ `node backend/dev/verifyRelease1_4.js`

---

## Stabilization Sprint — Version 1 Freeze

**Date:** 2026-07-21  
**Type:** Documentation only

### Deliverables

- [02-architecture/ATLAS_PLATFORM_V1.md](../02-architecture/ATLAS_PLATFORM_V1.md)
- [WHY_ATLAS_EXISTS.md](../01-product/WHY_ATLAS_EXISTS.md)
- [ROADMAP.md](../00-executive/Roadmap.md)
- [02-architecture/ARCHITECTURE_DECISIONS.md](../02-architecture/ARCHITECTURE_DECISIONS.md)
- RFC-001 through RFC-010
- This release history

### Code Changes

**None.** Zero production code modifications.

---

## Full Verification Chain

Run from repository root:

```bash
node backend/dev/verifyRelease1_4.js
```

This executes Release 1.4 checks and regressions through Release 1.3, 1.2, 1.1, and Journey #7 (which includes J6, J5 Inc 4, J2, J3).

---

## Git Tags

| Tag | Release | Annotated Message |
|-----|---------|-------------------|
| `v1.3.0` | Daily Brief | Atlas Release 1.3 - Daily Brief |
| `v1.4.0` | Mission Control | Atlas Release 1.4 - Mission Control |

Prior tags (`v0.4.0` … `v0.9.0`) cover pre-Version 1 sprint milestones.

---

**Atlas Version 1 is frozen.** Version 2 development may begin.
