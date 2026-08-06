# WhatsApp Template Approval Packet (Phase 0)

## AI Summary

Phase 0 firm-approval worksheet for Atlas Meta WhatsApp templates under BR-075 (authorization gate) and recommended BR-078 (catalog + call-site mapping). This packet locks registry keys, categories, exact EN/ES bodies, parameter order, intent mapping, Zoom/office handling, and an inactive env example. It does **not** authorize Meta submission, Railway activation, code wiring, live WhatsApp, or ad connection.

## Purpose

Provide one approval packet so Team Vision can review and lock the launch catalog before any Meta Manager create/submit or production `WHATSAPP_APPROVED_TEMPLATES_JSON` activation.

## Status

**Phase 0 packet approved for catalog decisions**  
**Phase 1 code wiring: implemented** — registry contracts + call-site wiring on branch `feature/br-078-whatsapp-template-wiring`  
Templates remain **inactive** (`metaTemplateName` null / not approved / not active)  
Meta submission: **blocked until explicit authorization**  
Production env / Railway activation: **blocked**  
Live WhatsApp testing: **blocked**

## Business Rules

- **BR-075** — Customer-care window + approved-template gate (authorization only)
- **BR-078** (recommended) — Approved template catalog semantics, intent→key mapping, parameters, language rules, marketing retention, fail-closed activation
- Related: BR-012 (communications), BR-018 / BR-077 (office address), BR-041 (preferred language), BR-076 (Zoom URL snapshot)

## Technical Notes

### Naming constraints (Meta)

Proposed names were checked against Meta Cloud API / WhatsApp Manager rules:

| Constraint | Status |
|---|---|
| Lowercase `a-z`, digits, underscores only | Pass |
| Max 512 characters | Pass (all names ≪ 50) |
| Not starting with a digit | Pass (`atlas_…`) |
| Unique per WABA language asset | Pass via `_en` / `_es` suffix (matches Atlas per-locale `metaTemplateName`) |

**Atlas locale keys** in `WHATSAPP_APPROVED_TEMPLATES_JSON` remain `english` / `spanish` (not `en` / `es`).  
**Meta language codes** for submission: `en` and `es` (matches current BR-075 registry `languageCode`).

> Meta also allows one template name with multiple language variants. Atlas Phase 0 intentionally uses **distinct names per language** (`…_en` / `…_es`) because the operational registry stores one `metaTemplateName` per locale.

### Locked Phase 0 decisions

1. Dedicated `interview_confirmation` key (do not reuse `interview_details`).
2. `lead_welcome` remains **marketing**; inactive until consent framing + Meta approval.
3. New utility keys: `zoom_invitation`, `office_location`.
4. Exact EN/ES bodies drafted below — **no Meta submit**, **no Railway change**, **no live send**.

### Semantic separation (intent → registry key)

| Intent / event | Registry key |
|---|---|
| `APPOINTMENT_CONFIRMATION` | `interview_confirmation` |
| `SCHEDULE_CONFIRMATION` | `interview_confirmation` |
| `APPOINTMENT_REMINDER` | `interview_reminder` |
| `REMINDER_24H` | `interview_reminder` |
| `REMINDER_1H` | `interview_reminder` |
| `REMINDER_15M` | `interview_reminder` |
| `INTERVIEW_DETAILS` | `interview_details` |
| `RESCHEDULE_CONFIRMATION` | `interview_details` |
| `SEND_ZOOM_LINK` | `zoom_invitation` |
| `ZOOM_INVITATION` | `zoom_invitation` |
| `SEND_OFFICE_LOCATION` | `office_location` |
| `OFFICE_LOCATION` | `office_location` |
| `MISSED_APPOINTMENT` | `missed_appointment` |
| `AGENT_MISSED_APPOINTMENT` / `send_missed_appointment` | `missed_appointment` |
| `HUMAN_ASSIST` / `HANDOFF` / `HUMAN_ASSIST_NOTICE` | `human_assist_notice` |
| `FACEBOOK_LEAD_WELCOME` / `LEAD_WELCOME` | `lead_welcome` |

**Removed from design:** `CONFIRMATION` as an alias of `interview_reminder`.

### Shared copy / compliance rules

- Identify Team Vision Financial / Team Vision naturally (recruiting interview context).
- No employment guarantees, income promises, or misleading recruiting claims.
- One clear action per template.
- Minimum variables; never internal IDs, diagnostics, tokens, or service-role data.
- Preferred language only; never send both languages.
- Canonical appointment datetime/timezone labels.
- Office: BR-077 full address including Suite 189 + ZIP when office.
- Public location: appointment-specific snapshotted address only — never substitute Team Vision office.
- Zoom URL: only when available and authorized (BR-076); never fabricate.

### Parameter null behavior (global)

| Condition | Behavior |
|---|---|
| Required parameter missing/empty | Fail closed — do not send template |
| Zoom URL unavailable for `zoom_invitation` | Fail closed — do not send; do not invent URL |
| Office/public address unavailable for location templates | Fail closed |
| Preferred-language locale inactive/unapproved | Fail closed — no EN↔ES fallback |
| Outside care window + inactive registry | Fail closed (BR-075) |

### Quick-reply payloads (document only — do not implement in Phase 0)

| Button label (EN) | Button label (ES) | Payload key | Notes |
|---|---|---|---|
| Confirm | Confirmar | `atlas_qr_confirm` | Must not bypass appointment lifecycle / explicit confirmation rules |
| Reschedule | Reprogramar | `atlas_qr_reschedule` | Opens reschedule flow only; does not auto-book |
| Speak with an agent | Hablar con un agente | `atlas_qr_speak_agent` | Human-assist handoff intent |
| Stop | Detener | `atlas_qr_stop` | Opt-out / stop further automated outreach |

Quick replies must never silently mark an interview confirmed, cancel Calendar events, or skip BR-075.

### Zoom delivery recommendation (final)

**Recommended submission design:** utility template body **without** raw URL variable + **dynamic URL button** (“Join Zoom” / “Unirse a Zoom”) when Meta accepts a dynamic URL suffix for the org’s Zoom host allowlist.

**Fallback (document if Meta rejects dynamic URL button):** body includes `{{meeting_url}}` as a full `https://…` variable **only if** Meta approves that utility body; prefer not to use URL shorteners.

**Unavailable URL:** do not send `zoom_invitation`; confirmation may still send with `meeting_type=Zoom` and location text “Zoom” without a join button.

### Office / public location handling

Registry key remains `office_location` (locked), but the **body parameter is `meeting_address`**, meaning the canonical appointment location string:

| Appointment location type | Parameter source | Forbidden |
|---|---|---|
| In-person office | BR-077 snapshotted `meeting_address` (full address incl. Suite 189 + ZIP) | Truncated Miami hardcode; city/state-only fragments |
| Public location | Appointment-specific snapshotted public `meeting_address` | Substituting Team Vision office address |
| Zoom / virtual | Do **not** use `office_location` | Putting office address on Zoom appointments |

**Required semantic adjustment before Meta submit / wiring:** agent action `SEND_OFFICE_LOCATION` and any appointment-context “send location” path must resolve `meeting_address` from the active appointment when present; standalone office share (no appointment) may use organization BR-018/BR-077 `fullAddress`. Public-location appointments must never fall back to office.

If a future product need requires separate marketing “our office” vs “your public meeting spot” templates, split keys later — **not in Phase 0 launch set**.

---

## Launch catalog worksheets

Positional Meta variables `{{1}}…` map 1:1 to ordered Atlas parameter keys.

### 1. `lead_welcome`

| Field | Value |
|---|---|
| Registry key | `lead_welcome` |
| Category | **marketing** |
| Meta names | `atlas_lead_welcome_en` / `atlas_lead_welcome_es` |
| Language codes | `en` / `es` |
| Approval status | `draft` — not submission-ready until consent framing signed off |
| Activation status | `inactive` (`approved: false`, `active: false`) |
| Atlas intents | `FACEBOOK_LEAD_WELCOME`, `LEAD_WELCOME` |
| Production call sites | `recruitingWorkflowOrchestrator.processFacebookLead` → pipeline (`templateKey: lead_welcome`) |
| Parameters (order) | `{{1}} prospect_first_name` |
| Sources | Prospect display/first name from lead intake; sanitized first token only |
| Null behavior | If name empty, use locale-safe generic (“there” / omit in Spanish greeting pattern via fixed body without empty double-space — see bodies) |
| Buttons | Optional quick replies: Speak with an agent, Stop. **No Confirm/Reschedule.** |
| Consent / opt-out | Requires lead-form / WhatsApp marketing opt-in framing before activation. Include Stop quick-reply in ops plan. Keep inactive until authorized. |
| Risks | Marketing category + cold outreach; Meta may require opt-out language; do not reclassify as utility. |

**English body**

```text
Hi {{1}}! I'm Atlas from Team Vision Financial. Thanks for your interest — I can help you schedule an interview in a few messages. What city and state are you in?
```

**Spanish body**

```text
¡Hola {{1}}! Soy Atlas de Team Vision Financial. Gracias por tu interés; puedo ayudarte a agendar una entrevista en pocos mensajes. ¿En qué ciudad y estado te encuentras?
```

**Sanitized samples:** `{{1}}=Maria`

---

### 2. `interview_confirmation`

| Field | Value |
|---|---|
| Registry key | `interview_confirmation` |
| Category | **utility** |
| Meta names | `atlas_interview_confirmation_en` / `atlas_interview_confirmation_es` |
| Language codes | `en` / `es` |
| Approval status | `draft` — body ready for firm copy review |
| Activation status | `inactive` |
| Atlas intents | `APPOINTMENT_CONFIRMATION`, `SCHEDULE_CONFIRMATION` |
| Production call sites | `communicationHub` / Conversation Engine scheduling success path (today freeform; outside-window needs this key — wiring is Phase 1) |
| Parameters (order) | `{{1}} prospect_first_name`, `{{2}} interview_when`, `{{3}} meeting_type`, `{{4}} meeting_location` |
| Sources | `prospect.name` first token; canonical appointment when-label (org timezone); `Zoom` or `In person`; for Zoom use literal `Zoom` (URL via separate template/button if needed); for office/public use snapshotted `meeting_address` |
| Null behavior | Fail closed if when/type/location missing |
| Buttons | Quick replies: Confirm, Reschedule, Speak with an agent, Stop (payloads above). Confirm must not bypass lifecycle. |
| Consent / opt-out | Operational utility after prospect engaged; Stop still recommended. |
| Risks | Putting Zoom URLs in `meeting_location` may trigger Meta rejection — keep location as `Zoom` and use `zoom_invitation` or URL button for links. |

**English body**

```text
Hi {{1}}, you're confirmed for your Team Vision interview on {{2}}. Meeting type: {{3}}. Location: {{4}}. We look forward to meeting you.
```

**Spanish body**

```text
Hola {{1}}, tu entrevista con Team Vision quedó confirmada para {{2}}. Tipo de reunión: {{3}}. Ubicación: {{4}}. ¡Esperamos conocerte!
```

**Sanitized samples:**  
`Maria` · `Fri, Aug 8 at 10:00 AM` · `In person` · `2500 NW 79th Ave, Suite 189, Doral, FL 33122`  
Zoom sample location value: `Zoom` (not a fabricated URL)

---

### 3. `interview_reminder`

| Field | Value |
|---|---|
| Registry key | `interview_reminder` |
| Category | **utility** |
| Meta names | `atlas_interview_reminder_en` / `atlas_interview_reminder_es` |
| Language codes | `en` / `es` |
| Approval status | `draft` |
| Activation status | `inactive` |
| Atlas intents | `APPOINTMENT_REMINDER`, `REMINDER_24H`, `REMINDER_1H`, `REMINDER_15M` |
| Production call sites | `appointmentReminderEngine.deliverReminder` (`templateKey: interview_reminder`) |
| Parameters (order) | `{{1}} prospect_first_name`, `{{2}} interview_when`, `{{3}} meeting_type` |
| Sources | Prospect first name; canonical when-label in preferred language; `Zoom` or `In person` |
| Null behavior | Fail closed if when/type missing |
| Buttons | Reschedule, Speak with an agent, Stop (Confirm optional; must not auto-complete outcomes) |
| Consent / opt-out | Utility reminder for scheduled interview |
| Risks | Do not attach promotional hiring claims; keep reminder-scoped. `CONFIRMATION` must not map here. |

**English body**

```text
Hi {{1}}, reminder from Team Vision: your interview is scheduled for {{2}} ({{3}}). Reply if you need to reschedule.
```

**Spanish body**

```text
Hola {{1}}, recordatorio de Team Vision: tu entrevista está programada para {{2}} ({{3}}). Responde si necesitas reprogramar.
```

**Sanitized samples:** `Maria` · `Tomorrow at 10:00 AM` · `Zoom`

---

### 4. `interview_details`

| Field | Value |
|---|---|
| Registry key | `interview_details` |
| Category | **utility** |
| Meta names | `atlas_interview_details_en` / `atlas_interview_details_es` |
| Language codes | `en` / `es` |
| Approval status | `draft` |
| Activation status | `inactive` |
| Atlas intents | `INTERVIEW_DETAILS`, `RESCHEDULE_CONFIRMATION` |
| Production call sites | Intended: details resend / reschedule confirmation paths (registry aliases exist; dedicated outside-window wiring is Phase 1). Distinct from initial `interview_confirmation`. |
| Parameters (order) | `{{1}} prospect_first_name`, `{{2}} interview_when`, `{{3}} meeting_type`, `{{4}} meeting_location` |
| Sources | Same canonical appointment fields as confirmation |
| Null behavior | Fail closed if required fields missing |
| Buttons | Reschedule, Speak with an agent, Stop |
| Consent / opt-out | Utility |
| Risks | Keep semantic separation from confirmation; do not reuse confirmation Meta name |

**English body**

```text
Hi {{1}}, here are your updated Team Vision interview details: {{2}}. Meeting type: {{3}}. Location: {{4}}.
```

**Spanish body**

```text
Hola {{1}}, aquí tienes los detalles actualizados de tu entrevista con Team Vision: {{2}}. Tipo de reunión: {{3}}. Ubicación: {{4}}.
```

**Sanitized samples:** same pattern as confirmation

---

### 5. `missed_appointment`

| Field | Value |
|---|---|
| Registry key | `missed_appointment` |
| Category | **utility** |
| Meta names | `atlas_missed_appointment_en` / `atlas_missed_appointment_es` |
| Language codes | `en` / `es` |
| Approval status | `draft` |
| Activation status | `inactive` |
| Atlas intents | `MISSED_APPOINTMENT`, `send_missed_appointment`, `AGENT_MISSED_APPOINTMENT` |
| Production call sites | `agentActionApplicationService` `SEND_MISSED_APPOINTMENT` (today freeform / no templateKey — Phase 1 wiring) |
| Parameters (order) | `{{1}} prospect_first_name` |
| Sources | Prospect first name |
| Null behavior | If name empty, Meta sample still required; runtime may use a locale-safe placeholder (`there` / `hola`) only if firm approves — preferred: require name |
| Buttons | Reschedule, Speak with an agent, Stop |
| Consent / opt-out | Utility follow-up for a missed scheduled interview |
| Risks | Avoid shaming language; one clear reschedule ask |

**English body**

```text
Hi {{1}}, we noticed you weren't able to attend your Team Vision interview. Would you like to reschedule?
```

**Spanish body**

```text
Hola {{1}}, notamos que no pudiste asistir a tu entrevista con Team Vision. ¿Te gustaría reprogramarla?
```

**Sanitized samples:** `Maria`

---

### 6. `zoom_invitation`

| Field | Value |
|---|---|
| Registry key | `zoom_invitation` |
| Category | **utility** |
| Meta names | `atlas_zoom_invitation_en` / `atlas_zoom_invitation_es` |
| Language codes | `en` / `es` |
| Approval status | `draft` |
| Activation status | `inactive` |
| Atlas intents | `SEND_ZOOM_LINK`, `ZOOM_INVITATION` |
| Production call sites | `agentActionApplicationService` `SEND_ZOOM_LINK` (today freeform; Phase 1 wiring) |
| Parameters (order) | Body: `{{1}} prospect_first_name`. Button: dynamic URL suffix from authorized BR-076 `virtualMeetingUrl` |
| Sources | Prospect first name; Zoom URL from appointment/org Personal Meeting URL resolver — never fabricate |
| Null behavior | **Fail closed** if URL missing/unauthorized |
| Buttons | **Recommended:** dynamic URL button `Join Zoom` / `Unirse a Zoom`. Optional: Speak with an agent, Stop. Fallback if Meta rejects button: body variable `{{2}} meeting_url` (full https URL only). |
| Consent / opt-out | Utility meeting access for scheduled interview |
| Risks | URL-in-body rejections; shortener bans; host allowlist for dynamic buttons |

**English body (recommended — URL in button, not body)**

```text
Hi {{1}}, here is your Team Vision interview Zoom access. Use the button below to join at the scheduled time.
```

**Spanish body (recommended)**

```text
Hola {{1}}, aquí tienes el acceso de Zoom para tu entrevista con Team Vision. Usa el botón de abajo para unirte a la hora programada.
```

**Fallback English body (only if Meta rejects dynamic URL button)**

```text
Hi {{1}}, here is your Team Vision interview Zoom link: {{2}}
```

**Fallback Spanish body**

```text
Hola {{1}}, aquí tienes el enlace de Zoom para tu entrevista con Team Vision: {{2}}
```

**Sanitized samples:** `Maria` · `https://us02web.zoom.us/j/00000000000` (example only; never invent in production)

---

### 7. `office_location`

| Field | Value |
|---|---|
| Registry key | `office_location` |
| Category | **utility** |
| Meta names | `atlas_office_location_en` / `atlas_office_location_es` |
| Language codes | `en` / `es` |
| Approval status | `draft` |
| Activation status | `inactive` |
| Atlas intents | `SEND_OFFICE_LOCATION`, `OFFICE_LOCATION` |
| Production call sites | `agentActionApplicationService` `SEND_OFFICE_LOCATION` (today org office freeform; Phase 1 must use appointment snapshot when present) |
| Parameters (order) | `{{1}} prospect_first_name`, `{{2}} meeting_address` |
| Sources | First name; **canonical meeting address** — office: BR-077 full address (Suite 189 + ZIP); public: appointment public address only |
| Null behavior | Fail closed if address incomplete/missing |
| Buttons | Speak with an agent, Stop (Reschedule optional) |
| Consent / opt-out | Utility location share |
| Risks | Partial addresses (`Doral, FL`); wrong-city hardcodes; substituting office for public meetings |

**English body**

```text
Hi {{1}}, your Team Vision interview location is: {{2}}.
```

**Spanish body**

```text
Hola {{1}}, la ubicación de tu entrevista con Team Vision es: {{2}}.
```

**Sanitized samples:**  
Office: `2500 NW 79th Ave, Suite 189, Doral, FL 33122`  
Public (example): `100 Biscayne Blvd, Miami, FL 33132`

---

### 8. `human_assist_notice`

| Field | Value |
|---|---|
| Registry key | `human_assist_notice` |
| Category | **utility** |
| Meta names | `atlas_human_assist_notice_en` / `atlas_human_assist_notice_es` |
| Language codes | `en` / `es` |
| Approval status | `draft` |
| Activation status | `inactive` |
| Atlas intents | `HUMAN_ASSIST`, `HANDOFF`, `HUMAN_ASSIST_NOTICE` |
| Production call sites | CE / human-assist paths (registry exists; outside-window send wiring Phase 1) |
| Parameters (order) | `{{1}} prospect_first_name` |
| Sources | Prospect first name |
| Null behavior | Prefer require name; else fail closed |
| Buttons | Speak with an agent (redundant but allowed), Stop |
| Consent / opt-out | Utility service notice |
| Risks | Over-promising human response time — keep non-committal |

**English body**

```text
Hi {{1}}, a Team Vision team member will follow up with you here on WhatsApp. Thank you for your patience.
```

**Spanish body**

```text
Hola {{1}}, un miembro del equipo de Team Vision te dará seguimiento por WhatsApp. Gracias por tu paciencia.
```

**Sanitized samples:** `Maria`

---

### Draft only — `follow_up` (not submission-ready)

| Field | Value |
|---|---|
| Registry key | `follow_up` |
| Category | **pending classification** — utility only if strictly operational re-engagement after an open recruiting conversation; marketing if cold nurture / promotional |
| Meta names (provisional) | `atlas_follow_up_en` / `atlas_follow_up_es` — **do not submit** |
| Approval status | `draft_pending_classification` |
| Activation status | `inactive` — never mark submission-ready until body+category locked |
| Intents | `FOLLOW_UP`, `NO_RESPONSE_FOLLOW_UP`, `WHATSAPP_FOLLOW_UP` |
| Call sites | Registry aliases only today — no automated production WhatsApp send found |
| Parameters (provisional) | `prospect_first_name` |
| Risk | Misclassifying recruiting nurture as utility |

**Provisional English (not approved for submit)**

```text
Hi {{1}}, this is Atlas from Team Vision Financial. Just checking in — are you still interested in scheduling your interview?
```

**Provisional Spanish (not approved for submit)**

```text
Hola {{1}}, soy Atlas de Team Vision Financial. Te escribo para saber si aún te interesa agendar tu entrevista.
```

---

## Configuration artifact (sanitized, inactive)

Documentation-only example. **Do not set on Railway in Phase 0.** Every locale remains inactive; `metaTemplateName` stays `null` until Meta approval + explicit env authorization.

```json
{
  "lead_welcome": {
    "english": { "metaTemplateName": null, "approved": false, "active": false },
    "spanish": { "metaTemplateName": null, "approved": false, "active": false }
  },
  "interview_confirmation": {
    "english": { "metaTemplateName": null, "approved": false, "active": false },
    "spanish": { "metaTemplateName": null, "approved": false, "active": false }
  },
  "interview_reminder": {
    "english": { "metaTemplateName": null, "approved": false, "active": false },
    "spanish": { "metaTemplateName": null, "approved": false, "active": false }
  },
  "interview_details": {
    "english": { "metaTemplateName": null, "approved": false, "active": false },
    "spanish": { "metaTemplateName": null, "approved": false, "active": false }
  },
  "missed_appointment": {
    "english": { "metaTemplateName": null, "approved": false, "active": false },
    "spanish": { "metaTemplateName": null, "approved": false, "active": false }
  },
  "zoom_invitation": {
    "english": { "metaTemplateName": null, "approved": false, "active": false },
    "spanish": { "metaTemplateName": null, "approved": false, "active": false }
  },
  "office_location": {
    "english": { "metaTemplateName": null, "approved": false, "active": false },
    "spanish": { "metaTemplateName": null, "approved": false, "active": false }
  },
  "human_assist_notice": {
    "english": { "metaTemplateName": null, "approved": false, "active": false },
    "spanish": { "metaTemplateName": null, "approved": false, "active": false }
  },
  "follow_up": {
    "english": { "metaTemplateName": null, "approved": false, "active": false },
    "spanish": { "metaTemplateName": null, "approved": false, "active": false }
  }
}
```

Proposed Meta names (documentation only — not for env until approved):

| Key | English Meta name | Spanish Meta name |
|---|---|---|
| `lead_welcome` | `atlas_lead_welcome_en` | `atlas_lead_welcome_es` |
| `interview_confirmation` | `atlas_interview_confirmation_en` | `atlas_interview_confirmation_es` |
| `interview_reminder` | `atlas_interview_reminder_en` | `atlas_interview_reminder_es` |
| `interview_details` | `atlas_interview_details_en` | `atlas_interview_details_es` |
| `missed_appointment` | `atlas_missed_appointment_en` | `atlas_missed_appointment_es` |
| `zoom_invitation` | `atlas_zoom_invitation_en` | `atlas_zoom_invitation_es` |
| `office_location` | `atlas_office_location_en` | `atlas_office_location_es` |
| `human_assist_notice` | `atlas_human_assist_notice_en` | `atlas_human_assist_notice_es` |
| `follow_up` (pending) | `atlas_follow_up_en` | `atlas_follow_up_es` |

---

## BR-078 recommendation (documentation)

See `docs/06-business/BUSINESS_RULES.md` — **BR-078 — WhatsApp Approved Template Catalog and Call-Site Mapping**.

Summary:

- BR-075 remains the sole authorization gate.
- BR-078 defines catalog semantics, mappings, parameters, and language rules.
- No outside-window freeform fallback.
- Exact key + exact locale + `approved` + `active` required.
- Missing/invalid mapping fails closed.
- Marketing templates retain marketing classification.
- Production activation requires Meta approval **and** explicit environment authorization.

**Runtime BR-078 behavior is not implemented in Phase 0.**

---

## Remaining Meta submission decisions (before Phase 2)

1. Firm legal/compliance sign-off on EN/ES bodies (especially `lead_welcome` marketing + opt-in framing).
2. Confirm Meta language codes `en`/`es` vs WABA preference for `en_US`/`es_MX` (Atlas registry currently emits `en`/`es`).
3. Confirm Zoom **dynamic URL button** availability for this WABA; else approve fallback body-URL design.
4. Confirm whether confirmation/details templates may include quick-reply set as submitted components.
5. Classify final `follow_up` body as utility vs marketing before any submit.
6. Confirm public-location copy under key name `office_location` is acceptable to Meta reviewers (parameter is `meeting_address`).
7. Explicit authorization to create templates in WhatsApp Manager (Phase 2).
8. Explicit authorization to activate Railway `WHATSAPP_APPROVED_TEMPLATES_JSON` (Phase 3).

## API

N/A (documentation packet). Future activation uses existing WhatsApp Cloud API template send path in `whatsappOutboundPipeline.js` under BR-075.

## Database

None for Phase 0. Delivery audit remains `whatsapp_outbound_deliveries` (migration 028) when sends occur later.

## Related Documents

- [WHATSAPP_OUTBOUND_AUTHORIZATION.md](./WHATSAPP_OUTBOUND_AUTHORIZATION.md)
- [WHATSAPP_OUTBOUND_CALL_SITE_INVENTORY.md](./WHATSAPP_OUTBOUND_CALL_SITE_INVENTORY.md)
- [BUSINESS_RULES.md](../06-business/BUSINESS_RULES.md) (BR-075, BR-077, BR-078)
- [ENVIRONMENT_CONFIGURATION.md](./ENVIRONMENT_CONFIGURATION.md)

## Decision History

| Date | Decision |
|---|---|
| 2026-08-06 | Phase 0 catalog decisions locked: dedicated `interview_confirmation`; `lead_welcome` stays marketing/inactive; add `zoom_invitation` + `office_location`; draft EN/ES bodies; no Meta submit; no Railway activation; no live WhatsApp. |
| 2026-08-06 | Zoom preferred design = dynamic URL button; body URL is fallback only. |
| 2026-08-06 | `office_location` parameter = canonical `meeting_address` (office BR-077 or public appointment address; never cross-substitute). |
| 2026-08-06 | `CONFIRMATION` removed from `interview_reminder` aliases in proposed mapping. |
| 2026-08-06 | BR-078 recommended as catalog/mapping rule; runtime deferred. |
| 2026-08-06 | Phase 1: registry contracts, intent mapping, variable builders, call-site wiring, validation, and tests implemented. Templates remain inactive; no Meta submit; no Railway activation. |

## Migration Notes

Phase 1 (**code-ready**): registry keys + intent map + call-site `templateKey` wiring + reminder language fix + tests.  
Phase 2: Meta Manager create/submit (explicit authorization required).  
Phase 3: Activate env with real approved names only (explicit authorization required).
