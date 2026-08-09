# Recruit AI V2 — Stage-1 Operations Playbook

**Status:** Canonical Stage-1 monitoring + incident-response playbook  
**Production main (acceptance tip):** `fd4d6c6b5e495cb4b00d0488508b213f1cf14711`  
**Production acceptance:** ACCEPTED  
**Stage-1 observability:** DEPLOYED (`recruit_ai_v2.*` via `whatsapp_pipeline`)  
**Stage-1 operations:** READY  
**Default production posture:** execution **OFF** until Meta-approved controlled rollout  

Related rules: PR #88 post-execution ownership (hardened as **BR-125**), **BR-111** / **BR-112**, **BR-113**, **BR-120**–**BR-127**.  
Related code (read-only reference): `backend/core/recruitAiV2/stage1Observability.js`

---

## 1. Purpose and scope

This playbook covers **Recruit AI V2 Stage-1 controlled rollout** only:

- Execution allowlist: **primary RVP only** (Team Vision org + primary RVP user).
- Authoring may remain ON for Team Vision + primary RVP; it does **not** authorize mutations.
- Until Meta-approved Stage-1 enablement, keep:

  - `RECRUIT_AI_V2_EXECUTION_ENABLED=false`
  - `RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED=false`

- Observability is stdout / Railway log-drain JSON under `component=whatsapp_pipeline` with normalized `stage` / `event` = `recruit_ai_v2.*`.
- Telemetry is **best-effort and non-authoritative**. It must never drive booking retries.

**Out of scope:** widening allowlists, historical subject cleanup, warehouse/Datadog build-out, Meta App Review submissions, product behavior changes.

---

## 2. Production acceptance checkpoint

Before treating Stage-1 as ready to enable (after Meta approval):

| Checkpoint | Evidence |
|------------|----------|
| End-to-end create path accepted | Fresh subject canary (Adianez / `+17867198753`): one Atlas appointment + one Calendar event + durable confirmed |
| PR #88 ownership | V2 owns confirmed durable + `appointment_confirmed` reply after successful create; CE must not own confirmation |
| BR-120 – BR-127 | Identity bridge, Calendar rollback, reconcile, occupation optional, schedule intent recovery, post-create ownership, deferred continuity, qualification sync |
| Stage-1 telemetry | PR #93 merged; `stage1Observability.js` on main |
| Kill-switch proven | Both execution flags set false, redeploy, health green, authoring unchanged |

**Canonical allowlist IDs (Stage-1):**

- Organization: `00000000-0000-4000-8000-000000000001`
- Primary RVP: `33ad243a-9d00-4a4d-810b-df2762c0f076`

---

## 3. Monitoring query cookbook

### Shared query base

Railway / log-drain filter:

```text
component="whatsapp_pipeline" AND stage="recruit_ai_v2.<event_suffix>"
```

Also valid: search `stage:recruit_ai_v2.` or JSON field `event` equal to the full event name.

Each line is JSON shaped roughly as:

```json
{
  "ts": "…",
  "component": "whatsapp_pipeline",
  "stage": "recruit_ai_v2.create_appointment.succeeded",
  "event": "recruit_ai_v2.create_appointment.succeeded",
  "organizationId": "…",
  "agentId": "…",
  "prospectId": "…",
  "phone": "…",
  "decisionCode": "create_appointment",
  "reasonCodes": [],
  "appointmentId": "…",
  "calendarEventId": "…",
  "correlationId": "…",
  "outcome": "success"
}
```

### Per-event recipes

| Event | Filter | Display fields | Healthy pattern | Abnormal pattern | Severity | Immediate action | Kill execution? |
|-------|--------|----------------|-----------------|------------------|----------|------------------|-----------------|
| `recruit_ai_v2.create_appointment.attempted` | `stage="recruit_ai_v2.create_appointment.attempted"` | ts, org, agent, prospect, phone, correlationId, detail (slot) | Each authorized create attempt; agent = primary RVP when Stage-1 ON | Attempt from unexpected agent/org | P2 if wrong allowlist | Confirm flags/allowlist | Only if cross-org / unexpected user while ON |
| `recruit_ai_v2.create_appointment.succeeded` | `…succeeded` | + appointmentId, calendarEventId, idempotent, reconciled | Roughly one success per clean attempt; outcome `success` or `idempotent_success` | Success without appointmentId; reconcile storms | P1 if orphan/reconcile risk | Inspect appt + Calendar + durable | If customer inconsistency risk |
| `recruit_ai_v2.create_appointment.failed` | `…failed` | reasonCodes, detail, appointmentId | Rare; clean fail after rollback OK | Fail plus live active appt; fail then success same correlation without clarity | P1 if dirty | Read-only reconcile; kill if dirty | Yes if dirty state |
| `recruit_ai_v2.schedule_workflow_rollback` | `…schedule_workflow_rollback` | appointmentId, calendarEventId, phase, reasonCodes | Pairs with failed create; appointment ends cancelled | Rollback without domain cancel; Calendar/Atlas diverge | P1 | Check Atlas status + Calendar | Yes if still `scheduled` after rollback |
| `recruit_ai_v2.br125.reclaim.attempted` | `…br125.reclaim.attempted` | phone, allowExecution, detail | Occasional soft-timeout reclaim | Repeated attempts same phone | P2 | Allow reclaim settle | No unless mismatch follows |
| `recruit_ai_v2.br125.reclaim.succeeded` | `…br125.reclaim.succeeded` | appointmentId, source | After timeout → owned `reply.delivered` owner=v2 | Succeeded without V2 confirmation delivery | P1 | Compare durable vs appointment | If mismatch |
| `recruit_ai_v2.br125.reclaim.failed` | `…br125.reclaim.failed` | reasonCodes | Rare deferred/protect path | Failed after mutation already happened | P1 / P2 | Inspect active appt + durable | Yes if create already mutated |
| `recruit_ai_v2.duplicate.appointment_detected` | `…duplicate.appointment_detected` | appointmentId, detail, slot | **Zero** in Stage-1 | Any ≥1 | **P1** | Kill-switch → inspect actives | **YES immediately** |
| `recruit_ai_v2.mismatch.durable_confirmed_no_active` | that stage | durable appointmentId, phone | **Zero** | Any | **P1** | Kill; read-only truth check | **YES** |
| `recruit_ai_v2.mismatch.active_unconfirmed_durable` | that stage | appointmentId, source | Brief transient then reclaim success OK | Persists without reclaim success | **P1** | Kill if unrepaired | **YES if unresolved** |
| `recruit_ai_v2.ce_fallthrough.after_v2_ownership` | that stage | reasonCodes, decisionCode, allowExecution | **Zero** after create ownership | Any after create | **P1** | Kill; inspect outbound text | **YES** |
| `recruit_ai_v2.calendar.create_failed` | that stage | detail, phone, agent | Rare; no appointment persist | Atlas later scheduled without event | P1 | Kill if partial write | Yes if inconsistent |
| `recruit_ai_v2.calendar.rollback_failed` | that stage | calendarEventId, phase, detail | Domain cancel still succeeded | Cal present while Atlas cancelled (or reverse) | P1 | Manual Calendar/Atlas reconcile | Yes if customer-visible inconsistency |
| `recruit_ai_v2.execution.authz_denied` | that stage | agentId, reasonCodes | Expected for non-RVP; rare for RVP | Primary RVP denied while Stage-1 ON | P2 | Check allowlist/env | No (deny is safe) |
| `recruit_ai_v2.execution.gate_disabled` | that stage | allowExecution | **Normal whenever execution OFF** | While Stage-1 ON and RVP create expected | P2 | Confirm flags | No |
| `recruit_ai_v2.execution.unsupported_mutation` | that stage | action, reasonCodes | Occasional unsupported proposals | Action flood | P2 | Confirm only `create_appointment` | No |
| `recruit_ai_v2.reply.delivered` | that stage | **owner**, replyType, deliverySuccess, appointmentId, outboundIntent | After success: `owner=v2`, replyType `appointment_confirmed`, deliverySuccess true | `owner=ce` after create; deliverySuccess false | P1 for CE ownership; P2 for delivery fail | Kill if CE owned confirmation | Yes if CE took confirmation |

**Per-create correlation recipe:** filter by `correlationId` or `phone` ±2 minutes → `attempted` → `succeeded`/`failed` → optional reclaim → `reply.delivered` with `owner=v2`.

**Intentional omission:** `recruit_ai_v2.duplicate.calendar_detected` is **not** deployed (no reliable determination without new behavioral probes).

---

## 4. Common telemetry envelope

Emitted fields (nulls tolerated):

| Field | Meaning |
|-------|---------|
| `organizationId` | Tenant org |
| `agentId` | Acting RVP / interviewer user id |
| `prospectId` | Canonical core prospect id when known |
| `phone` | E.164 prospect phone |
| `decisionCode` | V2 next action (often `create_appointment`) |
| `reasonCodes` | Array of machine reasons |
| `appointmentId` | Atlas appointment id when known |
| `calendarEventId` | Google Calendar event id when known |
| `correlationId` | Usually inbound provider message id |
| `outcome` | e.g. `attempted`, `success`, `failure`, `rollback`, `mismatch` |

Also commonly present: `owner`, `replyType` / `templateKey`, `outboundIntent`, `deliverySuccess`, `idempotent`, `reconciled`, `phase`, `detail`, `source`, `allowExecution`.

---

## 5. KPI definitions

Window: UTC calendar day or rolling 24h (prefer explicit UTC day for Stage-1 sign-off).

| KPI | Definition |
|-----|------------|
| Create attempts | count `recruit_ai_v2.create_appointment.attempted` |
| Create successes | count `…succeeded` |
| Create failures | count `…failed` |
| Create success rate | successes / max(attempts, 1) |
| Rollback count / rate | count `schedule_workflow_rollback` / max(attempts, 1) |
| Calendar failure rate | (`calendar.create_failed` + `calendar.rollback_failed`) / max(attempts, 1) |
| BR-125 reclaim attempts / successes / failures | counts of `br125.reclaim.*` |
| BR-125 reclaim success rate | succeeded / max(attempted, 1) |
| Durable↔appointment mismatch count | both mismatch events |
| Duplicate appointment count | `duplicate.appointment_detected` |
| CE fallthrough-after-ownership count | `ce_fallthrough.after_v2_ownership` |
| V2 confirmation delivery success | `reply.delivered` where `owner=v2` AND replyType ≈ `appointment_confirmed` AND `deliverySuccess=true`, divided by create successes |
| Authz denials | count `execution.authz_denied` (split primary RVP vs other) |

**Operator note:** high `execution.gate_disabled` volume while execution is OFF is expected — exclude from Stage-1 health ratios; use only when flags should be ON.

---

## 6. Alert matrix

### P1 / immediate kill-switch

| Condition | Threshold (Stage-1 low volume) |
|-----------|--------------------------------|
| Any duplicate appointment | ≥1 |
| Any unresolved durable↔appointment mismatch | ≥1 |
| Any CE fallthrough after V2 mutation ownership | ≥1 |
| Any orphan active appointment (failed path + live appt / unrepaired mismatch) | ≥1 |
| Cross-org / non-allowlisted execution while ON | ≥1 |
| Calendar/Atlas inconsistent partial state | ≥1 |
| BR-125 reclaim failure **after mutation** | ≥1 |

### P2 / investigate

| Condition | Threshold |
|-----------|-----------|
| Clean authorized create failure with clean rollback | ≥1 |
| Confirmation delivery failure (`owner=v2`, `deliverySuccess=false`) | ≥1 |
| Authz denial for expected primary RVP while Stage-1 ON | ≥1 |
| Repeated BR-125 reclaim failures without mutation | ≥2 / 30m |
| Clean rollback spike | ≥2 clean rollbacks / 1h → escalate toward P1 pattern review |

Authz denials for non-allowlisted users are expected (info) when allowlists work.

---

## 7. P1 incident playbook

1. **Kill execution immediately** (kill-switch below).
2. **Do not retry** create for the affected phone.
3. **Freeze** further WhatsApp experimentation on that phone.
4. **Inspect (read-only):**
   - Atlas `atlas_appointments` for the phone / core prospect id
   - Google Calendar event linkage
   - Durable `recruit_ai_conversation_contexts` appointment block
   - Outbound / `reply.delivered` and conversation logs
5. **Classify before any cleanup:** duplicate · mismatch · CE ownership · Calendar orphan · clean fail.
6. Escalate with classification notes; cleanup only after written classification.

---

## 8. P2 incident playbook

1. Leave execution ON **only** if allowlist intact and no P1 signals are present.
2. Capture `correlationId`, phone, `reasonCodes`, appointment/Calendar ids.
3. Confirm failure path was clean (no live orphan; or cancelled + Calendar consistent).
4. Fix config / Calendar credentials / slot availability as needed.
5. Schedule a later controlled canary if required — **no reactive second create** on the same failure.

---

## 9. Kill-switch procedure

Set **only**:

```bash
RECRUIT_AI_V2_EXECUTION_ENABLED=false
RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED=false
```

Then:

1. Redeploy (variable update typically triggers Railway redeploy).
2. Confirm Railway **SUCCESS**.
3. Confirm `/health` = **200**.
4. Confirm `/health/production` → `mvpReady=true`, `blockers=[]`.
5. Confirm both execution flags remain **`false`**.
6. Confirm authoring allowlists unchanged (Team Vision org + primary RVP).
7. Freeze live execution (authoring may stay ON for speak-only).
8. Inspect authoritative appointment / Calendar / durable state **before** any cleanup.

---

## 10. Stage-1 launch checklist

- [ ] Meta approval for intended WhatsApp posture (in-window freeform and/or templates)
- [ ] This playbook reviewed by the on-call operator
- [ ] Railway filters bookmarked for all deployed `recruit_ai_v2.*` stages
- [ ] Kill-switch verified within the last 7 days
- [ ] Execution allowlist: Team Vision org + **primary RVP only**
- [ ] Authoring unchanged
- [ ] `/health` and `/health/production` green on current main
- [ ] Observability helper + events present on deployed SHA
- [ ] No open P1 residue on controlled subjects
- [ ] Human ready for controlled messaging
- [ ] Operator watching logs for the **first 60 minutes** of each enablement session

---

## 11. Stage-1 → small Team Vision pilot promotion gates

Widen execution beyond the primary RVP **only** after **all** gates below and written sign-off.

| Gate | Criterion | Why conservative |
|------|-----------|------------------|
| Successful real creates | **≥5** clean V2 creates | Low daily volume; need a real sample |
| Calendar spread | Across **≥5 calendar days** | Covers availability/daypart variance |
| Subjects | Distinct phones preferred | Avoid one-path overfitting |
| Duplicates | **0** | Zero tolerance |
| Unresolved rollbacks / orphans | **0** | Zero tolerance |
| Durable↔appointment consistency | **100%** (no unresolved mismatch) | Telemetry contract for Stage-1 |
| V2 confirmation ownership | **100%** of successes with `reply.delivered` `owner=v2` | PR #88 / BR-125 |
| CE fallthrough after ownership | **0** | |
| Calendar success | **≥4/5** successes with `calendarEventId`; allow ≤1 clean infra failure **with no orphan** | Infra may flake; customer state must not |
| Observation | Continuous watch during creates + **next-day 24h** residue check | Catch delayed sync issues |
| Kill-switch | Re-verified after Stage-1 | Muscle memory |
| Sign-off | Written approval before widening allowlist | Explicit control |

---

## 12. Meta-dependent items

These are **not** Atlas create-path blockers, but they gate commercial WhatsApp enablement:

- Meta App Review
- Production messaging posture / policy
- Outside-24h window approved templates (e.g. interview confirmation)
- Locale / template variable compliance
- Production WABA / phone_number_id entitlements beyond canary use

---

## 13. Deferred technical cleanup

May wait until after Stage-1 begins:

- Legacy `CONVERSATION_ENGINE_REPLY` outboundIntent rename (compat currently required)
- Email → core prospect enrichment
- Known full-suite test baseline assertion drifts (3 known failures)
- Optional Calendar duplicate telemetry when reliable
- Log warehouse / Datadog (stdout sufficient for Stage-1)
- Historical test subject residue cleanup

---

## 14. Explicit rollout rule

**DO NOT** widen execution beyond the primary RVP until Stage-1 promotion gates in §11 are satisfied and signed off.

Keep execution OFF by default. Authoring ≠ execution. Observability ≠ permission to retry.

STOP FOR REVIEW anytime a P1 signal fires.
