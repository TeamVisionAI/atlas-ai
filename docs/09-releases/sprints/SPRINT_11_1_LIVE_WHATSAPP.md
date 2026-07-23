# Sprint 11.1 — Live WhatsApp Foundation

**Status:** Complete  
**Mission:** Connect Atlas to live WhatsApp conversations with a production-grade messaging pipeline.

> Facebook Lead → WhatsApp → Atlas → (future) Scheduled Interview

This sprint is **not** AI, scheduling, or new UI. It establishes reliable message ingest, persistence, and event emission.

---

## 1. Architecture (unchanged layers)

```
Meta Cloud API
      ↓
POST /webhook (signature verify, fast 200)
      ↓
whatsappInboundPipeline
      ↓
whatsappProspectResolver (locate / create)
      ↓
logService → conversation_logs
      ↓
conversationEventBridge → workflow_events
      ↓
Read models (Activity Feed, Prospect Center, Workspace)
      ↓
UI polling refresh (15–20s + window focus)
```

Outbound symmetry:

```
sendTextMessage → whatsappOutboundPipeline
      ↓ Meta Graph API + logService + event bridge
```

Do not bypass any layer.

---

## 2. Webhook

| Concern | Implementation |
|---------|----------------|
| Verification | `GET /webhook` with `VERIFY_TOKEN` |
| Signature | `META_APP_SECRET` + `x-hub-signature-256` (skipped with warning if unset) |
| Raw body | `express.raw()` mounted before `express.json()` |
| Response | `200` immediately; async processing |
| Parser | `whatsappWebhookParser.js` — text, button, interactive |
| Dedup | `correlationId = whatsapp:inbound:{metaMessageId}` |

### Env vars

| Variable | Purpose |
|----------|---------|
| `VERIFY_TOKEN` | Meta webhook subscription |
| `META_APP_SECRET` | Signature validation |
| `WHATSAPP_ACCESS_TOKEN` | Outbound send |
| `WHATSAPP_PHONE_NUMBER_ID` | Graph API sender |

---

## 3. Event types (Sprint 11.1)

| Event | When |
|-------|------|
| `ProspectCreated` | New Click-to-WhatsApp lead |
| `ConversationStarted` | First conversation on new prospect |
| `ConversationReopened` | Returning prospect after inactivity / closed |
| `MessageReceived` | Every inbound message |
| `MessageSent` | Every outbound message |

All use idempotent `correlationId`. Provider message IDs stored in event payload.

`ConversationAssigned` / `ConversationClosed` — defined in constants; emission deferred until workflow rules require them.

---

## 4. Prospect creation

WhatsApp leads created with:

- `source: FACEBOOK`
- `entry_method: CLICK_TO_WHATSAPP`
- `preferred_communication_channel: WHATSAPP`
- Normalized phone + prospect number (when migration applied)
- Workflow state init (`NEW_LEAD`, `ATLAS` ownership)

---

## 5. Structured logging

JSON logs via `whatsappStructuredLogger.js`:

`webhook_received`, `signature_verified`, `prospect_created`, `prospect_located`, `message_persisted`, `event_emitted`, `outbound_delivery_sent`, `outbound_delivery_failed`, `message_duplicate_skipped`

---

## 6. UI (no redesign)

| Surface | Live refresh |
|---------|----------------|
| Activity Feed | 15s poll + window focus |
| Prospect Workspace | 20s poll + window focus |
| Prospect Center | 20s poll + window focus |

---

## 7. Out of scope (11.1)

- AI replies from webhook (semantic engine not invoked on live webhook)
- Qualification, scheduling, calendar, reminders
- New screens or analytics

Dev simulator (`/dev/simulator/message`) still uses semantic engine under `withSimulatorGuard` (mocked WhatsApp).

---

## 8. Verification

```bash
node backend/dev/verifySprint11_1.js
cd frontend && npm run build
```

---

## 9. Production validation checklist

1. Set `META_APP_SECRET` in production env
2. Configure Meta webhook → `https://{host}/webhook`
3. Send test message from Click-to-WhatsApp ad
4. Confirm structured logs show full pipeline stages
5. Open Prospect Workspace — message appears within poll interval
6. Retry same webhook — no duplicate feed items

---

## 10. Next sprints (do not build yet)

- **11.2** — AI conversation, qualification, FAQ, human handoff
- **11.3** — Scheduling intelligence, calendar, reminders
