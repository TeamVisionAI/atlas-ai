# Sprint 10.2b — Prospect Activity Feed

**Status:** Complete  
**Depends on:** Sprint 10.2a (Prospect Workspace shell), Sprint 8A `workflow_events`  
**Canonical store (this sprint):** `workflow_events` only — **no** `prospect_events` table

---

## 1. Design principles

| Principle | Implementation |
|-----------|----------------|
| Event stream, not CRM timeline | One federated read projection over `workflow_events` + deduped legacy logs |
| Architecture before UI | Write path + read model + API verified before React consumer |
| `workflow_events` is canonical | New messages/notes dual-write here; legacy logs fill gaps only |
| Idempotent dual-write | `correlationId = conversation_log:{logId}` prevents duplicate feed items |
| UI scope limited | Reverse-chron feed, time groups, type filters, cursor pagination, Add Note |

**Out of scope (10.2b):** AI/Coach, edit/delete notes, attachments, search, advanced filters, new tasks, `prospect_events` table.

---

## 2. Write path (A)

```
conversation_logs INSERT (logService.logConversation)
        │
        ▼
conversationEventBridge.emitConversationLogEvent(logRow)
        │
        ├─ findWorkflowEventByCorrelationId("conversation_log:{id}")
        │     └─ exists → skip (idempotent)
        │
        └─ eventEngine.emit(eventType, { prospectPhone, actor, correlationId, payload })
```

### Event types added / used

| Event type | Trigger | Activity type |
|------------|---------|---------------|
| `MessageReceived` | Inbound `conversation_logs` row | `message_inbound` |
| `MessageSent` | Outbound non-note log | `message_outbound` |
| `AgentNoteAdded` | Outbound log with `[Agent note]` prefix | `note` |

Existing workflow events (`ProspectAdvanced`, reminders, etc.) map to `workflow_event`, `reminder`, or `system`.

### Idempotency strategy

1. **Correlation ID:** `conversation_log:{conversation_logs.id}` stored on `workflow_events.correlation_id`.
2. **Pre-insert lookup:** `findWorkflowEventByCorrelationId` — repeated `emitConversationLogEvent` calls return `{ skipped: true }`.
3. **Payload link:** `payload.conversationLogId` mirrors the log UUID for read-side dedup.
4. **Federated read:** Legacy `conversation_logs` rows whose IDs appear in any event payload or correlation ID are **excluded** from the merge.

Notes use the existing Mission Control `notes` action → `logService` → dual-write (no separate note table).

---

## 3. Read projection (B)

**Module:** `backend/core/prospectActivityFeedReadModel.js`

```
workflow_events (≤500, DESC) ──┐
                               ├── merge → sort DESC → filter types → cursor page
conversation_logs (≤500) ──────┘   (exclude linked log IDs)
```

### ActivityFeedItem DTO

```json
{
  "id": "event:{uuid} | log:{uuid}",
  "activityType": "message_inbound | message_outbound | note | workflow_event | reminder | system",
  "timestamp": "ISO-8601",
  "actor": "AGENT | ATLAS | SYSTEM | prospect",
  "eventType": "MessageReceived | AgentNoteAdded | …",
  "payload": {
    "conversationLogId": "uuid",
    "bodyPreview": "…",
    "noteText": "…",
    "legacy": true
  }
}
```

`payload.legacy: true` marks pre-10.2b logs not yet backfilled to events.

### API

`GET /api/prospect-workspace/:phone/activity?limit=25&cursor=…&types=message_inbound,note`

Response:

```json
{
  "generatedAt": "2026-07-18T13:30:00.000Z",
  "phone": "+15551234567",
  "items": [ /* ActivityFeedItem[] */ ],
  "nextCursor": "eyJ0Ijoi…",
  "hasMore": true
}
```

Cursor is base64url JSON `{ t: timestamp, id: itemId }` — stable tie-break for equal timestamps.

Workspace GET includes `activityPreview` (≤5 items) from the same read model.

---

## 4. UI consumer (D)

**Components:** `ActivityFeed.jsx`, `activityFeedViewModel.js`

- Reverse-chronological list grouped: **Today / Yesterday / This Week / Earlier**
- Filter chips: All, Messages, Notes, Workflow
- Add Note composer → `POST` Mission Control `notes` action → feed refresh
- Cursor **Load more** button
- Empty, loading, and error states (i18n via `LanguageContext`)

Mobile: filters wrap; timestamps stack below meta row. Desktop: feed column beside Details panel (≥960px).

---

## 5. Legacy data limitations

| Limitation | Mitigation / future |
|------------|---------------------|
| Pre-10.2b logs without events | Shown once as `legacy: true` until optional backfill |
| Merge window capped at 500+500 rows | Cursor works within window; very deep history needs DB-side merge (future) |
| No `prospect_events` table | Documented migration path below |
| Notes detected by `[Agent note]` prefix | Consistent with Mission Control notes action |

---

## 6. Future migration: `prospect_events`

**Not implemented in 10.2b.** When volume or query patterns require it:

1. Create `prospect_events` as append-only store (or materialized view over `workflow_events`).
2. Backfill from `workflow_events` + unlinked `conversation_logs`.
3. Point `prospectActivityFeedReadModel` at single table; retire federated merge.
4. Keep `correlationId` scheme for idempotency during transition.

Until then, `workflow_events` remains the canonical event store per Sprint 10.2b guardrails.

---

## 7. Verification

```bash
node backend/dev/verifySprint10_2.js   # 10.2a + 10.2b
node backend/dev/verifySprint10_1.js   # regression
cd frontend && npm run build
```

---

## 8. Files touched

| Area | Path |
|------|------|
| Write bridge | `backend/core/conversationEventBridge.js` |
| Constants | `backend/core/workflowConstants.js` |
| Cursor | `backend/core/activityFeedCursor.js` |
| Read model | `backend/core/prospectActivityFeedReadModel.js` |
| Log hook | `backend/services/logService.js` |
| Event lookup | `backend/services/workflowEventService.js` |
| Route | `backend/routes/prospectWorkspace.js` |
| UI | `frontend/src/components/prospect-workspace/ActivityFeed.*` |
| View model | `frontend/src/engines/activityFeedViewModel.js` |
| Service | `frontend/src/services/prospectWorkspaceService.js` |
