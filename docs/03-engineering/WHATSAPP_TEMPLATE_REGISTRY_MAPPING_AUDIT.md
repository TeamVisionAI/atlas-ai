# WhatsApp Template Registry Mapping Audit (BR-078)

**Date:** 2026-08-07  
**Scope:** Verification + canonical Meta-name mapping. No live template activation. No Railway variable changes. No WhatsApp sends.

## Architecture

| Layer | Module |
|---|---|
| Catalog / resolve | `backend/core/whatsappApprovedTemplateRegistry.js` |
| Variable builders | `backend/core/whatsappTemplateVariableBuilder.js` |
| Authorization gate | `backend/core/whatsappOutboundAuthorizationGate.js` (BR-075) |
| Send pipeline | `backend/core/whatsappOutboundPipeline.js` |
| Activation | `WHATSAPP_APPROVED_TEMPLATES_JSON` only (default: all inactive) |

Logical locale keys: `english` / `spanish`. Meta language codes: `en` / `es`.

## Canonical Meta mapping

| Logical key | EN | ES |
|---|---|---|
| `interview_reminder` | `atlas_interview_reminder_en` | `atlas_interview_reminder_es` |
| `interview_confirmation` | `atlas_interview_confirmation_en` | `atlas_interview_confirmation_es` |
| `interview_details` | `atlas_interview_details_en` | `atlas_interview_details_es` |
| `missed_appointment` | `atlas_missed_appointment_en` | `atlas_missed_appointment_es_v2` |
| `zoom_invitation` | `atlas_zoom_invitation_en` | `atlas_zoom_invitation_es` |
| `office_location` | `atlas_office_location_en` | `atlas_office_location_es` |
| `human_assist_notice` | `atlas_human_assist_notice_en` | `atlas_human_assist_notice_es` |

Also catalogued (not on the 2026-08-07 activation list): `lead_welcome`, `follow_up` (`sendable: false`).

### Stale

| Name | Status |
|---|---|
| `atlas_missed_appointment_es` | **Stale / deprecated** — rejected fail-closed; never preferred over `_es_v2` |

## Parameter contracts (registry)

| Key | Body vars (order) | Buttons | Notes |
|---|---|---|---|
| `interview_reminder` | prospect_first_name, interview_when, meeting_type | — | date/time |
| `interview_confirmation` | prospect_first_name, interview_when, meeting_type, meeting_location | — | date/time + location text |
| `interview_details` | same as confirmation | — | date/time + location text |
| `missed_appointment` | prospect_first_name | — | name only in registry |
| `zoom_invitation` | prospect_first_name | meeting_url | Zoom URL button (or body fallback via ops mode) |
| `office_location` | prospect_first_name, meeting_address | — | office address |
| `human_assist_notice` | prospect_first_name | — | name only; no production call-site yet |

Exact Meta body parameter **order vs approved Meta assets** must be confirmed against Meta Business Manager before activation — registry contracts are Atlas-side evidence only.

## Fail-closed / BR-075

- Inactive / unmapped / missing Meta name → no send
- Missing/invalid variables → no send
- Unsupported language locale → no silent EN↔ES fallback
- Caller-supplied Meta name injection rejected
- Stale `atlas_missed_appointment_es` rejected
- Outside care window requires approved+active registry template (BR-075)

## Activation posture

Templates remain **inactive** until explicit ops authorization. This audit does not enable sends.
