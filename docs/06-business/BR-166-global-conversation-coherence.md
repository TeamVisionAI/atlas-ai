# BR-166 — Global Conversation Coherence Guard

**Status:** Implemented  
**Scope:** Global Recruit AI v2 live WhatsApp authoring; all tenants/users  
**Depends on:** BR-120, BR-135, BR-142, BR-164

## Rule

Atlas must not deliver an automated Recruit AI reply that is stale or that asks for a fact already resolved in the newest durable conversation context.

Immediately before WhatsApp transport sends a live V2 reply, Atlas reloads the durable context under explicit `organizationId + prospectId + channel` scope and evaluates the authored reply against that newest state.

## Invariants

1. **Newer context wins.** If the durable context version is newer than the version that authored the reply, suppress the older reply.
2. **Resolved facts cannot be re-asked.** A reply may not ask again for a confirmed city/state, work authorization, day-part, or exact scheduling time already known durably.
3. **Conversation progression wins over stale `lastQuestionAsked`.** The newest known facts determine the earliest valid unresolved question.
4. **No phone-only scope.** The guard loads durable state with tenant + canonical prospect identity; phone is fallback identity metadata only.
5. **Fail closed for live V2.** Missing scope, unavailable durable context, or coherence-read failure suppresses the potentially incoherent V2 reply rather than sending it.
6. **No tenant/user exceptions.** No Team Vision, Team Legacy, agent, phone, city, state, or campaign-specific branches.
7. **Legacy CE unchanged.** BR-166 protects live Recruit AI v2 authoring. It does not reinterpret arbitrary legacy CE replies.

## Primary regression canaries

- `Orlando FL` is persisted, then a later turn must never ask what state Orlando is in.
- Confirmed work authorization must never be asked again after an FAQ/interruption.
- A rapid second inbound that advances context must prevent the older in-flight reply from sending afterward.
- Confirmed day-part/time facts must not regress to earlier scheduling questions.

## Observability

Suppressed replies emit `automated_reply_suppressed_conversation_coherence` with sanitized reason/version/question metadata.

Reason codes:

- `COHERENCE_STALE_OUTBOUND`
- `COHERENCE_RESOLVED_FACT_REASK`
- `COHERENCE_SCOPE_MISSING`
- `COHERENCE_CONTEXT_UNAVAILABLE`
- `COHERENCE_GUARD_ERROR`

## Tests

`backend/test/globalConversationCoherenceGuardBr166.test.js`
