# BR-093 — Interview Confirmation Meeting Details Semantics

**Status:** Implemented in code. Templates remain **inactive**.

## Root cause

Meta confirmation BODY `{{4}}` is **meeting details**. Atlas previously set Zoom `meeting_location` to `"Zoom"`, duplicating `{{3}}` meeting type.

## Canonical Zoom {{4}} copy

| Language | Copy |
|---|---|
| EN | `Your Zoom link will be provided separately` |
| ES | `Tu enlace de Zoom será enviado por separado` |

Stored as `ZOOM_MEETING_DETAILS_COPY` in `whatsappTemplateVariableBuilder.js`.

## Separation

| Template | Role |
|---|---|
| `interview_confirmation` | Confirm appointment + meeting details text |
| `zoom_invitation` | Actionable Zoom join button (BR-092 meeting ID) |
| `office_location` | Office address when sent separately |

Do not embed Zoom URLs in confirmation `{{4}}`.

## In-person

`{{4}}` = BR-077 complete canonical meeting address. Incomplete → fail closed at resolve.
