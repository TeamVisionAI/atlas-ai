# Sprint 11.4 — Meta WhatsApp Cloud API Production Setup

## Document control

| Field | Value |
|-------|-------|
| **Document ID** | DOC-0701 |
| **Title** | Sprint 11.4 Meta WhatsApp Cloud API Production |
| **Version** | 1.1 |
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
| **Team Vision Financial Business Portfolio** | ✅ Verified healthy — no advertising restrictions, no open support cases, business assets appear healthy (2026-07-21) |
| **WhatsApp Business Account (WABA)** | ❌ Blocked — restriction reported during Cloud API initialization |
| **Atlas backend / Railway / webhook code** | ✅ Not the root cause — no Atlas code change resolves a Meta WABA restriction |

This is a **Meta account-level restriction**, not an Atlas backend issue. Investigation indicates the restriction is **likely isolated to the WABA**, not the Business Portfolio itself.

### Business Portfolio verification (2026-07-21)

The **Team Vision Financial Business Portfolio** was reviewed in Meta Business Suite:

| Check | Result |
|-------|--------|
| Advertising restrictions | None observed |
| Open support cases | None |
| Business assets (Pages, ad accounts, portfolio health) | Appear healthy |
| Business Portfolio–level policy holds | None identified |

**Conclusion:** The Cloud API onboarding failure is **not explained by a portfolio-wide Meta restriction**. Focus troubleshooting on the **specific WhatsApp Business Account (WABA)** tied to **+1 786-752-8080**, not on Business Verification or portfolio-level advertising status.

**Do not:**

- Re-submit Business Verification solely because of this WABA error (portfolio already appears healthy)
- Assume Facebook/Instagram ad delivery is blocked (portfolio advertising restrictions were not found)
- Redeploy Atlas or change Railway env vars expecting a portfolio-level fix

**Do:**

- Open **Business settings → Accounts → WhatsApp accounts** and inspect the **individual WABA** for restriction banners, quality rating, or policy status
- Confirm the WABA is linked to the correct Business Portfolio and Atlas Meta app
- Contact Meta Support referencing the **WABA** (not the portfolio) if the WABA remains restricted with a healthy portfolio

### Impact on MVP launch

Until Meta clears the WABA restriction and Cloud API setup completes:

- A Meta **test number** may not be claimable in the developer console
- Production messaging may rely on previously configured env tokens (`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`) or an existing Embedded Signup connection — not on a newly claimed test asset
- The **live end-to-end smoke test** (Ad → WhatsApp **786-752-8080** → Atlas → Calendar) cannot be accepted as complete until Meta account setup is verified

---

## Prerequisites before continuing Cloud API setup

Complete these **in Meta** before retrying Cloud API initialization or claiming a test number:

1. **Confirm Business Portfolio health** (already verified for Team Vision Financial — see above). If portfolio restrictions appear later, resolve at portfolio level first.
2. **Verify WABA status** in [Meta Business Suite](https://business.facebook.com/) → **Settings** → **WhatsApp Accounts** (or **Business settings** → **Accounts** → **WhatsApp accounts**). Inspect the **specific WABA** for **786-752-8080**, not only the portfolio overview.
3. **Review WABA-only restrictions** — policy holds, quality rating, “restricted” labels, or messaging limits on the WhatsApp account itself.
4. In [Meta for Developers](https://developers.facebook.com/) → your Atlas app → **WhatsApp** → **API Setup**, confirm the WABA appears and is not in an error or restricted state.
5. Only after the **WABA** (not just the portfolio) is **active / eligible**, retry **Cloud API setup** or **Add phone number** / test number claim.

> **Rule:** **WABA status must be verified before continuing Cloud API setup.** A healthy Business Portfolio does not guarantee a healthy WABA. Retrying Atlas Embedded Signup or redeploying Railway will not bypass a WABA-level restriction.

---

## Troubleshooting

### Symptom: Onboarding stops with “WhatsApp Business Account restriction”

**First:** Confirm whether the restriction is portfolio-wide or WABA-only.

| Scope | Where to look | Team Vision status (2026-07-21) |
|-------|---------------|----------------------------------|
| **Business Portfolio** | Business Suite → Business settings → Business info / Account quality | ✅ Healthy — no ad restrictions, no support cases |
| **WABA only** | Business settings → Accounts → **WhatsApp accounts** → select the WABA | ❌ Investigate — restriction likely here |

| Check | Action |
|-------|--------|
| WABA restricted or disabled | Resolve on the **WhatsApp account** in Business Suite; contact Meta Support citing WABA ID if portfolio is healthy |
| Business Portfolio restricted | Not observed for Team Vision Financial — if this changes, resolve portfolio issues first |
| Business not verified | Only if Meta shows verification required at portfolio level (not indicated in 2026-07-21 review) |
| Wrong Business Portfolio | Ensure the WABA belongs to the Team Vision Financial portfolio used for the Atlas app |
| App not added to WABA | In Business Settings, grant the Atlas Meta app access to the WABA |
| Region / eligibility | Confirm the business number **786-752-8080** is eligible for Cloud API in your market |
| WABA quality rating / messaging limits | Review WABA-specific quality and messaging tier in WhatsApp Manager |

**Atlas-side verification (confirms backend is not the blocker):**

```bash
curl https://atlas-ai-production-01de.up.railway.app/health/production
```

If `mvpReady: true` and `whatsapp_send` is OK, the remaining work is **Meta WABA setup**, not Atlas deployment or Business Portfolio health.

### Symptom: Portfolio looks healthy but Cloud API still fails

This matches the Sprint 11.4 finding for Team Vision Financial:

1. Portfolio-level checks pass (no ad restrictions, no support cases).
2. Cloud API initialization still fails with a **WABA restriction**.
3. **Treat as WABA-isolated** — drill into WhatsApp Manager / WhatsApp accounts for the specific account behind **786-752-8080**.
4. Escalate to Meta Support with: Business Portfolio ID, WABA ID, phone number, and screenshot of the WABA restriction (not portfolio overview).

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
| 2026-07-21 | Verified **Team Vision Financial Business Portfolio** healthy (no ad restrictions, no support cases); concluded restriction is **likely WABA-isolated**, not portfolio-wide |

---

## One-line summary

> **Sprint 11.4 Atlas code is production-ready; Meta Cloud API onboarding paused on a WABA-level restriction. Team Vision Financial Business Portfolio verified healthy — troubleshoot the specific WhatsApp Business Account for 786-752-8080 before continuing Cloud API setup.**
