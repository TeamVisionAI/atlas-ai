# Recruit AI v2 — Continuous Context Capture (Phase 3B)

**Rule:** BR-081  
**Status:** Implemented in code (flags default **off**). Not activated in Railway by this PR.

## Separation of rates

| Operation | Target rate | Flag |
|---|---|---|
| Durable context capture | **100%** of eligible TV turns | `RECRUIT_AI_V2_CONTEXT_CAPTURE_*` |
| Shadow evaluation / comparison | **10%** of eligible TV turns | `RECRUIT_AI_V2_SHADOW_*` |

**100% context capture ≠ 100% shadow evaluation.**  
**100% context capture does NOT mean Recruit AI v2 owns the conversation.**

Live `semanticConversationEngine` remains authoritative for customer-visible replies and all production side effects.

## Flow (post-live)

```
inbound persisted
  → live CE (authoritative)
  → live WhatsApp / workflow / appointments as today
  → BR-080 attention updates
  → async scheduleRecruitAiV2PostLiveAdvisory
       → if shadow sampled (10%):
            full v2 interpret→decide→plan→render (side effects denied)
            persist context once + shadow evaluation row
       → else if context capture eligible (100%):
            lightweight interpret→decide-for-patch→persist context
            no shadow row, no customer copy send
  → live return path unaffected
```

## Ordering decision

**Post-live authoritative snapshot.** Context capture/shadow run after live CE and BR-080 so reconstruction mirrors what production committed for the turn. They never block or replace the live response.

## Exactly-once context advancement

A single `inbound_message_id` advances durable context **once**:

- Sampled shadow path persists context inside shadow evaluation (`DEFERRED_TO_SHADOW` for separate capture).
- Unsampled path uses `captureContextTurn` only.
- `last_processed_message_id` idempotency prevents duplicate version increments on webhook replay.
- Optimistic `CONTEXT_VERSION_CONFLICT` / `CONTEXT_UNIQUE_VIOLATION` retries at most once.

## Feature flags (defaults OFF)

```json
{
  "enabled": false,
  "organizationIds": [],
  "sampleRate": 0
}
```

| Variable | Purpose |
|---|---|
| `RECRUIT_AI_V2_CONTEXT_CAPTURE_ENABLED` | Master switch (default false) |
| `RECRUIT_AI_V2_CONTEXT_CAPTURE_ORGANIZATION_IDS` | Required allowlist; empty = none |
| `RECRUIT_AI_V2_CONTEXT_CAPTURE_SAMPLE_RATE` | Target `1.0` when activating |
| `RECRUIT_AI_V2_CONTEXT_CAPTURE_TIMEOUT_MS` | Default 5000 |
| `RECRUIT_AI_V2_CONTEXT_CAPTURE_CONFIG` | Optional JSON override |

Fail-closed on malformed config. Meta Review scopes excluded.

Shadow flags remain independent (`RECRUIT_AI_V2_SHADOW_*` at 10%).

## Eligibility (capture)

Include: valid inbound WhatsApp recruiting prospect messages, same-org, non-duplicate, allowlisted org.

Exclude: Meta Review, closed/do-not-contact, unsupported channels, empty/malformed inbound, empty allowlist.

## Performance expectations

- Async via `setImmediate` (non-blocking to live reply)
- Capture path skips response rendering
- Bounded timeout (default 5s); retries ≤ 1 on conflict only
- No raw transcript growth in `context_json` (sanitized structured fields only)

## Rollback

1. Set `RECRUIT_AI_V2_CONTEXT_CAPTURE_ENABLED=false` (and/or clear allowlist / set sampleRate 0).
2. Shadow can remain at 10% or also be disabled independently.
3. Live CE path unchanged.

## Next activation (separate authorization)

Context capture: Team Vision only, sampleRate `1.0`  
Shadow: Team Vision only, sampleRate `0.10`  
Execution/cutover: OFF
