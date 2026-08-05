# WhatsApp outbound call-site inventory (BR-075)

Temporary inventory captured before wiring the canonical gate.

| Call site | Path | Delegates through gate |
|---|---|---|
| Conversation Engine reply | `communicationHub.js` → `sendAndPersistWhatsAppMessage` | Yes |
| WhatsApp service | `whatsappService.sendTextMessage` → pipeline | Yes |
| Appointment reminders | `appointmentReminderEngine.deliverReminder` → `sendTextMessage` | Yes |
| Agent Mission Control actions | `agentActionApplicationService.sendWhatsAppOrFail` → `sendTextMessage` | Yes |
| Facebook lead welcome | `recruitingWorkflowOrchestrator` → pipeline | Yes |
| Manual/preview copy+open | `whatsappCommunicationApplicationService` (no Cloud API send) | N/A (preview only) |
| Messenger connector | `messengerGraphClient.sendTextMessage` | N/A (Messenger, not WhatsApp) |
| Dev verify scripts | `backend/dev/verifySprint11_*.js` | Dev-only mocked payloads |

Direct Graph API WhatsApp sends outside `whatsappOutboundPipeline.js` were not found in production runtime paths.
