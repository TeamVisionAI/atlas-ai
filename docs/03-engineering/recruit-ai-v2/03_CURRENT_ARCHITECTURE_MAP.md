# Phase 4 — Current Recruit AI Architecture Map

## End-to-end path (WhatsApp)

```
Meta POST /webhook
  → verifyMetaWebhookSignature + parseWhatsAppWebhookBody
  → processInboundWhatsAppMessage (idempotency wa_in:{providerMessageId})
  → locateOrCreateWhatsAppProspect + resolveWhatsAppInboundOrganizationId
  → logConversation(inbound) → workflow_events MessageReceived
  → recruiting hooks → atlas_business_events (when registry ready)
  → processConversationAfterInbound
      → handleIncomingMessage → handleSemanticMessage
          → qualification / handleScheduleTurn / completeInterview
  → shouldDeliverAutomatedReply (DNC / human gate / workflow gate)
  → sendAndPersistWhatsAppMessage
      → authorizeWhatsAppOutbound (BR-075)
      → Graph API send
      → logConversation(outbound) + whatsapp_outbound_deliveries
```

## Step register

| # | Step | Primary files | Persist | Determinism | Meta Review |
|---|---|---|---|---|---|
| 1 | Webhook receipt | `routes/webhook.js` | — | deterministic | n/a |
| 2 | Normalize | `whatsappWebhookParser.js` | — | deterministic | n/a |
| 3 | Org / prospect | `whatsappProspectResolver.js`, `whatsappInboundOrganizationResolver.js` | `prospects` | deterministic | unchanged |
| 4 | Inbound log | `logService.js`, `conversationEventBridge.js` | `conversation_logs`, `workflow_events` | deterministic | n/a |
| 5 | Session / workflow lookup | `workflowStateStore.js`, prospect notes | JSON + notes | mixed | n/a |
| 6 | Language | prospect preferred + detector | prospect / logs | mixed | language lock on reviewer UI only |
| 7 | Parser / entities | `scheduleLanguageParser.js`, `informationExtractor.js` | notes fields | **keyword/parser** | flexibility **off** when Meta Review mode |
| 8 | Intent / schedule turn | `semanticConversationEngine.js`, `interviewScheduling.js` | notes, capacity Map | templated menus | same CE; flexibility gated |
| 9 | Availability | `capacityEngine` | in-memory | deterministic window | n/a |
| 10 | Reply build | `buildSemanticReply`, menus, `appointmentConfirmationCopy.js` | — | templated | n/a |
| 11 | BR-075 auth | `whatsappOutboundAuthorizationGate.js` | deliveries | deterministic | gate does not alter Meta Review |
| 12 | Delivery | `whatsappOutboundPipeline.js` | logs + deliveries | I/O | n/a |
| 13 | Appointment | `missionExecutionApplicationService`, `appointmentApplicationService` | `atlas_appointments` | deterministic | n/a |
| 14 | Google Calendar | `googleCalendarIntegrationService.js` | calendar + appointment metadata | I/O | hidden in Meta Review UI |
| 15 | Reminders | `appointmentReminderEngine.js` | `appointmentReminders.json` | scheduled | n/a |
| 16 | MC / read models | live read model + projections | derived | — | scoped workspace |

## Highlighted structural debts

### Duplicated parsers

- Day/time/period: `scheduleLanguageParser` **and** `informationExtractor`
- Interview type normalization duplicated across delegation + mission execution
- Confirmation copy: CE / reminder engine / agent WhatsApp templates

### State fragmentation

| State | Location |
|---|---|
| Offered slots / schedule progress | `prospects.notes` encoding + capacity Map |
| Workflow ownership | `workflowState.json` |
| Transcript | `conversation_logs` |
| Appointments | `atlas_appointments` |
| Reminders | `appointmentReminders.json` |
| Decisions / confidence | **not persisted** |

### Known risk classes (observed in TV-000028)

| Risk | Mechanism |
|---|---|
| Repeated questions | No echo guard; GREETING re-ask |
| Repeated introductions / ignored FAQ | No opportunity intent branch |
| Unavailable-slot loops | Menus regenerate same capacity options |
| Lost offered slots | No durable `previouslyOfferedSlots` |
| Ambiguous date/time | Soft confirm rebuilds day (“Monday” → “Tomorrow”) |
| False / dual confirmation | CE reply + reminder `confirmation` both sent |
| Appointment before clean confirm | Persistence can race with error paths |
| Internal text to user | Failure strings returned as WhatsApp body |
| Language drift | Reminder copy ignored preferred language |
| Raw model / parser side effects | Menu selection integers + keyword parsers directly drive booking |

### Idempotency gap

`completeInterview` may build `confirmationIdempotencyKey`, but `handleSemanticMessage` often returns only a string — hub may send confirmation as `CONVERSATION_ENGINE_REPLY` without durable key. Reminder path used `reminder:{id}:confirmation` (TV-000028 dual send).

## Tests covering pieces (non-exhaustive)

- `scheduleConversationalFlexibilityMetaReviewBoundary.test.js` — `"6?"` prod vs Meta Review
- `whatsappAutonomousSchedulingAgentResolution.test.js` — agent id failure
- `whatsappDuplicateSchedulingConfirmation.test.js` — dual confirmation
- `whatsappOutboundSessionWindowGate.test.js` — BR-075
- `whatsappInboundOrganizationScope.test.js` — org required
- `missionControlAppointmentMilestoneTruth.test.js` — BR-039 gate

None of these yet replay the full TV-000028 transcript as a single golden path (fixture added in this sprint).
