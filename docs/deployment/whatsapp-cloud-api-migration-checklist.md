# Sprint 11.4 — WhatsApp Cloud API Migration Checklist

## Document control

| Field | Value |
|-------|-------|
| **Document ID** | DOC-0702 |
| **Title** | WhatsApp Cloud API Migration Checklist |
| **Version** | 1.6 |
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

### Phase 2 — Step 2: Production setup (Use cases UI)

> **Navigation:** App → **Use cases** → WhatsApp use case → **Step 2: Production setup**.  
> **Do not use Step 1 (Testing)** for production — Step 1 has **no WABA selection**.  
> **Status (2026-07-21):** Registration **failed** — Meta error **`Unexpected null value for wabaID`** before SMS verification. WABA not resolved in UI. See [wabaID incident](./sprint-11.4-meta-production.md#incident-unexpected-null-value-for-wabaid-2026-07-21).

- [x] Open [Meta for Developers](https://developers.facebook.com/) → **existing Atlas app**
- [x] Navigate to **Use cases** → WhatsApp use case → **Step 2 (Production setup)**
- [x] Attempt **Add phone number** for **786-752-8080** — **failed** (`wabaID` null)

#### Phase 2a — WABA and migration review

- [ ] Confirm **Niovel Perez WABA ID** is visible and non-null in Business Settings
- [ ] Confirm Atlas app has permissions on Niovel Perez WABA
- [ ] Record findings in [WABA review table](./sprint-11.4-meta-production.md#waba-and-migration-review-complete-before-add-phone-number) (DOC-0701)

#### Phase 2b — Add phone number (failed — retry after WABA fix)

- [x] **Add phone number** attempted — **failed** before SMS: `Unexpected null value for wabaID`
- [ ] **Resolve WABA binding** in Meta Step 2 — target **Niovel Perez** must resolve before retry
- [ ] **Retry Add phone number** for **786-752-8080** after WABA confirmed in UI

#### Phase 2c — Verification code gate (on retry only)

> Applies **only if** registration reaches verification step on retry. Failed attempt did **not** reach SMS.

- [ ] Migration warnings reviewed; [confirmation screens](./sprint-11.4-meta-production.md#confirmation-screen-log-deployment-record) captured
- [ ] Enter verification code and complete registration
- [ ] Confirm valid **`phone_number_id`** for **8080**

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
| `Unexpected null value for wabaID` | Meta UI failed to resolve WABA — fix Niovel Perez WABA binding in Step 2 before retry ([incident](./sprint-11.4-meta-production.md#incident-unexpected-null-value-for-wabaid-2026-07-21)) |
| Registration paused at verification | On **retry** only — capture [confirmation screens](./sprint-11.4-meta-production.md#confirmation-screen-log-deployment-record) before entering code |
| Cannot find phone registration | Use **Add phone number** in Step 2 — after [WABA review](./sprint-11.4-meta-production.md#waba-and-migration-review-complete-before-add-phone-number) |
| Cannot find WABA picker | You may be in **Step 1 (Testing)** — proceed to **Step 2 (Production setup)** |
| Wrong WABA selected | **Step 2 (Production setup)** → switch to **Niovel Perez** only |

---

## One-line summary

> **Add phone number failed: wabaID null. Meta WABA resolution issue — not Atlas. Fix WABA in Meta Step 2, then retry.**
