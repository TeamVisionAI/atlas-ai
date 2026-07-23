# RFC-001 — Message Envelope

**Status:** FROZEN  
**Version:** 1.0  
**Related:** [02-architecture/ATLAS_PLATFORM_V1.md](../02-architecture/ATLAS_PLATFORM_V1.md) · Journey #6

---

## Purpose

Define the **permanent internal message contract** between channel adapters and Atlas intelligence layers.

All channels normalize into one envelope. The Agent never receives platform-specific payloads.

---

## Contract

Every inbound message MUST be normalized to:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `messageId` | string (UUID) | Yes | Unique message identifier |
| `channel` | string | Yes | Channel identifier (`messenger`, `whatsapp`, `instagram`, `website-chat`) |
| `organizationId` | string \| null | No | Owning organization |
| `prospectId` | string \| null | No | Atlas prospect identifier |
| `conversationId` | string \| null | No | Conversation session identifier |
| `timestamp` | string (ISO-8601) | Yes | Message timestamp |
| `text` | string | Yes | Message body (may be empty for attachments-only) |
| `attachments` | array | Yes | Normalized attachment objects |
| `language` | string | Yes | BCP-47 language code (default `en`) |
| `metadata` | object | Yes | Channel-specific metadata (never required by Agent) |
| `replyTo` | string \| null | No | Parent message reference |
| `deliveryContext` | object | Yes | Delivery context (thread, page, etc.) |

---

## Invariants

1. **Structure is identical** across all channels — verified by Gateway tests.
2. **Agent transport is channel-agnostic** — Agent reads envelope fields only.
3. **Adapters own normalization** — Gateway does not parse platform JSON beyond adapter boundary.
4. **Outbound uses the same contract** — OutboundRouter accepts envelope-shaped responses.

---

## Non-Goals

- Platform webhook payload schemas (adapter-internal)
- LLM prompt formatting
- UI message rendering

---

## Reference Implementation

`backend/gateway/MessageEnvelope.js` — `createMessageEnvelope()`

**Verify:** `node backend/dev/verifyJourney6.js`
