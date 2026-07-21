# Journey #6 — Unified Communication Gateway

**Status:** IMPLEMENTED

Connect the Atlas Agent to the real world through a single transport layer.

## Principle

Channels are transport. The Agent is intelligence. Transport must never influence reasoning.

## Domain

`backend/gateway/`

| Module | Responsibility |
|--------|----------------|
| `CommunicationGateway.js` | Gateway orchestrator |
| `InboundRouter.js` | Platform → envelope → Agent |
| `OutboundRouter.js` | Agent response → platform |
| `MessageEnvelope.js` | Permanent internal contract |
| `ChannelRegistry.js` | Registered channel adapters |
| `ChannelAdapter.js` | Adapter interface |
| `GatewayEvents.js` | Gateway event constants |
| `GatewayStore.js` | Raw/envelope/outbound persistence |

## Adapters

| Adapter | Status |
|---------|--------|
| `MessengerAdapter` | Operational (simulated) |
| `WhatsAppAdapter` | Operational (simulated) |
| `InstagramAdapter` | Operational (simulated) |
| `WebsiteChatAdapter` | Operational (simulated) |
| `SMSAdapter` | Placeholder |
| `VoiceAdapter` | Placeholder |
| `EmailAdapter` | Placeholder |
| `TeamsAdapter` | Placeholder |
| `SlackAdapter` | Placeholder |

## Message Envelope

Every inbound message becomes:

- `messageId`, `channel`, `organizationId`, `prospectId`, `conversationId`
- `timestamp`, `text`, `attachments`, `language`
- `metadata`, `replyTo`, `deliveryContext`

The Agent receives a channel-neutral input via `toAgentInput()` (`channel: "atlas"`).

## Events

- `gateway.message.received`
- `gateway.message.normalized`
- `gateway.message.processed`
- `gateway.message.sent`
- `gateway.channel.connected`
- `gateway.channel.error`

## Verify

```bash
node backend/dev/verifyJourney6.js
node backend/dev/verifyJourney5Increment4.js
node backend/dev/verifyJourney2.js
node backend/dev/verifyJourney3.js
```

## Out of scope

Real Meta/WhatsApp API credentials, webhook deployment, rate limiting, retries, attachments, typing indicators, read receipts.

## Architecture reference

[ATLAS_AGENT_ARCHITECTURE.md](../architecture/ATLAS_AGENT_ARCHITECTURE.md)
