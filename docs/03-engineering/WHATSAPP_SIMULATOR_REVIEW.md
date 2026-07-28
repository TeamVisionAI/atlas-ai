# WhatsApp Simulator Review Bridge (Sprint 21.0)

**Audience:** Meta App Review, Operations Center administrators  
**Related:** [WORKFLOW_SIMULATOR_SPEC.md](./WORKFLOW_SIMULATOR_SPEC.md), [WHATSAPP_EMBEDDED_SIGNUP.md](../05-integrations/WHATSAPP_EMBEDDED_SIGNUP.md)

---

## Purpose

Demonstrate the complete Atlas WhatsApp recruiting workflow **without** a live Meta WhatsApp Business connection or production traffic. The review bridge reuses production engines and UI components inside an Operations Center–gated experience.

---

## What is shared with production

| Layer | Shared component |
|-------|------------------|
| Inbound pipeline hooks | `logConversation`, `onMessageReceived`, `processConversationAfterInbound` |
| Conversation engine | `semanticConversationEngine` via `communicationHub` |
| Workflow hooks | `onConversationProgress`, `onMessageSent` (local outbound persist) |
| Read models | `getMissionControlWithActions`, `composeProspectWorkspaceFromMissionControl` |
| UI components | `ConversationPanel`, `AiActionCenter`, `AtlasBrief`, `RecruitingFunnelStatus` |
| Event stream | `conversationEventBridge` → `workflow_events` |

---

## What remains simulator-only

| Concern | Isolation mechanism |
|---------|---------------------|
| Prospect namespace | `sim-*` phone prefix (`productionProspectFilter`) |
| Production Mission Control | `rejectSimulatorProspect()` on `/api/mission-control/*` unchanged |
| Production Prospect Center / workspace | List filters + route guards unchanged |
| Meta Cloud API | `withSimulatorGuard` → `shouldMockExternalComms()` mocks outbound send |
| Review UI access | `/api/operations/review/*` requires `canAccessOperationsCenter` |
| Review read models | `getMissionControlWithActions({ reviewMode: true })` — only for `sim-*` phones |

---

## Flow

1. **Operations Center → Workflow Simulator → Generate WhatsApp Conversation**
2. Backend creates `sim-ops-{id}` prospect and runs `processSimulatedWhatsAppInbound`
3. **Open Review Experience** navigates to `/app/operations-center/review/:phone`
4. Review page loads `GET /api/operations/review/:phone` (Mission Control + workspace + trace)
5. Additional inbound messages via `POST /api/operations/review/:phone/message`

---

## API routes

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/operations/simulator/whatsapp` | Create sim prospect + first inbound message |
| `GET` | `/api/operations/review/:phone` | Full review experience payload |
| `POST` | `/api/operations/review/:phone/message` | Send another simulated inbound message |

---

## Verification

```bash
node backend/dev/verifySprint21_0.js
```

Checks prospect creation, log/event persistence, review read models, production isolation, access control, and `npm run build`.

---

## Meta review safety

- All review UI displays **“Simulated WhatsApp”** badge and disclaimer
- No claim that messages are real Meta webhook traffic
- Technical JSON trace is secondary/expandable only
- No tokens, secrets, or internal env values in the review UI
