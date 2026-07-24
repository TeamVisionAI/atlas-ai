# Mission Control Read Model

Sprint 15.0 — projection-backed operational dashboard state derived exclusively from Business Events.

## Purpose

Mission Control answers *"What is happening right now?"* without querying the Prospect write model. All state is rebuilt from Business Events through the Projection Framework.

## Architecture

```
Business Event published
  → ProjectionEngine.dispatch()
    → MissionControlProjection.handle()
      → MissionControlRepository.applyEvent()

Replay
  → ProjectionEngine.replay({ projectionName: "mission-control" })
    → MissionControlProjection.replay(events)
```

## Metrics

| Metric | Source events |
|--------|---------------|
| Active Prospects | `prospect_created`, `prospect_archived`, `prospect_restored`, `prospect_merged` |
| New Leads | `prospect_created` |
| Contact Attempts | `message_sent`, `call_started` |
| Qualified Prospects | lifecycle `qualified` or `prospect_updated` |
| Scheduled Interviews | `appointment_created`, `appointment_rescheduled` |
| Completed Interviews | `interview_completed` |
| Archived Prospects | `prospect_archived` |
| Merge Statistics | `prospect_merged` |
| Assignment Metrics | `prospect_assigned` |

## Wiring

```javascript
const missionControl = createMissionControlModule({ projectionEngine: projections.engine });

await projections.engine.register(timelineModule.timelineProjection);
await projections.engine.register(missionControl.missionControlProjection);
projections.engine.start();

app.use("/api/mission-control", missionControl.routes); // before legacy phone routes
```

## REST API (read-only)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/mission-control` | Full read model |
| GET | `/api/mission-control/summary` | Lightweight summary |
| GET | `/api/mission-control/metrics` | Aggregated metrics |

## Verification

```bash
node backend/dev/verifyMissionControlProjection.js
node backend/dev/verifyProjectionFramework.js
node backend/dev/verifyTimelineEngine.js
node backend/dev/verifyBusinessEventEngine.js
node backend/dev/verifyProspectEngine.js
```

## Constraints

- No direct subscription to Business Event publisher
- No Prospect repository queries for dashboard state
- Replay rebuilds entirely from Business Events via `ProjectionEngine`
