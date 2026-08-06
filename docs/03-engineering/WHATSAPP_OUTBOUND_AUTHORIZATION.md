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

Set via `WHATSAPP_APPROVED_TEMPLATES_JSON`.

**Accepted locale keys are only `english` and `spanish`** (not `en`, `en_US`, `es`, or `es_US`).  
Meta language codes (`en` / `es`) are derived internally from those locale keys.

Sanitized placeholder schema (not production-ready):

```json
{
  "interview_reminder": {
    "english": {
      "metaTemplateName": "<APPROVED_EN_TEMPLATE_NAME>",
      "approved": true,
      "active": true
    },
    "spanish": {
      "metaTemplateName": "<APPROVED_ES_TEMPLATE_NAME>",
      "approved": true,
      "active": true
    }
  },
  "follow_up": {
    "english": {
      "metaTemplateName": "<APPROVED_EN_FOLLOW_UP_TEMPLATE_NAME>",
      "approved": true,
      "active": true
    },
    "spanish": {
      "metaTemplateName": "<APPROVED_ES_FOLLOW_UP_TEMPLATE_NAME>",
      "approved": true,
      "active": true
    }
  }
}
```

Known registry keys: `interview_reminder`, `follow_up`, `missed_appointment`, `interview_details`, `human_assist_notice`, `lead_welcome`.

Required variables are defined in code per key (for example `interview_reminder` expects `prospect_first_name` and `interview_when`). Do not invent template names.

Until configured, outside-window sends fail closed by design.

## Durable retry / audit

Table: `whatsapp_outbound_deliveries` (migration 028).

Blocked/failed attempts also write sanitized conversation log intents and business events (`whatsapp_outbound_blocked`).

## Meta Review boundary

Meta Review allowlist, language lock, session scoping, and WhatsApp-only reviewer surfaces are unchanged. This gate does not open Google Calendar or new workspace permissions.

## Template catalog (BR-078 Phase 1)

Firm-approval worksheets, exact EN/ES bodies, intent→key mapping, and inactive env examples live in:

[WHATSAPP_TEMPLATE_APPROVAL_PACKET.md](./WHATSAPP_TEMPLATE_APPROVAL_PACKET.md).

**Code-ready:** registry keys, intent mapping, ordered parameter contracts, locale rules, and production call-site wiring are implemented.  
**Still inactive:** all Meta `metaTemplateName` values remain null/`approved:false`/`active:false` until Meta approval and explicit Railway/env authorization.  
**Outside-window production sends still fail closed** by design.

Canonical keys: `lead_welcome`, `interview_confirmation`, `interview_reminder`, `interview_details`, `missed_appointment`, `zoom_invitation`, `office_location`, `human_assist_notice`, `follow_up` (pending classification — non-sendable).

## Known limitations

- Internal copy templates in `whatsappCommunicationEngine` remain preview/copy+open helpers; they are not Meta-approved templates.
- Preferred-language broader CE persistence repair remains a separate sprint (BR-041 cleanup).
- Reminder schedule store remains local JSON for due-job timing; delivery success/failure authorization is gated and audited durably.
