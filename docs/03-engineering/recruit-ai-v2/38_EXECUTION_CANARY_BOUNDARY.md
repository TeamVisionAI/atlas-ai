# BR-111 — Recruit AI v2 Execution Canary Boundary

Fail-closed server-side architecture for a **one-user** Team Vision execution canary.  
**Execution remains OFF** until Railway variables are set in a later, explicit step.

## Architecture

```
Recruit conversation (v2 decide path)
  → Interpreter / DecisionEngine      # WHAT should happen (proposal)
  → ResponsePlan / Renderer           # customer copy (no mutation)
  → SideEffectAuthorizer              # GRANT or DENY (server, per mutation)
  → SideEffectExecutor                # translate authorized action
  → Canonical domain service          # HOW lifecycle mutates (BR-049/050)
       missionExecutionApplicationService.executeScheduleInterview
         → Calendar booking + appointment persistence + downstream
  → Orchestrator returns result       # success copy only after canonical success
```

| Layer | Owns | Must not own |
|---|---|---|
| DecisionEngine | proposed `nextAction`, `mayCreateAppointment` | mutation permission |
| SideEffectAuthorizer | exact org/user/flag/profile/action gates | appointment lifecycle |
| SideEffectExecutor | delegation + stale-slot + active-appt idempotency | direct DB lifecycle writes |
| Mission / appointment services | Calendar + appointment + BR-050 transitions | conversation wording |
| Shadow / advisory | comparison + context | `options.allowExecution` |

## Authorization (exact)

ALL required:

1. `RECRUIT_AI_V2_EXECUTION_ENABLED === "true"` (only the string `true`)
2. `organizationId ∈ RECRUIT_AI_V2_EXECUTION_ORGANIZATION_IDS`
3. `actingUserId ∈ RECRUIT_AI_V2_EXECUTION_USER_IDS`
4. `profileConfigured === true` (BR-110)
5. Supported executable action (`create_appointment` only for first canary)
6. Decision explicitly proposes create (`nextAction=create_appointment` **and** `mayCreateAppointment=true`)

Additionally, orchestrator requires `options.allowExecution === true` before calling the executor  
(shadow/advisory must omit this).

**Never authorize from:** role, “being RVP”, tenant allowlist alone, or `nextAction` alone.

## Decision contract

| Field | Meaning |
|---|---|
| `decision.nextAction` | Proposed / desired action |
| `decision.mayCreateAppointment` | Decision proposes create after explicit confirm (not permission) |
| `authorization.authorized` | Server execution permission |
| `execution.performed` | Actions completed via canonical services |
| `audit.proposedAction` / `executionAuthorized` / `actionPerformed` | Unambiguous audit split |

## Canonical mutation path (first canary)

Confirmed slot → re-authorize → `executeAuthorizedSideEffects` →  
`missionExecutionApplicationService.executeScheduleInterview(phone, { dateKey, timeKey, interviewType }, { organizationId, agentId, userId })`.

No direct `atlas_appointments` writes from v2.  
No independent v2 WhatsApp send.  
No parallel appointment lifecycle.

## Idempotency

Before create, resolve active appointment for prospect (`findActiveAppointmentForProspect`).  
If one exists → return it (`idempotent: true`); do not create a second appointment.  
Stale slots fail closed via Sprint 22 `getSlots` re-check immediately before write.

## Availability / office hours

Sprint 22 `appointmentSchedulingEngine.getAvailableSlots` uses the recruiter’s  
`appointmentProfile.workingSchedule`. Organization office hours do **not** truncate  
personal evening/weekend blocks (e.g. Mon–Sat through 9:00 PM, Sunday afternoon).

## Future canary env (DO NOT SET YET)

```text
RECRUIT_AI_V2_EXECUTION_ENABLED=true
RECRUIT_AI_V2_EXECUTION_ORGANIZATION_IDS=00000000-0000-4000-8000-000000000001
RECRUIT_AI_V2_EXECUTION_USER_IDS=33ad243a-9d00-4a4d-810b-df2762c0f076
```

Team Vision org UUID and primary RVP `atlas_users.id` above are the intended allowlist targets.  
Live cutover of WhatsApp authority remains a separate step.
