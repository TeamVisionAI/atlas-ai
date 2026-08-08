# BR-109 — Playground Rolling Availability Path

**Status:** Implemented (read-only; execution OFF)  
**Depends on:** BR-108, BR-107, BR-105  
**Related UI:** Operations Center → Recruit AI v2 Custom Conversation Playground

## Defect

Production Playground UI returned:

> Entendido — anoto que puedes después de las 5:00 PM. ¿Qué hora después de las 5:00 PM te funciona mejor?

for `despues de las 5` even though BR-108 was deployed.

## Root cause

1. Ops Playground HTTP already used **async** `sendPlaygroundTurnAsync` (not the sync fixture helper).
2. Playground creates synthetic `sim-*` prospects with **no owner / agentId**.
3. Team Vision `organization_settings` has **no configured default recruiter**.
4. Agent resolution returned `unresolved` → `missing_agent` → `AVAILABILITY_READ_UNAVAILABLE` → legacy ask-time template with “anoto…”.

Isolated smokes passed because they injected an explicit Team Vision owner/agent that the real UI session never carried.

## Fix

- Resolve a Playground read-only agent at session start (and lazily on turn if needed):
  - explicit agent / owner
  - org default recruiter
  - deterministic org operating RVP (`findActiveOrganizationRvp`)
- Never mutate BR-080.
- Remove “anoto…” narration from ordinary constraint acknowledgement copy.

## API (unchanged paths; session start is async)

| Method | Path |
|---|---|
| POST | `/api/operations/simulator/recruit-ai-v2/playground/sessions` |
| POST | `/api/operations/simulator/recruit-ai-v2/playground/sessions/:id/turns` |

Turns remain async Sprint 22 read-capable.
