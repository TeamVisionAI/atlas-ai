# Recruit AI v2 — Durable Context Schema (Phase 2)

**Status:** Migration `032` applied; durable context + shadow ledger tables exist.  
**Rule:** BR-081  
**Not a production CE cutover.**

## Tables

### `recruit_ai_conversation_contexts`

Canonical active context row per:

- `organization_id`
- `prospect_id`
- `channel` (default `whatsapp`)

| Column | Purpose |
|---|---|
| `context_json` | Sanitized v2 context snapshot |
| `context_version` | Optimistic concurrency token |
| `schema_version` | Context schema revision |
| `conversation_version` | Logical conversation thread/version |
| `last_inbound_message_id` | Latest inbound provider/message id observed |
| `last_processed_message_id` | Idempotency marker for duplicate webhooks |
| `last_decision_code` | Last v2 `nextAction` |
| `last_language` | Sticky preferred language |
| `needs_human_attention` | Mirrored attention flag (read/write in context table only) |
| `archived_at` | Soft archive timestamp |

Unique active constraint: `(organization_id, prospect_id, channel) WHERE archived_at IS NULL`.

### `recruit_ai_v2_shadow_evaluations`

Stores divergence telemetry (live CE intent vs v2 intent/decision/confidence/proposed side effect). Write path is Phase 3 (`shadowEvaluationService`) and is **disabled by default** via `RECRUIT_AI_V2_SHADOW_ENABLED=false`. See [07_SHADOW_MODE.md](./07_SHADOW_MODE.md).

## Persistence rules

1. Sanitize before write (no tokens, stack traces, hidden reasoning, unmasked phones).
2. Compare-and-set on `context_version`.
3. Identical `last_processed_message_id` ⇒ idempotent no-op.
4. Reconstruct from prospect/appointment/conversation inputs when missing; persist only after a valid v2 evaluation.
5. Do not invent unsupported facts.
6. Do not mutate BR-080 prospect attention/ownership columns from this layer.

## Service API

`backend/core/recruitAiV2/contextPersistenceService.js`

- `createContext`
- `loadContext`
- `saveContext` / `compareAndSaveContext`
- `archiveContext`
- `loadOrReconstruct`
- `listRecentContextVersions` (admin/diagnostics only)

## Next phase

Controlled production enablement of shadow flags (org allowlist + sample rate), then CE cutover behind BR-075 — each requires explicit approval.
