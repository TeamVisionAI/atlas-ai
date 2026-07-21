# Sprint 11.4 — Meta WhatsApp Cloud API Production Setup

## Document control

| Field | Value |
|-------|-------|
| **Document ID** | DOC-0701 |
| **Title** | Sprint 11.4 Meta WhatsApp Cloud API Production |
| **Version** | 1.4 |
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

### Root cause (refined)

Meta onboarding **automatically selected a disabled Test WhatsApp Business Account** instead of the **approved production WABA** tied to Team Vision Financial operations.

| Finding | Detail |
|---------|--------|
| **Selected by Meta** | Disabled **Test** WABA (auto-selected during Cloud API onboarding) |
| **Expected for production** | Approved production WABA associated with **+1 786-752-8080** |
| **Production WABAs verified** | **Niovel Perez** WABA — **Approved** |
| | **Ana Perez** WABA — **Approved** |

The onboarding failure was **not** caused by portfolio restrictions or Atlas backend defects. It was caused by Meta routing Cloud API setup through the **wrong (disabled test) WABA**.

**Corrective action:** Before retrying Cloud API onboarding, **manually confirm which WABA Meta has selected** and switch to an **Approved** production WABA (not the disabled Test account).

### Classification

| Layer | Status |
|-------|--------|
| **Team Vision Financial Business Portfolio** | ✅ Operational and accessible — Business Home loads normally; Team Vision Financial profile and ad account visible (2026-07-21) |
| **Production WABAs (Niovel Perez, Ana Perez)** | ✅ **Approved** — verified in Business Settings (2026-07-21) |
| **Test WABA (auto-selected by Meta)** | ❌ **Disabled** — incorrectly selected during Cloud API onboarding |
| **Atlas backend / Railway / webhook code** | ✅ Not the root cause |

### Business Portfolio verification (2026-07-21)

The **Team Vision Financial Business Portfolio** was reviewed in Meta Business Suite:

| Check | Result |
|-------|--------|
| Advertising restrictions | None observed |
| Open support cases | None |
| Business assets (Pages, ad accounts, portfolio health) | Appear healthy |
| Business Portfolio–level policy holds | None identified |

**Conclusion:** The Cloud API onboarding failure is **not explained by a portfolio-wide Meta restriction**. Focus troubleshooting on the **specific WhatsApp Business Account (WABA)** tied to **+1 786-752-8080**, not on Business Verification or portfolio-level advertising status.

### Business Home accessibility (2026-07-21)

Confirmed the **Business Portfolio is operational and accessible**:

| Check | Result |
|-------|--------|
| Meta Business Home | Loads normally |
| Team Vision Financial business profile | Visible |
| Ad account | Accessible from Business Home |
| Portfolio login / access | No access errors observed |

This reinforces that the issue is **isolated to WhatsApp configuration (WABA)**, not the Business Portfolio or core advertising infrastructure.

### Next diagnostic step

Inspect **Business Settings** (not Business Home alone):

1. Open [Meta Business Suite](https://business.facebook.com/) → **Business settings**
2. Navigate to **Accounts** → **WhatsApp accounts**
3. Verify **WABA assets** — account name, phone number **786-752-8080**, connection status
4. Verify **permissions** — Atlas Meta app access, admin roles, and whether the WABA is shared with the correct portfolio users
5. Note any restriction banners, quality rating, or messaging limits **on the WABA record**

Until this WABA inspection is complete, do not treat portfolio health as proof that WhatsApp Cloud API setup can proceed.

### Approved production WABAs (2026-07-21)

Verified in **Business settings → Accounts → WhatsApp accounts**:

| WABA name | Status |
|-----------|--------|
| **Niovel Perez** | Approved |
| **Ana Perez** | Approved |

These approved accounts are eligible for production Cloud API connection. Do **not** proceed with onboarding while Meta has the **disabled Test WABA** selected.

**Do not:**

- Re-submit Business Verification solely because of this WABA error (portfolio already appears healthy)
- Assume Facebook/Instagram ad delivery is blocked (portfolio advertising restrictions were not found)
- Redeploy Atlas or change Railway env vars expecting a portfolio-level fix
- **Delete unused WhatsApp Business Accounts during migration** — see [WABA migration policy](#waba-migration-policy-do-not-delete-during-migration)

**Do:**

- **Before Cloud API onboarding:** Confirm Meta has selected an **Approved production WABA** — not a disabled Test account (see [Deployment checklist](#deployment-checklist-before-cloud-api-onboarding))
- Open **Business settings → Accounts → WhatsApp accounts** and inspect the **individual WABA** Meta will bind to the Atlas app
- Select **Niovel Perez** or **Ana Perez** (Approved) or the WABA tied to **786-752-8080** — not the disabled Test WABA
- Confirm the WABA is linked to the correct Business Portfolio and Atlas Meta app
- Contact Meta Support referencing the **WABA ID** if Meta continues to auto-select the disabled Test account

### Impact on MVP launch

Until Cloud API onboarding completes with the **correct Approved production WABA**:

- Meta may block setup while a **disabled Test WABA** remains selected
- A Meta **test number** may not be claimable in the developer console
- Production messaging may rely on previously configured env tokens (`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`) or an existing Embedded Signup connection
- The **live end-to-end smoke test** (Ad → WhatsApp **786-752-8080** → Atlas → Calendar) cannot be accepted as complete until the production WABA is connected

---

## Deployment checklist (before Cloud API onboarding)

Complete **before** starting Meta WhatsApp Cloud API initialization or Embedded Signup for production:

- [ ] **Business Portfolio healthy** — Business Home loads; Team Vision Financial profile and ad account accessible
- [ ] **List all WABAs** — Business settings → Accounts → WhatsApp accounts
- [ ] **Complete WABA inventory** — ownership, linked apps, phone numbers, production usage (see [migration policy](#waba-migration-policy-do-not-delete-during-migration))
- [ ] **Do not delete unused WABAs** during migration
- [ ] **Verify WABA selected by Meta** — confirm Meta is **not** using a disabled **Test** WABA
- [ ] **Confirm target WABA status is Approved** — use **Niovel Perez**, **Ana Perez**, or the WABA for **786-752-8080**
- [ ] **Reject / switch away from Test WABA** if Meta auto-selects a disabled test account
- [ ] **Atlas Meta app has access** to the chosen production WABA
- [ ] **Record WABA ID and phone_number_id** before proceeding (for Railway env and webhook config)
- [ ] **`GET /health/production`** returns `mvp_ready: true` on Atlas (backend ready independently of Meta UI selection)

> **Rule:** **Explicitly verify the WABA Meta selects before beginning Cloud API onboarding.** A disabled Test WABA will fail even when production WABAs are Approved.

---

## WABA migration policy (do not delete during migration)

During Sprint **11.4** production migration to Atlas, **do not delete unused WhatsApp Business Accounts (WABAs)** until Atlas is fully operational in the new production environment.

### Why

Removing WABAs mid-migration can break:

- Embedded Signup or Cloud API bindings still pointing at the deleted account
- Webhook subscriptions and `phone_number_id` references on Railway
- Atlas Meta app permissions and token exchange
- Phone number **786-752-8080** routing if ownership links are unclear
- Rollback paths if the new production WABA connection fails

An unused or disabled WABA may still be a **dependency** Meta or Atlas references during migration — especially the **Test WABA** that was auto-selected incorrectly.

### Step 1 — Inventory all WABAs (required before any cleanup)

In **Business settings → Accounts → WhatsApp accounts**, record every WABA:

| Field | What to capture |
|-------|-----------------|
| **WABA name** | e.g. Niovel Perez, Ana Perez, Test account |
| **WABA ID** | Meta account identifier |
| **Status** | Approved, Disabled, Test, Restricted, etc. |
| **Ownership** | Business Portfolio, assigned users, admin roles |
| **Linked Meta apps** | Atlas app and any other apps with WABA access |
| **Phone numbers** | Display number, **786-752-8080**, test numbers |
| **Production usage** | Active ads Click-to-WhatsApp, live customer messaging, Atlas webhook traffic |
| **Atlas binding** | Selected in Developer Console API Setup? Stored in Embedded Signup? |

Maintain this inventory in the resolution log or an internal runbook until migration is complete.

### Step 2 — Select production WABA (do not delete others yet)

1. Choose the **Approved** production WABA for Atlas (**Niovel Perez**, **Ana Perez**, or **786-752-8080** account).
2. Switch Meta Developer Console and Embedded Signup to that WABA.
3. Leave **all other WABAs in place** until Step 4 is complete — including disabled Test accounts.

### Step 3 — Run Atlas in new production environment

Complete before any WABA deletion:

- [ ] Correct Approved WABA connected with valid `phone_number_id`
- [ ] Railway webhook and credentials configured for that WABA
- [ ] `GET /health/production` → `mvp_ready: true`
- [ ] **Live end-to-end smoke test passed** — WhatsApp **786-752-8080** → Atlas reply → qualification → calendar booking
- [ ] Embedded Signup (if used) stores token for the **production** WABA, not the Test WABA

### Step 4 — Cleanup (only after Atlas is stable)

**Only after** Atlas is successfully running in the new production environment:

1. Re-review the WABA inventory — confirm no app, webhook, ad, or token still references a WABA marked for removal.
2. Archive inventory notes (WABA ID, deletion date, reason).
3. Delete or disable **unused** WABAs one at a time, starting with clearly orphaned Test accounts — **never** the active production WABA.
4. Re-run smoke test after each removal to confirm no regression.

> **Rule:** **Inventory first. Migrate second. Clean up last.** Deleting WABAs during migration risks removing dependencies Atlas or Meta still requires.

---

## Prerequisites before continuing Cloud API setup

Complete these **in Meta** before retrying Cloud API initialization or claiming a test number:

1. **Confirm Business Portfolio health** (verified for Team Vision Financial — see above).
2. **Verify which WABA Meta will use** — must be an **Approved** production account (**Niovel Perez**, **Ana Perez**, or **786-752-8080** WABA), **not** the disabled Test WABA.
3. **Verify WABA status** in [Meta Business Suite](https://business.facebook.com/) → **Business settings** → **Accounts** → **WhatsApp accounts**.
4. In [Meta for Developers](https://developers.facebook.com/) → Atlas app → **WhatsApp** → **API Setup**, confirm the **Approved** WABA is selected and shows a valid `phone_number_id`.
5. Only after the **correct Approved WABA** is selected, retry **Cloud API setup** or production number connection.

> **Rule:** **WABA selection must be verified before continuing Cloud API setup.** Approved production WABAs exist; onboarding fails when Meta auto-selects a disabled Test account.

---

## Troubleshooting

### Symptom: Onboarding stops with “WhatsApp Business Account restriction”

**First:** Confirm whether the restriction is portfolio-wide or WABA-only.

| Scope | Where to look | Team Vision status (2026-07-21) |
|-------|---------------|----------------------------------|
| **Business Portfolio** | Business Suite → Business settings → Business info / Account quality | ✅ Operational — Business Home loads; TVF profile and ad account accessible |
| **WABA only** | Business settings → Accounts → **WhatsApp accounts** → select the WABA | ⚠️ Verify Meta did **not** auto-select disabled **Test** WABA; use **Approved** production WABA |

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

This matches the Sprint 11.4 root cause for Team Vision Financial:

1. Portfolio-level checks pass (Business Home, ad account, no portfolio restrictions).
2. Production WABAs **Niovel Perez** and **Ana Perez** are **Approved**.
3. Meta Cloud API onboarding still fails because Meta **auto-selected a disabled Test WABA**.
4. **Fix:** Switch WABA selection to an **Approved** production account before retrying Cloud API setup — do not assume the Test account is correct.

### Symptom: Meta auto-selected wrong WABA

1. Open Business settings → Accounts → WhatsApp accounts — list all WABAs and note **Approved** vs **Test** / **Disabled**.
2. In Developer Console → WhatsApp → API Setup, check which WABA is currently bound to the Atlas app.
3. If a **disabled Test WABA** is selected, switch to **Niovel Perez**, **Ana Perez**, or the **786-752-8080** production WABA.
4. Re-run Cloud API onboarding only after the Approved WABA is selected.
5. Record the WABA ID and `phone_number_id` for Railway configuration.

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

## Atlas production checklist (after correct WABA selected)

- [ ] **WABA inventory complete** — do not delete unused WABAs until live smoke test passes (see [migration policy](#waba-migration-policy-do-not-delete-during-migration))
- [ ] **Approved production WABA selected** — not disabled Test WABA (Niovel Perez, Ana Perez, or 786-752-8080 WABA)
- [ ] WABA status **Approved** in Business Settings
- [ ] Cloud API setup completed with valid `phone_number_id` for production number **786-752-8080**
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
| 2026-07-21 | Confirmed **Business Home** operational — Team Vision Financial profile and ad account load normally; **next step:** Business Settings → WhatsApp accounts (WABA assets and permissions) |
| 2026-07-21 | **Root cause refined:** Meta auto-selected **disabled Test WABA** instead of approved production WABA; **Niovel Perez** and **Ana Perez** WABAs verified **Approved**; deployment checklist must verify WABA selection before Cloud API onboarding |
| 2026-07-21 | **WABA migration policy:** Do not delete unused WABAs during migration; inventory all WABAs (ownership, linked apps, phone numbers, production usage); cleanup only after Atlas is stable in new production environment |

---

## One-line summary

> **Root cause: Meta auto-selected a disabled Test WABA during Cloud API onboarding. Production WABAs (Niovel Perez, Ana Perez) are Approved — verify and select the correct WABA before retrying Cloud API setup for 786-752-8080.**
