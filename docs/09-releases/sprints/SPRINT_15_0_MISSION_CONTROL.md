# Sprint 15.0 — Mission Control Read Model

## AI Summary

Sprint 15.0 implements Mission Control as a projection-backed read model. `MissionControlProjection` registers through `ProjectionEngine`, derives operational metrics exclusively from Business Events, and exposes read-only REST endpoints. No Prospect repository queries for dashboard state.

## Document control

| Field | Value |
|-------|-------|
| **Sprint** | 15.0 |
| **Status** | Complete |
| **Date** | 2026-07-24 |
| **Owner** | Atlas Engineering |

---

## Delivered

| Area | Path |
|------|------|
| Module | `backend/modules/mission-control/` |
| Migration | `006_atlas_mission_control_read_model.sql` |
| Projection | `MissionControlProjection` (`name: "mission-control"`) |
| Verification | `backend/dev/verifyMissionControlProjection.js` |

---

## Read model metrics

- Active Prospects
- New Leads
- Contact Attempts
- Qualified Prospects
- Scheduled Interviews
- Completed Interviews
- Archived Prospects
- Merge Statistics
- Assignment Metrics

---

## REST API (read-only)

| Method | Path |
|--------|------|
| GET | `/api/mission-control` |
| GET | `/api/mission-control/summary` |
| GET | `/api/mission-control/metrics` |

Legacy phone-based Mission Control routes remain at `/api/mission-control/:phone` (mounted after read-model routes).

---

## Architecture constraints

- Business Events are the sole source of truth for Mission Control state
- Replay rebuilds via `ProjectionEngine.replay()` or `MissionControlProjection.replay(events, { rebuild: true })`
- Prospect, Business Event, Projection Framework, and Timeline modules unchanged (architecture-frozen)

---

## Related Documents

- [mission-control/README.md](../../../backend/modules/mission-control/README.md)
- [SPRINT_14_4_PROJECTION_FRAMEWORK.md](./SPRINT_14_4_PROJECTION_FRAMEWORK.md)
- [RFC-009-mission-control-state.md](../../10-rfcs/RFC-009-mission-control-state.md)
- [CURRENT_STATE.md](../../CURRENT_STATE.md)
