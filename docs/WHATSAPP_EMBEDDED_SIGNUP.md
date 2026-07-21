# WhatsApp Business App Embedded Signup (Sprint 6)

Connect an existing WhatsApp Business App to Atlas using Meta’s configuration-driven Embedded Signup flow — without replacing the mobile app.

This sprint **does not** change `/webhook` verification behavior for the existing test-number integration. After onboarding, configure Meta webhooks to point at the same Atlas `/webhook` endpoint.

---

## 1. Required environment variables

### Backend (`.env` — never commit)

| Variable | Purpose |
|----------|---------|
| `META_APP_ID` | Meta app ID (backend only — do not rely on `VITE_META_APP_ID` server-side) |
| `META_APP_SECRET` | Server-side only — OAuth code exchange + signature validation |
| `META_EMBEDDED_SIGNUP_CONFIG_ID` | Embedded Signup configuration ID from Meta |
| `META_GRAPH_API_VERSION` | e.g. `v21.0` |
| `META_TOKEN_ENCRYPTION_KEY` | **Sprint 6.1** — 32+ byte secret or 64-char hex for AES-256-GCM at rest (recommended) |
| `FRONTEND_URL` | Allowed frontend origin (local dev: `http://localhost:5173`) |
| `VERIFY_TOKEN` | Existing webhook verify token (unchanged) |
| `WHATSAPP_ACCESS_TOKEN` | Fallback when no Embedded Signup connection is stored |
| `WHATSAPP_PHONE_NUMBER_ID` | Fallback phone number ID when no Embedded Signup connection is stored |

**Outbound send path (production):** `whatsappSendCredentials.js` prefers the encrypted token from Embedded Signup (`metaWhatsAppConnection.json` / future Supabase). Env vars are used only when no stored connection exists.

### Frontend (`.env` or `frontend/.env` — public only)

| Variable | Purpose |
|----------|---------|
| `VITE_META_APP_ID` | Same Meta app ID (safe in browser) |
| `VITE_META_EMBEDDED_SIGNUP_CONFIG_ID` | Same configuration ID |
| `VITE_META_GRAPH_API_VERSION` | e.g. `v21.0` |

**Never** put `META_APP_SECRET` or access tokens in frontend env vars.

Copy `.env.example` → `.env` and fill values.

---

## 2. Where to obtain the Configuration ID

1. Open [Meta for Developers](https://developers.facebook.com/) → your Atlas app.
2. Go to **Facebook Login for Business** → **Configurations** (Embedded Signup Builder).
3. Create or select a configuration for **WhatsApp Business App onboarding**.
4. Set feature type: **`whatsapp_business_app_onboarding`** (do **not** pass `extras.version`).
5. Copy the **Configuration ID** into:
   - `META_EMBEDDED_SIGNUP_CONFIG_ID` (backend)
   - `VITE_META_EMBEDDED_SIGNUP_CONFIG_ID` (frontend)

---

## 3. Test from Embedded Signup Builder

1. In the Embedded Signup Builder, use **Test** to launch the flow.
2. Ensure redirect / allowed domains include your local frontend URL.
3. Complete onboarding with Niovel’s WhatsApp Business App number: **+1 786-752-8080**.

---

## 4. Run Atlas locally

Terminal 1 — backend (port 3000):

```bash
cd atlas-ai
npm run dev
```

Terminal 2 — frontend (port 5173, proxies `/api` → backend):

```bash
cd atlas-ai/frontend
npm run dev
```

---

## 5. Open the Connect WhatsApp screen

**Direct URL:** [http://localhost:5173/settings/whatsapp](http://localhost:5173/settings/whatsapp)

Or: **Settings** in the sidebar → **Connect WhatsApp Business**.

---

## 6. Expected flow

1. Click **Connect WhatsApp Business** (not “Log in with Facebook”).
2. Facebook SDK opens Embedded Signup (`featureType: "whatsapp_business_app_onboarding"`).
3. Complete Facebook login and existing WhatsApp Business App onboarding.
4. Scan QR in the mobile WhatsApp Business App.
5. Meta posts `WA_EMBEDDED_SIGNUP` → `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING` (or `FINISH`) with WABA / phone IDs (optional).
6. `FB.login` returns an authorization **code** (order vs step 5 may vary).
7. Frontend coordinator calls `POST /api/meta/embedded-signup/exchange` only after **both** the authorization code and a FINISH event are present. Missing WABA/phone IDs are resolved by the backend after exchange.
8. Backend exchanges code → access token (server-side only), verifies assets, subscribes WABA to the app.
9. Connection stored via repository abstraction (`json_file` in dev; Supabase target in production) with encrypted access token.
10. UI shows **Connected** with safe metadata and live health status (no token).

---

## 7. API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/meta/embedded-signup/status` | Safe connection status |
| `GET` | `/api/meta/embedded-signup/health` | Live Meta Graph health check + reconnect TODO |
| `POST` | `/api/meta/embedded-signup/exchange` | Exchange authorization code |

Exchange body:

```json
{
  "code": "authorization-code",
  "wabaId": "optional",
  "phoneNumberId": "optional",
  "onboardingType": "whatsapp_business_app"
}
```

Safe response:

```json
{
  "success": true,
  "connection": {
    "wabaId": "...",
    "phoneNumberId": "...",
    "connectionType": "whatsapp_business_app",
    "status": "connected"
  }
}
```

---

## 8. Security notes

- Never commit `.env`, access tokens, or `backend/data/metaWhatsAppConnection.json`.
- Authorization codes are single-use; duplicate exchanges return `409`.
- Exchange endpoint is rate-limited per IP.
- Meta errors are sanitized before returning to the browser.
- Existing `/webhook` signature middleware is unchanged.

---

## 9. Sprint 6.1 hardening (pre-merge)

Before merging Sprint 6, these platform abstractions are in place:

| Component | Location | Purpose |
|-----------|----------|---------|
| Repository interface | `backend/repositories/metaConnectionRepositoryInterface.js` | Contract for JSON (dev) → Supabase (prod) swap |
| JSON implementation | `backend/repositories/jsonMetaWhatsAppConnectionRepository.js` | Dev storage with encrypted tokens |
| Token encryption | `backend/core/meta/tokenEncryption.js` | AES-256-GCM abstraction; dev fallback from `META_APP_SECRET` |
| Environment validator | `backend/core/meta/metaEnvironmentValidator.js` | Startup warnings for missing Meta env |
| Logger | `backend/core/meta/metaLogger.js` | Structured JSON logs for `meta_onboarding` |
| Connection health | `backend/core/meta/metaConnectionHealthService.js` | Graph API phone + WABA subscription checks |
| Reconnect flow | `backend/core/meta/metaReconnectFlow.js` | **TODO** — manual retry only until Sprint 6.2+ |

Server startup calls `logMetaEnvironmentWarnings()` from `backend/server.js`.

---

## 10. Verification

```bash
node backend/dev/verifySprint6WhatsAppEmbeddedSignup.js
```

---

## 11. Production checklist

- [ ] Swap JSON repository for Supabase implementation (same interface)
- [ ] Set `META_TOKEN_ENCRYPTION_KEY` in production
- [ ] Set `META_APP_SECRET` in production
- [ ] Configure Meta webhook URL → `https://{host}/webhook`
- [ ] Confirm WABA subscribed to Atlas app after connect
