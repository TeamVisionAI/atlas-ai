# TikFinity TikTok LIVE attribution (Phase 1)

Atlas accepts TikFinity WebHook events from TikTok LIVE and records **engagement only**.

TikTok username is not a prospect identity. This endpoint does **not** create a prospect, start Recruit AI, send WhatsApp, assign a recruiter, or open a conversation.

Later work can correlate a LIVE engagement to a QR / WhatsApp intake. That linking is **not** implemented here.

## Endpoint

`GET` or `POST` `/api/integrations/tikfinity/live-event`

## TikFinity values

| Field | Meaning |
|---|---|
| `value1` | Username of the event trigger |
| `value2` | Text behind the command (when event = command) |
| `value3` | Gift name / SKU (when event = gift; stored, unused for Phase 1 command path) |

Atlas also accepts:

| Query / body | Meaning |
|---|---|
| `secret` | Shared webhook secret (`TIKFINITY_WEBHOOK_SECRET`) |
| `organizationId` | Tenant that owns the LIVE (required UUID) |
| `campaign` | Campaign attribution (example `TVA_LIVE_IUL`) |
| `funnel` | Funnel attribution (example `IUL_REVIEW`) |
| `command` | Explicit command (`IUL` or `TRABAJO`) |

Optional header (future): `x-tikfinity-secret`.

## Example TikFinity WebHook URL

IUL:

```
https://api.useatlas-ai.com/api/integrations/tikfinity/live-event?secret=<SECRET>&organizationId=<ORG_ID>&campaign=TVA_LIVE_IUL&funnel=IUL_REVIEW&command=IUL
```

Recruiting:

```
https://api.useatlas-ai.com/api/integrations/tikfinity/live-event?secret=<SECRET>&organizationId=<ORG_ID>&campaign=TVA_LIVE_RECRUIT&funnel=RECRUITING&command=TRABAJO
```

Replace `<SECRET>` with the Railway / env value of `TIKFINITY_WEBHOOK_SECRET`. Do not commit the production secret.

TikFinity appends `value1` / `value2` / `value3` to this URL when the LIVE command fires.

Example viewer input:

```
/IUL quiero revisar mi póliza
```

Atlas stores:

- `source = TIKTOK_LIVE`
- `platform = tiktok`
- `event_type = command`
- `username` from `value1`
- `command = IUL`
- `command_text` from `value2`
- `gift_name` from `value3` when present
- `campaign` / `funnel` from the URL
- `received_at`

## Commands

Whitelist only (case-insensitive; leading `/`, `?`, or `#` stripped):

- `IUL`
- `TRABAJO`

Unknown commands return `400`.

## Auth

This endpoint is a public webhook. Atlas session, CSRF, and same-origin browser auth are not required. `TIKFINITY_WEBHOOK_SECRET` is the security boundary.

- Missing or wrong secret → `401`
- Secret is never written to structured logs
- Access logs redact `secret=` query values
- Browser-like TikFinity POSTs (Origin `https://tikfinity.zerody.one`) must reach the handler; they must not be rejected with a global origin `403`

## Tenant

`organizationId` is required and must be a real organization. Username must not imply tenant. Missing org → `400`. Malformed UUID → `400`. Unknown org → `404`.

## Dedupe

Same organization + username + command + command text inside a 20-second window returns:

```json
{ "ok": true, "recorded": false, "duplicate": true }
```

and does not insert another row.

## Success

```json
{ "ok": true, "recorded": true }
```

## Storage

New table `tiktok_live_engagements` (migration `072_tiktok_live_engagements.sql`). No `prospect_id`. Backend service-role only.

## Read-only Atlas UI

Authenticated RVP / Admin users can open **Growth → TikTok LIVE** (`/app/tiktok-live-engagements`).

`GET /api/tiktok-live-engagements` returns the current tenant’s captured rows only (session `organizationId`). It does not accept a foreign org, create prospects, or expose `TIKFINITY_WEBHOOK_SECRET`.

Empty state: `No TikTok LIVE engagements captured yet.`

## Env

```
TIKFINITY_WEBHOOK_SECRET=
```
