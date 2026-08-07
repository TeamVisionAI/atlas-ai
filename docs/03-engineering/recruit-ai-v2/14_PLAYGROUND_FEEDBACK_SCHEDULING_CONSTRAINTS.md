# Recruit AI v2 — Playground Feedback Fix #4

**Rule:** BR-084 — Recruit AI Scheduling Constraint and Direct-Time Resolution  
**Status:** Implemented (v2 advisory/shadow/playground pipeline only; execution OFF)  
**Simulator:** `work-until-5-direct-time-negotiation`

## Defect conversation

After Orlando → Zoom → day-part:

1. `Trabajo hasta las 5` → treated as scheduling counteroffer  
2. `6?` → trapped as incomplete day-part  
3. `6:30?` → unknown → human escalate  

## Root causes

1. **Availability as counteroffer** — `a las 5` time parse had no constraint intent; hard counteroffer/mismatch path ran during day-part.  
2. **Day-part gate** — `looksLikeAmbiguousFragment` treated `6?` (length ≤ 2) as incomplete day-part before time intents.  
3. **`6:30?` parse/escalate** — bare `HH:MM` required OVERRIDE phase (absent in qualification day-part); unknown then hit clarification→handoff.

## Fixes

- `schedulingConstraints.js` — availability constraints vs direct time proposals  
- Direct time overrides pending day-part; PM bias from after-5 / evening context  
- Candidate replacement history; one active `proposedTime`  
- Unavailable slots → alternatives **without** human handoff  
- Handoff copy requires `requiresHuman=true`

## Production posture (unchanged)

- Context capture 100% Team Vision  
- Shadow 10% Team Vision  
- v2 execution OFF  
- Live CE authoritative  
- sideEffectAuthorizer deny-all  
