# Sprint 11.4 — Meta WhatsApp Cloud API Production Setup

## Document control

| Field | Value |
|-------|-------|
| **Document ID** | DOC-0701 |
| **Title** | Sprint 11.4 Meta WhatsApp Cloud API Production |
| **Version** | 1.0 |
| **Status** | Draft |
| **Owner** | Atlas Development Team |
| **Last Updated** | 2026-07-21 |
| **Related Sprint** | 11.4 |
| **Related Release** | Release-11.4 |

---

## Purpose

Record Sprint **11.4** production Meta WhatsApp Cloud API setup status, distinguish Atlas backend readiness from Meta account restrictions, and provide troubleshooting steps before continuing Cloud API onboarding.

**Business number (production target):** +1 **786-752-8080**

---

## Related documents

| Document | Description |
|----------|-------------|
| [Sprint-11.4.md](../05-sprints/Sprint-11.4.md) | Sprint 11.4 specification and phase status |
| [WHATSAPP_EMBEDDED_SIGNUP.md](../WHATSAPP_EMBEDDED_SIGNUP.md) | Embedded Signup flow and env vars |
| [SPRINT_11_1_LIVE_WHATSAPP.md](../SPRINT_11_1_LIVE_WHATSAPP.md) | Live webhook inbound/outbound pipeline |
| [Current_System_State.md](../00-executive/Current_System_State.md) | Production system state |
| [Meta_Approval_Portfolio.md](../04-meta/Meta_Approval_Portfolio.md) | Meta Business Verification materials |

---

## Sprint 11.4 production context

Sprint 11.4 Phase A delivered the Atlas production pipeline:

```
Meta Webhook → whatsappInboundPipeline → Communication Hub
  → Conversation Engine → whatsappOutboundPipeline → WhatsApp Cloud API
```

Atlas backend, Railway deployment, and readiness checks (`GET /health/production`) can report **`mvp_ready: true`** while Meta account-level setup is still incomplete. **Do not assume Meta onboarding succeeded because Atlas code is deployed.**

---

## Incident: WABA restriction during Cloud API initialization

### What happened

During **Meta WhatsApp Cloud API initialization** (Sprint 11.4 production onboarding), the Meta onboarding flow **stopped with a WhatsApp Business Account (WABA) restriction** before a **test number could be claimed**.

### Classification

| Layer | Status |
|-------|--------|
| **Meta WABA / account policy** | ❌ Blocked — restriction on the WhatsApp Business Account |
| **Atlas backend / Railway / webhook code** | ✅ Not the root cause — no Atlas code change resolves a Meta account restriction |

This is an **account-level Meta restriction**, not an Atlas backend issue.

### Impact on MVP launch

Until Meta clears the WABA restriction and Cloud API setup completes:

- A Meta **test number** may not be claimable in the developer console
- Production messaging may rely on previously configured env tokens (`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`) or an existing Embedded Signup connection — not on a newly claimed test asset
- The **live end-to-end smoke test** (Ad → WhatsApp **786-752-8080** → Atlas → Calendar) cannot be accepted as complete until Meta account setup is verified

---

## Prerequisites before continuing Cloud API setup

Complete these **in Meta** before retrying Cloud API initialization or claiming a test number:

1. **Verify WABA status** in [Meta Business Suite](https://business.facebook.com/) → **Settings** → **WhatsApp Accounts** (or **Business settings** → **Accounts** → **WhatsApp accounts**).
2. **Confirm Business Verification** status for the Meta Business Portfolio tied to the WABA (if Meta prompts for verification, complete it first).
3. **Review account quality / restrictions** — look for banners, policy holds, or “restricted” labels on the WABA.
4. In [Meta for Developers](https://developers.facebook.com/) → your Atlas app → **WhatsApp** → **API Setup**, confirm the WABA appears and is not in an error or restricted state.
5. Only after WABA status is **active / eligible**, retry **Cloud API setup** or **Add phone number** / test number claim.

> **Rule:** **WABA status must be verified before continuing Cloud API setup.** Retrying Atlas Embedded Signup or redeploying Railway will not bypass a Meta account restriction.

---

## Troubleshooting

### Symptom: Onboarding stops with “WhatsApp Business Account restriction”

| Check | Action |
|-------|--------|
| WABA restricted or disabled | Resolve in Meta Business Suite; contact Meta Support if no self-serve fix |
| Business not verified | Submit Business Verification in Meta Business Settings |
| Wrong Business Portfolio | Ensure the WABA belongs to the portfolio used for Team Vision Financial / Atlas app |
| App not added to WABA | In Business Settings, grant the Atlas Meta app access to the WABA |
| Region / eligibility | Confirm the business number **786-752-8080** is eligible for Cloud API in your market |

**Atlas-side verification (confirms backend is not the blocker):**

```bash
curl https://atlas-ai-production-01de.up.railway.app/health/production
```

If `mvpReady: true` and `whatsapp_send` is OK, the remaining work is **Meta account / WABA**, not Atlas deployment.

### Symptom: Cannot claim a test number

1. Confirm WABA is **not restricted** (see above).
2. In Developer Console → WhatsApp → **API Setup**, check whether Meta offers a test number for your app tier.
3. If test number claim is unavailable, use the **production business number** (+1 786-752-8080) only after WABA and Business Verification allow it.
4. Do not rotate `WHATSAPP_*` env vars on Railway until Meta shows a valid `phone_number_id` for the connected asset.

### Symptom: Embedded Signup completes but sends fail

1. Check `GET /health/production` → `whatsapp_send.detail` (`source=embedded_signup` vs `source=environment`).
2. Run connection health: `GET /api/meta/whatsapp/health` (requires Atlas auth bootstrap).
3. See [WHATSAPP_EMBEDDED_SIGNUP.md](../WHATSAPP_EMBEDDED_SIGNUP.md) for token and WABA subscription checklist.

### Symptom: Webhook receives messages but no Atlas reply

This is an **Atlas pipeline** issue (distinct from WABA restriction):

1. Confirm Sprint 11.4 Phase A is deployed on `main`.
2. Check Railway logs for `conversation_engine_invoked` and `conversation_engine_reply_sent`.
3. Run `node backend/dev/verifySprint11_4.js` locally with Supabase configured.

---

## Atlas production checklist (after Meta clears WABA)

- [ ] WABA status verified — no restriction banners in Meta Business Suite
- [ ] Cloud API setup completed or production number **786-752-8080** connected with valid `phone_number_id`
- [ ] Webhook URL pointed to Railway: `https://<railway-host>/webhook`
- [ ] `VERIFY_TOKEN` and (recommended) `META_APP_SECRET` set on Railway
- [ ] `GET /health/production` returns `mvp_ready: true`
- [ ] Live smoke test: personal phone → **786-752-8080** → Atlas reply → qualification → calendar booking

---

## Resolution log

| Date | Event |
|------|-------|
| 2026-07-21 | Documented: Meta Cloud API initialization blocked by **WABA account restriction** before test number claim; classified as Meta account issue, not Atlas backend defect |

---

## One-line summary

> **Sprint 11.4 Atlas code is production-ready; Meta WhatsApp Cloud API onboarding paused on a WABA account restriction — verify and clear WABA status in Meta before continuing Cloud API setup or claiming a test number.**
