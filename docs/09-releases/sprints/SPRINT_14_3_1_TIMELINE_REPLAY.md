# Sprint 14.3.1 — Timeline Projection Recovery

## AI Summary

Post–Sprint 14.3 hardening adds idempotent Timeline replay from persisted Business Events. `TimelineReplayService` rebuilds the projection safely; `rebuildTimelineProjection.js` provides an operational CLI. Business Events remain authoritative; Timeline is disposable/rebuildable.

## Document control

| Field | Value |
|-------|-------|
| **Sprint** | 14.3.1 |
| **Status** | Complete |
| **Date** | 2026-07-24 |
| **Owner** | Atlas Engineering |

---

## Delivered

| Area | Path |
|------|------|
| Shared projection | `application/TimelineProjection.js` |
| Replay service | `application/TimelineReplayService.js` |
| CLI | `backend/dev/rebuildTimelineProjection.js` |
| Projector hardening | explicit failure logging in `TimelineProjector.js` |

---

## Recovery model

- **Authoritative store:** Business Events (append-only, never deleted by replay)
- **Projection store:** Timeline entries (rebuildable, idempotent by `business_event_id`)
- **Live path:** publisher → `TimelineProjector`
- **Recovery path:** `TimelineReplayService.replay()` → same `projectBusinessEvent()` mapping

---

## Safe replay

```bash
# Full replay (requires explicit confirmation)
node backend/dev/rebuildTimelineProjection.js --confirm-full-replay

# One prospect
node backend/dev/rebuildTimelineProjection.js --prospect-id=<uuid>

# Optional date range
node backend/dev/rebuildTimelineProjection.js --prospect-id=<uuid> --from=2026-01-01 --to=2026-12-31
```

Replay summary: `eventsRead`, `entriesCreated`, `entriesSkipped`, `entriesIgnored`, `failures`

Exit code `1` when failures occur.

---

## Related Documents

- [SPRINT_14_3_TIMELINE_ENGINE.md](./SPRINT_14_3_TIMELINE_ENGINE.md)
- [backend/modules/timeline/README.md](../../../backend/modules/timeline/README.md)
