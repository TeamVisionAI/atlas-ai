# Sprint 8A.1 — Workflow Foundation

**Status:** Implemented (read-only integration)

## What shipped

- Canonical milestone mapping (`milestoneMapper.js`)
- Workflow ownership persistence (`workflowStateStore.json`)
- Event engine infrastructure (`eventEngine.js`, `workflowEventService.js`)
- Mission Control API extended with additive `workflow` object
- BR-034, BR-035 in `BUSINESS_RULES.md`
- `ATLAS_GLOSSARY.md`

## What did NOT ship (by design)

- No UI changes
- No conversation behavior changes
- No WhatsApp integration changes
- No 24h stall detection (8A.2)
- No human advancement API (8A.3)
- No automatic `emit()` on transitions yet

## Mission Control API addition

`GET /api/mission-control/:phone` now includes:

```json
{
  "workflow": {
    "canonicalMilestone": "QUALIFICATION",
    "workflowOwnership": "ATLAS",
    "needsHumanAttention": false,
    "stalledAt": null,
    "missionControlPriority": 5,
    "missionControlPriorityTier": "ATLAS_ACTIVE",
    "source": { "milestone": "computed", "ownership": "computed" },
    "mappedFrom": {
      "currentStep": "GREETING",
      "agentOutcome": null,
      "missingFieldCount": 2
    }
  }
}
```

All existing fields (`prospect`, `brain`, `businessRules`, `atlasBrief`, `agentState`, `availableActions`) unchanged.

## Database

Run `backend/database/migrations/001_workflow_foundation.sql` in Supabase to enable `workflow_events` persistence.
