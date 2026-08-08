# BR-107 — Available-Slot Offering After a Time Constraint

**Status:** Implemented — read-only `SchedulingAvailabilityReader` + orchestrator injection. Execution remains OFF. Never fabricate slots.  
**Business rule:** BR-107  
**Depends on:** BR-081, BR-084, BR-102, BR-103, BR-105; Sprint 22 `appointmentSchedulingEngine.getAvailableSlots`; FreeBusy via `googleCalendarIntegrationService.queryFreeBusy`  
**Adapter:** `backend/core/recruitAiV2/schedulingAvailabilityReader.js`  
**Tests:** `backend/test/recruitAiV2ReadonlySlotOfferingBr107.test.js`  
**Simulator:** `readonly-slot-offering-after-constraint`

## Desired Team Vision UX

After a constraint such as `despues de las 5`, when a safe read succeeds:

> Tengo disponible a las {slotA} y a las {slotB}. ¿Cuál te funciona mejor?

Avoid repeating the prospect’s constraint (“anoto que puedes después de las 5… ¿Qué hora…?”) when real availability can be offered.

Example times are **illustrative only**. Never invent slots.

---

## Inspection summary (canonical truth)

| Topic | Finding |
|---|---|
| Canonical availability | **Sprint 22** `appointmentSchedulingEngine.getAvailableSlots` via `appointmentApplicationService.getSlots` / `GET /api/appointments/availability` |
| Google Calendar | Org OAuth integration; **FreeBusy implemented** (`queryFreeBusy`) and used when `respectPersonalCalendar !== false` |
| FreeBusy scope | Organization-connected calendar (`calendarId` or `primary`), not a separate per-agent personal calendar API |
| `capacity.json` / `bookSlot` | **Legacy** live-CE / Mission Control path (15-min grid, max 2 concurrent). **Not** canonical for Sprint 22 appointment truth — do **not** offer v2 slots from it |
| Slot duration | **30 minutes** recruiting interview; grid `SLOT_INTERVAL_MINUTES = 30`; typical `bufferAfterMinutes = 15` |
| Timezone | Agent appointment profile `defaults.timezone` (fallback `America/New_York`); BR-079 org-local windows for dashboards — reader should use profile timezone returned by the engine |
| Office vs Zoom | Availability engine is **modality-agnostic** (same open intervals). BR-076 (Zoom URL) / BR-077 (office address) apply at **appointment snapshot/write**, not at availability read |
| Org/user scoping | Requires `organizationId` + **`agentId`** (working schedule + Atlas appointments for that agent; Google busy is org calendar) |
| v2 adapter today | **None.** Orchestrator accepts `availability` but callers pass `null` |

### Related BRs

| BR | Relevance |
|---|---|
| BR-076 / BR-077 | Snapshot Zoom URL / office address on write — not part of read path |
| BR-079 | Org timezone for calendar windows — align day keys with org/agent TZ |
| BR-080 | Owner / default recruiter resolution — **source of `agentId` for reads**; must not mutate assignment/attention |
| BR-084 / BR-085 | Constraint + date/modality semantics v2 already has |
| BR-105 | Current fallback: ask “¿Qué hora después de las 5…?” when no read result |

---

## Target architecture (reuse only)

```
Recruit AI v2 (orchestrator / shadow / playground)
  → SchedulingAvailabilityReader  (NEW thin adapter — no second engine)
      → appointmentApplicationService.getSlots
          → appointmentSchedulingEngine.getAvailableSlots
              → agent workingSchedule
              → atlas_appointments busy (+ buffers)
              → googleCalendarIntegrationService.queryFreeBusy (optional overlay)
  → filter by prospect constraints (earliest/latest/day-part)
  → select ≤2 candidates (spacing)
  → inject { availability } into decideConversationTurn
  → render “Tengo disponible…”
```

**NO writes.** Reader must not call `createAppointment`, `bookSlot`, Calendar create/update/delete, WhatsApp, or BR-080 mutators.

### Recommended adapter contract

```js
// conceptual — not implemented
readCandidateSlots({
  organizationId,
  agentId,           // required — from prospect owner / default recruiter (BR-080 read)
  date, dateEnd,     // org-local day keys (BR-079 / profile TZ)
  purpose: "recruiting_interview",
  constraints: { earliestTime, latestTime, dayPart }, // from knownFacts.availabilityConstraint
  maxCandidates: 2,
  spacingMinutes: 60 // default = 2 × SLOT_INTERVAL (30)
}) → {
  ok: boolean,
  timezone,
  candidates: [{ dateKey, timeKey, startTimeISO, endTimeISO, durationMinutes }],
  reason: null | "missing_agent" | "provider_failure" | "no_slots" | "unsafe_context",
  availabilitySource: "agent_schedule" | "agent_schedule_and_calendar" | null
}
```

Map into existing decision contract:

```js
availability = {
  checked: true,
  requestedSlotAvailable: null, // N/A for open constraint offer
  nearestAlternatives: candidates, // ≤2
  providerFailure: false
}
```

If `ok === false` / missing agent / unsafe context → **do not invent**; keep BR-105 ask-for-time / `awaiting_availability` path.

---

## Candidate selection (deterministic)

Engine may return up to `maxResults` (default 8) on a 30-min grid. Reader then:

1. **Filter** — keep slots with `timeKey >= earliestTime` (and `<= latestTime` if set).  
   - Do **not** rely solely on engine `timePreference: "afternoon"` for after-5: `AFTERNOON_RANGE` ends at **18:00**, which would drop 19:00. Use `timePreference: "any"` + post-filter.
2. **Slot A** = first remaining slot chronologically.
3. **Slot B** = earliest later slot with start ≥ Slot A + `spacingMinutes` (default **90** = 3×30). If none, take next later real slot rather than inventing.
4. Cap at **2**. If 1 → offer one. If 0 → no-slot path.

Example (real engine output only):  
`17:30, 17:45*, 18:00, 19:00, 19:30` → prefer **17:30 + 19:00**  
(\*17:45 would not appear on a strict 30-min Sprint 22 grid; included only to illustrate spacing intent.)

---

## Shadow / Playground safety

| Control | Requirement |
|---|---|
| Execution | Remains OFF / unset |
| SideEffectAuthorizer | Deny-all writes unchanged |
| Reader | Pure read; no Calendar write APIs |
| BR-080 | Read owner/default recruiter only — no assignment/ack mutation |
| WhatsApp | Zero sends |
| Fabrication | Forbidden; missing read → BR-105 fallback |
| Playground | May call same reader only if agent/org resolvable and side-effect free; else fixture inject or ask-for-time |

---

## Known risks / blockers (implementation sprint)

1. **`agentId` resolution** — v2 context often lacks agent; must resolve read-only from prospect `owner_user_id` or org `defaultRecruiterUserId` (BR-080) without mutating ownership.
2. **Working schedule hours** — Default profile blocks are often `09:00–17:00`, which yields **no** slots after 17:00. Real after-5 offers require the agent’s configured evening hours.
3. **Afternoon preference trap** — Engine afternoon ends 18:00; after-5 must post-filter with `timePreference: "any"`.
4. **Google FreeBusy org calendar** — Busy overlay is org-connected calendar, not necessarily every recruiter’s personal calendar.
5. **Dual-stack risk** — Never call `capacityEngine` / `capacity.json` for v2 offers while booking is Sprint 22.
6. **Date resolution** — Need a concrete day (today/tomorrow/preferred date from BR-085) before calling `getSlots`.

---

## Implementation plan (when authorized)

1. Add `backend/core/recruitAiV2/schedulingAvailabilityReader.js` wrapping `appointmentApplicationService.getSlots` only.
2. Resolve `agentId` read-only; fail closed to BR-105 if unresolved.
3. Constraint filter + spacing selection (unit-tested).
4. Wire optional call in orchestrator before `decideConversationTurn` when constraint present and ids exist.
5. Decision/render: 2-slot / 1-slot / 0-slot / read-unavailable fallback.
6. Shadow + playground use same reader or explicit fixtures; never fabricate.
7. Tests: spacing, filter, no writes, execution OFF, BR-105 fallback, BR-080 non-mutation.
8. **No migration. No Railway var changes.**

## Related

- Architecture intent: `04_RECRUIT_AI_V2_ARCHITECTURE.md` (Tools layer)
- Constraint resume: `33_CONSTRAINT_PRESERVING_RESUME.md` (BR-105)
