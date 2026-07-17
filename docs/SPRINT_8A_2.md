# Sprint 8A.2 — Stall Detection & Priority

**Status:** Implemented

## Changes

### Terminology
- Renamed ownership constant `SYSTEM_WAITING` → `WAITING_EVENT`
- Legacy `SYSTEM_WAITING` normalized on read via `normalizeOwnership()`
- Added **BR-036** — Workflow Ownership Transition

### New modules
| Module | Step | Purpose |
|--------|------|---------|
| `stallDetectionEngine.js` | 1 | BR-034 24h stall detection |
| `workflowOwnershipEngine.js` | 2 | Ownership transitions + persistence |
| `workflowTransitionEvents.js` | 3 | Event emission on transitions |
| `missionControlPriorityEngine.js` | 4 | Backend sorted workflow queue |

### API additions (backward compatible)
- `GET /api/mission-control/:phone` → `workflow.stall` object added
- `GET /api/dashboard` → `prioritizedWorkflowQueue` array added

### Unchanged
- Conversation pipeline
- WhatsApp
- Frontend UI
- Legacy Mission Control response fields

## Stall behavior (BR-034)

Evaluated on Mission Control / dashboard read:
1. 24h since last Atlas **outbound**
2. No prospect **inbound** after that outbound
3. Not terminal, not DNC
4. Not awaiting confirmed future interview (`WAITING_EVENT` exempt)

On stall: `workflowOwnership=AGENT`, `needsHumanAttention=true`, events emitted (idempotent per `stallEpisodeKey`).

On prospect reply after stall: ownership restored, `WorkflowResumed` emitted.

## Testing

```bash
node backend/dev/verifySprint8A2.js
```
