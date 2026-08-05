# WhatsApp Outbound Authorization (BR-075)

## Purpose

Canonical production-safety gate for every Atlas WhatsApp Cloud API send.

## Customer-care window

| Property | Value |
|---|---|
| Duration | `CUSTOMER_CARE_WINDOW_MS` = 24 hours (single constant) |
| Source | Latest durable inbound row in `conversation_logs` (`direction = incoming`) |
| Clock | Server UTC |
| Not used | Frontend time, process memory, `workflowState.json`, `agentActionState.json`, last outbound, appointment created_at |

## Delivery modes

| Mode | When |
|---|---|
| Free-form text | Window open |
| Approved Meta template | Window closed and registry has approved+active locale template |
| Fail closed | Window closed and no approved template |

## Delivery statuses

- `sent_freeform`
- `sent_template`
- `blocked_window_closed` (represented via template-missing/unapproved when window closed)
- `blocked_template_missing`
- `blocked_template_unapproved`
- `retry_required`
- `provider_failed`
- `duplicate_suppressed`

## Approved template configuration

Operational env JSON (example):

```json
{
  "interview_reminder": {
    "english": {
      "metaTemplateName": "tv_interview_reminder_en",
      "approved": true,
      "active": true
    },
    "spanish": {
      "metaTemplateName": "tv_interview_reminder_es",
      "approved": true,
      "active": true
    }
  }
}
```

Set via `WHATSAPP_APPROVED_TEMPLATES_JSON`.

Until configured, outside-window sends fail closed by design.

## Durable retry / audit

Table: `whatsapp_outbound_deliveries` (migration 028).

Blocked/failed attempts also write sanitized conversation log intents and business events (`whatsapp_outbound_blocked`).

## Meta Review boundary

Meta Review allowlist, language lock, session scoping, and WhatsApp-only reviewer surfaces are unchanged. This gate does not open Google Calendar or new workspace permissions.

## Known limitations

- Internal copy templates in `whatsappCommunicationEngine` remain preview/copy+open helpers; they are not Meta-approved templates.
- Preferred-language broader CE persistence repair remains a separate sprint (BR-041 cleanup).
- Reminder schedule store remains local JSON for due-job timing; delivery success/failure authorization is gated and audited durably.
