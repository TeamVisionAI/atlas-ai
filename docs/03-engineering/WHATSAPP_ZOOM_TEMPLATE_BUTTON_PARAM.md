# BR-092 — WhatsApp Zoom Template Dynamic URL Button Parameter

**Status:** Implemented in code. Templates remain **inactive**. Proposed activation packet is **not applied**.

## Root cause

Meta-approved Zoom invitation templates use:

`https://zoom.us/j/{{1}}`

Atlas previously derived the button parameter from the URL pathname (`j/123456789`). Substituting into Meta’s base produced:

`https://zoom.us/j/j/123456789`

## Fix

At the template variable-builder / registry / pipeline boundary:

| Input | Button parameter |
|---|---|
| `https://zoom.us/j/123456789` | `123456789` |
| `https://us02web.zoom.us/j/555111222` | `555111222` |
| `j/123456789` | `123456789` |
| `/j/123456789` | `123456789` |
| `123456789` | `123456789` |

BR-076 persisted Zoom URLs are unchanged. Only the Meta send parameter is adapted.

## Modules

- `backend/core/whatsappTemplateVariableBuilder.js` — `normalizeZoomDynamicUrlButtonParameter`, `buildZoomInvitationVariables`
- `backend/core/whatsappApprovedTemplateRegistry.js` — fail-closed + normalize on resolve
- `backend/core/whatsappOutboundPipeline.js` — `buildTemplateComponents` uses the same normalizer

## Tests

`backend/test/whatsappZoomTemplateButtonParamBr092.test.js`

## Proposed activation packet (NOT APPLIED)

See `docs/03-engineering/WHATSAPP_APPROVED_TEMPLATES_JSON.proposed.json`.

Includes Zoom invitation EN/ES after BR-092 normalization. Do **not** set Railway `WHATSAPP_APPROVED_TEMPLATES_JSON` from this PR.
