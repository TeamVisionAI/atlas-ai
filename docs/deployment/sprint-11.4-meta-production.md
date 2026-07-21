# Sprint 11.4 — Meta WhatsApp Cloud API Production Setup

## Document control

| Field | Value |
|-------|-------|
| **Document ID** | DOC-0701 |
| **Title** | Sprint 11.4 Meta WhatsApp Cloud API Production |
| **Version** | 1.7 |
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
| **Production WABAs verified** | **Niovel Perez** WABA — **Approved** → **+1 786-752-8080** |
| | **Ana Perez** WABA — **Approved** → **+1 786-296-7254** |
| **Meta-generated Test WABA** | **Disabled** — do not use for Cloud API onboarding |

The onboarding failure was **not** caused by portfolio restrictions or Atlas backend defects. It was caused by Meta routing Cloud API setup through the **wrong (disabled test) WABA**.

**Corrective action:** Associate the **existing Atlas Developer App** with an **Approved production WABA** via **WhatsApp → API Setup** in [Meta for Developers](https://developers.facebook.com/). **No new Developer App is required.** Do not accept Meta's auto-created Test WABA — explicitly select **Niovel Perez** (**786-752-8080**) for MVP.

---

## Major discovery — associate existing WABA via API Setup (Meta confirmed 2026-07-21)

Meta confirmed the supported path to production WhatsApp Cloud API messaging:

| Finding | Detail |
|---------|--------|
| **New Developer App required?** | **No** — use the **existing Atlas Developer App** |
| **Where to configure** | [Meta for Developers](https://developers.facebook.com/) → Atlas app → **WhatsApp** → **API Setup** |
| **What to do** | Associate an **existing Approved production WABA** with the app (e.g. **Niovel Perez** / **786-752-8080**) |
| **What to avoid** | Meta's **automatically created Test WABA** — disabled and not eligible for production onboarding |

**Deployment workflow priority:** Select the **correct Approved production WABA** in API Setup **before** completing Cloud API configuration. WABA selection is the critical step — not creating a new app or accepting Meta's default Test account.

### Confirmed procedure (Atlas MVP)

1. Open [Meta for Developers](https://developers.facebook.com/) → **existing Atlas app** (do not create a new app).
2. Navigate to **WhatsApp** → **API Setup**.
3. **Select** the Approved production WABA — **Niovel Perez** (**+1 786-752-8080**) for MVP (or **Ana Perez** / **786-296-7254** if explicitly chosen).
4. **Reject / do not use** the Meta-generated **disabled Test WABA** if Meta offers or auto-selects it.
5. Complete API Setup; record **WABA ID** and **`phone_number_id`** for Railway env and webhook config.
6. Verify webhook URL, `VERIFY_TOKEN`, and (recommended) `META_APP_SECRET` on Railway.
7. Run live smoke test: personal phone → **786-752-8080** → Atlas reply → qualification → calendar booking.

> **Rule:** **Reuse the existing Developer App. Select the Approved WABA in WhatsApp → API Setup. Do not create a new app or use the auto-created Test WABA.**

---

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

### WABA inventory (completed 2026-07-21)

Inventory completed in **Business settings → Accounts → WhatsApp accounts**. All WhatsApp Business App accounts in the Team Vision Financial portfolio:

| WABA name | Phone number | Status | Use for Atlas production |
|-----------|--------------|--------|--------------------------|
| **Niovel Perez** | **+1 786-752-8080** | **Approved** | ✅ **Primary MVP target** — ad → WhatsApp → Atlas pipeline |
| **Ana Perez** | **+1 786-296-7254** | **Approved** | ✅ Approved production account — select explicitly if used |
| **Meta-generated Test WABA** | (test / none) | **Disabled** | ❌ **Do not use** — not eligible for Cloud API onboarding |

**Deployment rule:** Future Cloud API onboarding, Embedded Signup, and webhook configuration must **explicitly select the intended production WABA** (typically **Niovel Perez** / **786-752-8080** for MVP). **Do not rely on Meta's automatic WABA selection** — Meta previously auto-selected the disabled Test WABA and blocked onboarding.

These approved production accounts are eligible for Cloud API connection. Do **not** proceed with onboarding while Meta has the **disabled Test WABA** selected.

**Do not:**

- Re-submit Business Verification solely because of this WABA error (portfolio already appears healthy)
- Assume Facebook/Instagram ad delivery is blocked (portfolio advertising restrictions were not found)
- **Use Meta's automatically created Test WABA** — select an **Approved production WABA** in **WhatsApp → API Setup** instead
- Redeploy Atlas or change Railway env vars expecting a portfolio-level fix
- **Delete unused WhatsApp Business Accounts during migration** — see [WABA migration policy](#waba-migration-policy-do-not-delete-during-migration)
- **Change Developer App / WABA bindings without consulting Meta AI first** — see [pre-change gate](#pre-change-gate-consult-meta-ai-before-waba-reassignment)

**Do:**

- **Associate existing Approved WABA** via [Meta for Developers](https://developers.facebook.com/) → Atlas app → **WhatsApp** → **API Setup** — no new app required (see [major discovery](#major-discovery--associate-existing-waba-via-api-setup-meta-confirmed-2026-07-21))
- **Before Cloud API onboarding:** Confirm Meta has selected an **Approved production WABA** — not a disabled Test account (see [Deployment checklist](#deployment-checklist-before-cloud-api-onboarding))
- Open **Business settings → Accounts → WhatsApp accounts** and inspect the **individual WABA** Meta will bind to the Atlas app
- Select **Niovel Perez** (**786-752-8080**) for MVP production — or **Ana Perez** (**786-296-7254**) if explicitly chosen — **not** the disabled Meta-generated Test WABA
- Confirm the WABA is linked to the correct Business Portfolio and Atlas Meta app
- Contact Meta Support referencing the **WABA ID** if Meta continues to auto-select the disabled Test account
- **Before any WABA reassignment:** Consult Meta AI with a precise engineering question, record guidance, and compare with official Meta documentation — see [pre-change gate](#pre-change-gate-consult-meta-ai-before-waba-reassignment)

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
- [x] **List all WABAs** — Business settings → Accounts → WhatsApp accounts
- [x] **Complete WABA inventory** — ownership, linked apps, phone numbers, production usage (see [completed inventory](#waba-inventory-completed-2026-07-21))
- [ ] **Do not delete unused WABAs** during migration
- [x] **Consult Meta AI** — WABA reassignment procedure confirmed (see [pre-change gate](#pre-change-gate-consult-meta-ai-before-waba-reassignment))
- [x] **Record Meta AI guidance** — existing Approved WABA associable via **WhatsApp → API Setup**; no new Developer App required
- [ ] **Associate Approved WABA in API Setup** — existing Atlas app → **WhatsApp** → **API Setup** → select **Niovel Perez** (**786-752-8080**); reject Test WABA
- [ ] **Explicitly select intended production WABA** — do not rely on Meta auto-selection
- [ ] **Verify WABA selected by Meta** — confirm Meta is **not** using the disabled **Meta-generated Test WABA**
- [ ] **Confirm target WABA status is Approved** — **Niovel Perez** (**786-752-8080**) for MVP, or **Ana Perez** (**786-296-7254**) if explicitly chosen
- [ ] **Reject / switch away from Test WABA** if Meta auto-selects a disabled test account
- [ ] **Atlas Meta app has access** to the chosen production WABA
- [ ] **Record WABA ID and phone_number_id** before proceeding (for Railway env and webhook config)
- [ ] **`GET /health/production`** returns `mvp_ready: true` on Atlas (backend ready independently of Meta UI selection)

> **Rule:** **Reuse the existing Developer App. In WhatsApp → API Setup, explicitly select the Approved production WABA — do not use Meta's auto-created Test WABA.**

---

## Pre-change gate: consult Meta AI before WABA reassignment ✅ guidance received 2026-07-21

**Before making any Meta configuration changes** — especially reassigning the Atlas **Developer App** from the disabled **Meta-generated Test WABA** to an **Approved production WABA** (**Niovel Perez** / **786-752-8080** or **Ana Perez** / **786-296-7254**) — complete this gate. **Do not implement WABA or app binding changes until all three steps are done.**

### Step 1 — Ask Meta AI (precise engineering question)

Use Meta AI in [Meta Business Suite](https://business.facebook.com/) or [Meta for Developers](https://developers.facebook.com/) with a **specific, context-complete** question. Avoid vague prompts.

**Suggested question (copy and adapt with real IDs):**

> Our Meta Developer App (Atlas) is currently associated with a **disabled Meta-generated Test WhatsApp Business Account (WABA)** after Cloud API onboarding auto-selected the wrong account. We have two **Approved** production WABAs in the same Business Portfolio: **Niovel Perez** (+1 786-752-8080) and **Ana Perez** (+1 786-296-7254).  
>  
> What is the **correct, supported procedure** to reassign our Developer App from the disabled Test WABA to **Niovel Perez** (786-752-8080) for WhatsApp Cloud API production messaging — including whether we should use Developer Console API Setup, Business Settings app permissions, Embedded Signup, or WABA subscription APIs?  
>  
> Please specify: required UI paths, whether the Test WABA binding must be removed first, impact on existing webhook subscriptions and `phone_number_id`, and any restrictions when the source WABA is **disabled**.

Include in the prompt when available: Atlas **App ID**, disabled **Test WABA ID**, target **Niovel Perez WABA ID**, and Business Portfolio name (**Team Vision Financial**).

### Step 2 — Record Meta AI guidance

Capture the full response in the table below (or linked runbook). Note date, channel, and any caveats Meta AI gives about verifying against official docs.

| Field | Record here |
|-------|-------------|
| **Date consulted** | 2026-07-21 |
| **Consulted by** | Team Vision Financial / Atlas ops |
| **Meta AI channel** | Meta AI (Business Suite / Developers) |
| **Question asked** | How to reassign existing Atlas Developer App from disabled Test WABA to Approved production WABA (**Niovel Perez** / **786-752-8080**) |
| **Meta AI response summary** | An **existing Approved WABA** can be associated with the **existing Developer App** through **WhatsApp → API Setup**. **No new Meta Developer App is required.** Select the correct Approved WABA explicitly — do not use the automatically created Test WABA. |
| **WABA IDs referenced** | Target: **Niovel Perez** (**786-752-8080**); avoid: Meta-generated **Test WABA** (disabled) |
| **Risks / warnings cited** | Using wrong WABA blocks Cloud API onboarding; verify `phone_number_id` after association |
| **Meta AI disclaimer** | Verify against official Meta documentation before implementing |

### Step 3 — Compare with official Meta documentation

Cross-check Meta AI guidance against **official Meta docs** before any change. Meta AI output is advisory; **official documentation and Developer Console behavior are authoritative.**

| Topic | Official reference | Meta AI said | Official docs say | Match? |
|-------|-------------------|--------------|-------------------|--------|
| WABA / app association | [WhatsApp Business Management API](https://developers.facebook.com/docs/whatsapp/business-management-api) | Associate existing Approved WABA with existing app via **API Setup** | Apps connect to WABAs through Developer Console configuration | ✅ Aligned |
| Cloud API setup | [Get Started — Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api/get-started) | Use **WhatsApp → API Setup** on existing app; select production WABA | API Setup is the supported onboarding path in Developer Console | ✅ Aligned |
| Embedded Signup | [Embedded Signup](https://developers.facebook.com/docs/whatsapp/embedded-signup) | Alternative path; API Setup sufficient for manual WABA association | Embedded Signup for customer-facing onboarding flows | ✅ Compatible |
| Webhooks | [Webhooks — Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks) | Configure after WABA associated; update `phone_number_id` on Railway | Webhooks configured per app after WABA connection | ✅ Aligned |
| App permissions on WABA | Business Settings → Accounts → WhatsApp accounts → app access | Ensure Atlas app has access to selected production WABA | App must be granted WABA access in Business Settings | ✅ Aligned |

**Implementation rule:**

- If Meta AI and official docs **agree** → proceed using the documented procedure; record WABA ID and `phone_number_id` changes in the resolution log.
- If they **conflict** → do **not** implement; escalate to Meta Support with both sources cited, or open a support case referencing the disabled Test WABA ID.
- If official docs are **silent** on a step Meta AI suggested → treat as unverified; confirm in Developer Console UI or with Meta Support before proceeding.

> **Rule:** **Consult Meta AI → record guidance → verify against official Meta documentation → then implement.** Skipping this gate risks binding the Atlas app to the wrong WABA again or breaking webhooks mid-migration.

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

### Step 1 — Inventory all WABAs ✅ completed 2026-07-21

Inventory recorded in [WABA inventory (completed)](#waba-inventory-completed-2026-07-21). For any future WABA changes, re-run in **Business settings → Accounts → WhatsApp accounts** and capture:

| Field | What to capture |
|-------|-----------------|
| **WABA name** | e.g. Niovel Perez, Ana Perez, Test account |
| **WABA ID** | Meta account identifier |
| **Status** | Approved, Disabled, Test, Restricted, etc. |
| **Ownership** | Business Portfolio, assigned users, admin roles |
| **Linked Meta apps** | Atlas app and any other apps with WABA access |
| **Phone numbers** | **786-752-8080** (Niovel Perez), **786-296-7254** (Ana Perez), test numbers |
| **Production usage** | Active ads Click-to-WhatsApp, live customer messaging, Atlas webhook traffic |
| **Atlas binding** | Selected in Developer Console API Setup? Stored in Embedded Signup? |

Maintain this inventory in the resolution log or an internal runbook until migration is complete.

### Step 2 — Select production WABA via API Setup (do not delete others yet)

1. Choose the **Approved** production WABA for Atlas — **Niovel Perez** (**786-752-8080**) for MVP, or **Ana Perez** (**786-296-7254**) if explicitly selected.
2. In [Meta for Developers](https://developers.facebook.com/) → **existing Atlas app** → **WhatsApp** → **API Setup**, **manually select** that WABA — do not accept Meta's default Test WABA. **No new Developer App is required.**
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

0. **Pre-change gate:** Meta AI guidance received and aligned with official docs — see [pre-change gate](#pre-change-gate-consult-meta-ai-before-waba-reassignment). **Proceed via API Setup on existing app.**
1. **Confirm Business Portfolio health** (verified for Team Vision Financial — see above).
2. Open [Meta for Developers](https://developers.facebook.com/) → **existing Atlas app** → **WhatsApp** → **API Setup** — **do not create a new app**.
3. **Explicitly select** an **Approved** production WABA — **Niovel Perez** (**786-752-8080**) for MVP, or **Ana Perez** (**786-296-7254**) — **not** the disabled Meta-generated Test WABA.
4. **Verify WABA status** in [Meta Business Suite](https://business.facebook.com/) → **Business settings** → **Accounts** → **WhatsApp accounts**.
5. Confirm the selected Approved WABA shows a valid **`phone_number_id`** in API Setup.
6. Record **WABA ID** and **`phone_number_id`** for Railway; complete webhook and credential configuration.
7. Only after the **correct Approved WABA** is associated, verify outbound send and run the live smoke test.

> **Rule:** **Reuse existing Developer App. Select Approved WABA in WhatsApp → API Setup. WABA selection is the deployment priority — not app creation or Test WABA acceptance.**

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
4. **Fix:** In **WhatsApp → API Setup** on the **existing Atlas app**, select an **Approved** production WABA — do not create a new app or accept the Test WABA.

### Symptom: Meta auto-selected wrong WABA

**Before switching WABAs:** Meta AI confirmed use **WhatsApp → API Setup** on the existing app — see [major discovery](#major-discovery--associate-existing-waba-via-api-setup-meta-confirmed-2026-07-21).

1. Open Business settings → Accounts → WhatsApp accounts — list all WABAs and note **Approved** vs **Test** / **Disabled**.
2. In Developer Console → **WhatsApp → API Setup** (existing Atlas app — no new app), check which WABA is currently bound.
3. If the **disabled Meta-generated Test WABA** is selected, switch to **Niovel Perez** (**786-752-8080**) or **Ana Perez** (**786-296-7254**).
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
- [ ] **Associate Approved WABA** — existing Atlas app → **WhatsApp → API Setup** → **Niovel Perez** (**786-752-8080**); no new Developer App
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
| 2026-07-21 | **WABA migration policy:** Do not delete unused WABAs during migration; inventory first, cleanup only after Atlas is stable in new production environment |
| 2026-07-21 | **WABA inventory completed:** **Niovel Perez** → **786-752-8080** (Approved); **Ana Perez** → **786-296-7254** (Approved); Meta-generated **Test WABA** disabled — do not use; deployment must explicitly select production WABA, not rely on Meta auto-selection |
| 2026-07-21 | **Pre-change gate documented:** Before WABA reassignment, consult Meta AI with precise engineering question; record guidance; compare with official Meta documentation before implementing any Developer App / WABA binding changes |
| 2026-07-21 | **Major discovery (Meta confirmed):** Existing **Approved WABA** can be associated with **existing Atlas Developer App** via **WhatsApp → API Setup** — **no new app required**; deployment workflow must prioritize selecting correct Approved WABA over Meta's auto-created Test WABA |

---

## One-line summary

> **Major discovery: Existing Approved WABA associates with existing Developer App via WhatsApp → API Setup — no new app. Select Niovel Perez (786-752-8080) explicitly; do not use Meta's auto-created Test WABA.**
