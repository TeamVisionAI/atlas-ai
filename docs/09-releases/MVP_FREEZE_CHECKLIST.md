# Atlas MVP Freeze Checklist

**Freeze objective:** Meta App Review + production deployment for the recruiting pipeline:

```
Meta Ad → WhatsApp → AI Conversation → Qualification → Appointment Scheduling
  → Mission Creation → Mission Control → Recruiter Handoff
```

**Canonical rules:** BR-049 (Conversation delegates to business engines) · BR-050 (single appointment lifecycle)

**Last updated:** 2026-08-01 (MVP Freeze Milestone 2)

---

## Workflow checklist

| Step | Requirement | Status | Evidence / notes |
|------|-------------|--------|------------------|
| 1 | Meta Ad → WhatsApp lead intake | ⚠️ Partial | `facebookLeadIntakeService.js` — live WABA may be restricted |
| 2 | WhatsApp webhook → Conversation Engine | ✅ Wired | `whatsappInboundPipeline` → `communicationHub` → `conversationEngine` |
| 3 | Simulator uses production Conversation Engine | ✅ | `/dev/simulator/message` → `processNormalizedInboundMessage` |
| 4 | AI qualification (Team Vision rules) | ✅ | `semanticConversationEngine` + `businessRulesEngine` |
| 5 | Appointment booking via production services | ✅ **Milestone 1** | `completeInterview` → `executeScheduleInterview` (BR-049) |
| 6 | Persisted `atlas_appointments` record | ✅ | `missionExecutionApplicationService` → `appointmentApplicationService` |
| 7 | Prospect cache + workflow sync on schedule | ✅ | `executeScheduleInterview` rollback-safe path |
| 8 | Mission Control reflects appointment state | ✅ | MC interview block + handoff use canonical appointment resolver (BR-050) |
| 9 | Conversation outcome recording | ⚠️ Partial | Manual in MC — `conversationOutcomeEngine` |
| 10 | Recruiter handoff signal | ✅ **Milestone 2** | `buildHandoff` → `resolveRecruiterHandoffForProspect` + `appointmentHandoffReadModel` (BR-050) |
| 11 | Meta review docs match deployed code | ❌ | `Meta_Approval_Portfolio.md` stale vs Sprint 11.4 Phase A |
| 12 | Live E2E smoke test (Ad → confirmed interview) | ❌ | Blocked by WABA + env credentials |
| 13 | Production security checklist | ⚠️ | Bootstrap auth OK for demo; LC1 login deferred |
| 14 | `GET /health/production` passes | ⚠️ | Requires Railway env (Supabase, Google, WhatsApp) |

---

## Completed milestones (this freeze)

### Milestone 1 — BR-049 conversation schedule delegation ✅

- `conversationScheduleDelegation.js` maps conversation state → mission payload
- `semanticConversationEngine.completeInterview()` delegates to `executeScheduleInterview`
- Mission Control `buildInterviewBlock` aligned with Prospect Workspace (latest terminal appointment)

### Milestone 2 — BR-050 canonical recruiter handoff ✅

- `appointmentHandoffReadModel.js` — pure handoff projection from persisted lifecycle
- `appointmentListService.resolveRecruiterHandoffForProspect()` — canonical appointment fetch + handoff
- `conversationEngine.buildHandoff()` / `finalizeReply()` delegate to appointment resolver (not `current_step`)
- Simulator readiness uses `handoffPhase` / `handoffReady` instead of `current_step === "CONFIRMED"`
- `backend/test/appointmentHandoffReadModel.test.js` — lifecycle matrix + stale workflow cases

---

## Remaining blockers (priority order)

| P | Blocker | Owner | Unblocks |
|---|---------|-------|----------|
| **P0** | Meta WhatsApp WABA restricted / `wabaID` null | Meta / ops | Live review screenshots, production messaging |
| **P0** | No documented live E2E smoke pass | QA / ops | Production readiness sign-off |
| **P1** | Meta portfolio docs stale (`Meta_Approval_Portfolio.md`) | Docs | Review submission consistency |
| **P1** | Workflow/agent state in JSON files (Railway durability) | Backend | Mid-conversation state loss |
| **P2** | Messenger uses `AIAdapter`, not semantic engine | Out of MVP scope unless WABA blocked | Alternate channel pivot |
| **P2** | `completeAppointment` frontend unwrap | Frontend | Optimistic UI after complete |
| **P2** | Username/password auth for production recruiters | Auth | Post-review rollout |

---

## Recommended implementation order

1. ✅ **BR-049 schedule delegation** (conversation → `executeScheduleInterview`)
2. ✅ **BR-050 handoff + `buildHandoff`** — resolve lifecycle via appointment record
3. **Meta doc sync** — update portfolio + screenshot checklist to match Phase A
4. **Simulator review verification** — `node backend/dev/verifySprint21_0.js` for Meta evidence
5. **Production pipeline probe** — `node backend/dev/verifyProductionPipeline.js` on Railway
6. **Live E2E script** — document + run when WABA unblocked
7. Workflow state durability (if time permits before freeze)

---

## Estimated completion

| Area | % complete |
|------|------------|
| Conversation + qualification code path | **~90%** |
| Appointment persistence + MC/handoff alignment | **~82%** (post Milestone 2) |
| Meta review operational readiness | **~45%** (external WABA + E2E) |
| Documentation / evidence package | **~65%** |
| **Overall MVP freeze** | **~72%** |

---

## Verification commands

```bash
# Unit tests
npm test

# Conversation schedule delegation
node --test backend/test/conversationScheduleDelegation.test.js

# Canonical recruiter handoff (BR-050)
node --test backend/test/appointmentHandoffReadModel.test.js

# Sprint 11.4 wiring (simulator guard)
node backend/dev/verifySprint11_4.js

# Meta review simulator bridge
node backend/dev/verifySprint21_0.js

# Production readiness (requires env)
node backend/dev/verifyProductionPipeline.js
```

---

## Freeze rules (do not violate)

1. Fix bugs before new features
2. No architecture redesign — delegate to existing engines
3. Preserve BR-049 and BR-050
4. Keep app deployable on every commit
5. No scope outside Meta review unless it unblocks MVP
