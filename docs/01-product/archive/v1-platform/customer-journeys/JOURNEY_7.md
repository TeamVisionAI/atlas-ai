# Journey #7 — Production Connectors

**Status:** IMPLEMENTED

Replace simulated integrations with production-ready connectors. Gateway, Agent, and Workflow Intelligence remain unchanged.

## Principle

Business logic never knows external APIs. External APIs never know business logic. Connectors are translators.

## Domain

`backend/connectors/`

| Area | Modules |
|------|---------|
| `shared/` | `BaseConnector`, `ConnectorRegistry`, `ConnectorResult`, `ConnectorEvents`, `ConnectorHealth`, `RetryPolicy` |
| `meta/` | `MetaWebhookConnector`, `MessengerConnector`, `WhatsAppConnector`, `InstagramConnector` |
| `google/` | `GoogleCalendarConnector`, `GoogleOAuthConnector` |
| `zoom/` | `ZoomConnector`, `ZoomOAuthConnector` |

## Connector contract

Every connector exposes: `connect()`, `disconnect()`, `health()`, `receive()`, `send()`, `validate()`

No workflow logic. No Agent logic.

## Integration

| Service | Connector |
|---------|-----------|
| `CalendarService.createCalendarEvent()` | `google-calendar` |
| `ZoomService.createZoomMeeting()` | `zoom` |
| Meta webhooks | `MetaWebhookConnector` → Journey #6 Gateway |

## Health statuses

`connected`, `disconnected`, `degraded`, `authentication_error`, `rate_limited`, `unavailable`

## Events

- `connector.connected`
- `connector.disconnected`
- `connector.health.changed`
- `connector.retry`
- `connector.failed`
- `connector.message.received`
- `connector.message.sent`

## Verify

```bash
node backend/dev/verifyJourney7.js
```

## Out of scope

Voice, SMS, Email, Slack, Teams, distributed queues, circuit breakers, Mission Control, Executive Dashboard.

## Architecture reference

[../02-architecture/ATLAS_AGENT_ARCHITECTURE.md](../../../../02-architecture/ATLAS_AGENT_ARCHITECTURE.md)
