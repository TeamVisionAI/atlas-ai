# Sprint 11.4 — WhatsApp Cloud API Migration Checklist

## Document control

| Field | Value |
|-------|-------|
| **Document ID** | DOC-0702 |
| **Title** | WhatsApp Cloud API Migration Checklist |
| **Version** | 1.1 |
| **Status** | Active |
| **Owner** | Atlas Development Team |
| **Last Updated** | 2026-07-21 |
| **Related Sprint** | 11.4 |
| **Related Release** | Release-11.4 |

---

## Purpose

Step-by-step checklist to migrate **+1 786-752-8080** to WhatsApp Cloud API for Atlas AI production using the **Niovel Perez WABA**. Follow after reading [sprint-11.4-meta-production.md](./sprint-11.4-meta-production.md) (DOC-0701) — final production decision approved.

**Scope:** **786-752-8080** only. **Ana Perez / 786-296-7254** is out of scope — do not modify.

---

## Related documents

| Document | Description |
|----------|-------------|
| [sprint-11.4-meta-production.md](./sprint-11.4-meta-production.md) | WABA inventory, architecture, Meta troubleshooting (DOC-0701) |
| [WHATSAPP_EMBEDDED_SIGNUP.md](../WHATSAPP_EMBEDDED_SIGNUP.md) | Embedded Signup and env vars |
| [SPRINT_11_1_LIVE_WHATSAPP.md](../SPRINT_11_1_LIVE_WHATSAPP.md) | Inbound/outbound webhook pipeline |
| [Current_System_State.md](../00-executive/Current_System_State.md) | Production system state |

---

## Pre-migration constraints

- Use the **existing Atlas Meta Developer App** — do not create a new app.
- Select **Niovel Perez WABA** only — not the Meta-generated **Test WABA** (disabled).
- Do **not** bind or change **Ana Perez / 786-296-7254**.
- Existing WhatsApp Business App **chat history on 8080 does not need to be preserved**.
- Do **not** delete unused WABAs until Atlas is stable after migration.
- Do **not** follow legacy Meta docs showing a standalone **WhatsApp** product in Developer Console — use **Use cases** UI ([DOC-0701 § Use Cases UI](./sprint-11.4-meta-production.md#meta-developer-console--use-cases-ui-2026-07-21))

---

## Migration checklist

### Phase 1 — Meta Business verification

- [ ] **Verify approved WABA inventory** — Business settings → Accounts → WhatsApp accounts
  - [ ] **Niovel Perez** → **+1 786-752-8080** — status **Approved**
  - [ ] **Ana Perez** → **+1 786-296-7254** — **unchanged** (out of scope)
  - [ ] Meta-generated **Test WABA** — **disabled** — do not use
- [ ] Confirm Team Vision Financial Business Portfolio is healthy (Business Home loads)

### Phase 2 — Associate WABA in Developer Console (Use cases UI)

> **Navigation:** App → **Use cases** → WhatsApp use case — **not** the deprecated standalone **WhatsApp** product menu. See [Use Cases UI](./sprint-11.4-meta-production.md#meta-developer-console--use-cases-ui-2026-07-21).

- [ ] Open [Meta for Developers](https://developers.facebook.com/) → **existing Atlas app**
- [ ] Navigate to **Use cases** → WhatsApp / WhatsApp Business Platform use case
- [ ] **Select Niovel Perez WABA** (786-752-8080) — reject Test WABA if auto-selected
- [ ] Complete Cloud API configuration for **786-752-8080**
- [ ] Confirm valid **`phone_number_id`** appears for **8080** in the use case settings
- [ ] Grant Atlas app access to Niovel Perez WABA in Business Settings if prompted

### Phase 3 — Migrate 786-752-8080 to Cloud API

- [ ] Production number **786-752-8080** connected to Cloud API under Niovel Perez WABA
- [ ] WABA subscribed to Atlas app (webhook field subscriptions enabled)
- [ ] Copy credentials from the WhatsApp use case configuration for Phase 4 and ID registry below

### Phase 4 — Update Atlas environment (Railway / `.env`)

Update production env on Railway (local `.env` for dev only — never commit secrets):

| Variable | Source | Updated |
|----------|--------|---------|
| `WHATSAPP_ACCESS_TOKEN` | Use case / Cloud API settings → temporary or System User token | [ ] |
| `WHATSAPP_PHONE_NUMBER_ID` | Use case settings → Phone number ID for **8080** | [ ] |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | Niovel Perez **WABA ID** | [ ] |
| `META_APP_ID` | Atlas Developer App ID | [ ] |
| `META_APP_SECRET` | App Settings → Basic (recommended for webhook signatures) | [ ] |
| `VERIFY_TOKEN` | Same value configured in Meta webhook settings | [ ] |

Reference template: [`.env.example`](../../.env.example)

- [ ] Redeploy Railway service after env changes
- [ ] Run readiness probe:

```bash
curl https://atlas-ai-production-01de.up.railway.app/health/production
```

- [ ] Confirm `mvp_ready: true` and `whatsapp_send` OK

### Phase 5 — Verify webhook

- [ ] Meta webhook URL → `https://<railway-host>/webhook`
- [ ] Webhook **Verify token** matches Railway `VERIFY_TOKEN`
- [ ] Subscribe to **`messages`** (and other fields Atlas uses)
- [ ] Click **Verify and save** in the WhatsApp use case webhook settings — verification succeeds
- [ ] (Recommended) Set `META_APP_SECRET` so signature validation is enabled
- [ ] Send a test event or check Railway logs for successful webhook delivery

### Phase 6 — First production message (outbound)

- [ ] From Atlas or Graph API test tool, send first **outbound** message to a personal test phone from **786-752-8080**
- [ ] Message delivers successfully (no Graph API auth or WABA errors)
- [ ] Railway logs show outbound send success

### Phase 7 — Verify inbound / outbound messaging (Atlas pipeline)

- [ ] From personal phone, send WhatsApp to **+1 786-752-8080**
- [ ] Atlas **inbound** webhook received (check Railway logs: message persisted)
- [ ] Atlas **outbound** automated reply within ~30 seconds (`conversation_engine_reply_sent`)
- [ ] Complete qualification flow through interview scheduling (Google Calendar event if configured)
- [ ] Confirmation message received on personal phone

Optional verification scripts (local, with Supabase configured):

```bash
node backend/dev/verifySprint11_4.js
node backend/dev/verifyProductionPipeline.js
```

### Phase 8 — Record generated IDs (maintenance registry)

Record all IDs in a secure internal vault (1Password, Railway env notes, or ops runbook — **not** in git). Use this template:

| Field | Value | Recorded date | Notes |
|-------|-------|---------------|-------|
| **Phone Number ID** | _from Use cases WhatsApp config — 8080_ | | Maps to `WHATSAPP_PHONE_NUMBER_ID` |
| **WABA ID** | _Niovel Perez WABA ID_ | | Maps to `WHATSAPP_BUSINESS_ACCOUNT_ID` |
| **Access Token** | _stored in Railway only_ | | Maps to `WHATSAPP_ACCESS_TOKEN`; rotate per Meta policy |
| **App ID** | _Atlas Developer App ID_ | | Maps to `META_APP_ID` / `VITE_META_APP_ID` |
| **App Secret** | _stored in Railway only_ | | Maps to `META_APP_SECRET` |
| **Business Portfolio ID** | _optional_ | | Team Vision Financial |
| **Webhook URL** | `https://<railway-host>/webhook` | | |
| **Verify Token** | _reference only — secret in Railway_ | | |

- [ ] **Phone Number ID** recorded
- [ ] **WABA ID** recorded
- [ ] **Access Token** stored securely (Railway production env)
- [ ] **App ID** recorded
- [ ] **App Secret** stored securely (Railway production env)
- [ ] ID registry shared with ops / maintenance owner

---

## Post-migration sign-off

- [ ] Live smoke test passed: **786-752-8080** → Atlas reply → qualification → calendar → confirmation
- [ ] Ana Perez / **786-296-7254** verified **unchanged**
- [ ] Resolution log updated in [sprint-11.4-meta-production.md](./sprint-11.4-meta-production.md)
- [ ] [Current_System_State.md](../00-executive/Current_System_State.md) updated if blockers cleared

---

## Troubleshooting

| Symptom | Action |
|---------|--------|
| WABA restriction during setup | See [DOC-0701 troubleshooting](./sprint-11.4-meta-production.md#troubleshooting) |
| Webhook verify fails | Confirm `VERIFY_TOKEN` matches Meta; Railway URL is HTTPS and reachable |
| Inbound works, no Atlas reply | Confirm Sprint 11.4 Phase A on `main`; check `conversation_engine_invoked` logs |
| `mvp_ready: false` | Run `GET /health/production`; fix Supabase, WhatsApp credentials, or Google Calendar gaps |
| Wrong WABA selected | **Use cases** → WhatsApp config → switch to **Niovel Perez** only |
| Legacy Meta doc shows WhatsApp product menu | Use [Use Cases UI](./sprint-11.4-meta-production.md#meta-developer-console--use-cases-ui-2026-07-21) path instead |

---

## One-line summary

> **Migrate 786-752-8080 via Niovel Perez WABA using Meta Use cases UI: verify WABA → configure use case → update Atlas env → verify webhook → test inbound/outbound → record all IDs.**
