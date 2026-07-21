# Sprint 11.4 — Meta WhatsApp Cloud API Production Setup

## Document control

| Field | Value |
|-------|-------|
| **Document ID** | DOC-0701 |
| **Title** | Sprint 11.4 Meta WhatsApp Cloud API Production |
| **Version** | 2.7 |
| **Status** | Approved (final production decision) |
| **Owner** | Atlas Development Team |
| **Last Updated** | 2026-07-21 |
| **Related Sprint** | 11.4 |
| **Related Release** | Release-11.4 |

---

## Purpose

Record Sprint **11.4** production Meta WhatsApp Cloud API setup status, distinguish Atlas backend readiness from Meta account restrictions, and provide troubleshooting steps before continuing Cloud API onboarding.

**Final decision (2026-07-21):** **Proceed** with Cloud API migration on **Niovel Perez WABA** — **786-752-8080** is the dedicated Atlas AI production number. Chat history preservation **not required**. **786-296-7254** (Ana Perez) remains independent.

---

## Related documents

| Document | Description |
|----------|-------------|
| [Sprint-11.4.md](../05-sprints/Sprint-11.4.md) | Sprint 11.4 specification and phase status |
| [WHATSAPP_EMBEDDED_SIGNUP.md](../WHATSAPP_EMBEDDED_SIGNUP.md) | Embedded Signup flow and env vars |
| [SPRINT_11_1_LIVE_WHATSAPP.md](../SPRINT_11_1_LIVE_WHATSAPP.md) | Live webhook inbound/outbound pipeline |
| [Current_System_State.md](../00-executive/Current_System_State.md) | Production system state |
| [Meta_Approval_Portfolio.md](../04-meta/Meta_Approval_Portfolio.md) | Meta Business Verification materials |
| [whatsapp-cloud-api-migration-checklist.md](./whatsapp-cloud-api-migration-checklist.md) | Step-by-step Cloud API migration checklist (DOC-0702) |

---

## Sprint 11.4 production context

Sprint 11.4 Phase A delivered the Atlas production pipeline:

```
Meta Webhook → whatsappInboundPipeline → Communication Hub
  → Conversation Engine → whatsappOutboundPipeline → WhatsApp Cloud API
```

Atlas backend, Railway deployment, and readiness checks (`GET /health/production`) can report **`mvp_ready: true`** while Meta account-level setup is still incomplete. **Do not assume Meta onboarding succeeded because Atlas code is deployed.**

---

## Meta Developer Console — Use Cases UI (2026-07-21)

Meta has introduced a new **Use cases** Developer UI. **WhatsApp Cloud API configuration is no longer exposed as a standalone WhatsApp product** in the app navigation sidebar.

| UI era | How to reach WhatsApp Cloud API setup | Status |
|--------|----------------------------------------|--------|
| **Legacy** | App → **WhatsApp** (standalone product) → **API Setup** | ❌ **Deprecated** — menu may be absent |
| **Current (Use cases)** | App → **Use cases** → WhatsApp use case → **Step 2: Production setup** | ✅ **Use for Atlas production** |

### Testing vs production — two-step Use Cases flow

The Use Cases WhatsApp interface **separates testing from production**. Do **not** expect WABA selection in the testing step.

| Step | Label (typical) | Purpose | WABA selection? | Atlas use |
|------|-----------------|---------|-----------------|-----------|
| **Step 1** | **Testing** (or similar) | Meta **automatically generated test environment** — sandbox messaging, test credentials | ❌ **No** — WABA picker **not exposed** | Optional dev smoke tests only — **not** Atlas production |
| **Step 2** | **Production setup** (or similar) | Connect **existing Approved production WABA** and production phone number | ✅ **Expected** — select **Niovel Perez** / **786-752-8080** | ✅ **Atlas production migration path** |

**Investigation finding (2026-07-21):** Step 1 is dedicated to Meta's auto-generated test environment and does **not** expose WABA selection. This explains prior onboarding attempts that stopped in Step 1 without access to **Niovel Perez** or **786-752-8080**. **Step 2 (Production setup)** is the **expected location** to choose an existing Approved WABA and migrate the production phone number.

> **Rule:** **Do not configure Atlas production in Step 1 (Testing). Proceed to Step 2 (Production setup) for WABA and 786-752-8080 migration.**

### Atlas navigation path (current UI)

1. Open [Meta for Developers](https://developers.facebook.com/) → **existing Atlas app** (do not create a new app).
2. Go to **Use cases** on the app dashboard — **not** the legacy standalone **WhatsApp** product menu.
3. Select or add a WhatsApp-related use case (labels vary; e.g. **Connect with customers through WhatsApp**, **WhatsApp Business Platform**, or similar messaging use case).
4. **Skip or defer Step 1 (Testing)** for production migration — it uses Meta's auto test environment with **no WABA selection**.
5. Open **Step 2 (Production setup)**:
   - **Select Niovel Perez WABA** and production number **786-752-8080**
   - Reject Meta's auto-created **Test WABA** if offered
   - Record **Phone Number ID**, **WABA ID**, and access token
   - Configure **webhooks** (callback URL, verify token, field subscriptions)

> **Rule:** **All Sprint 11.4 production steps target Step 2 (Production setup). Step 1 (Testing) is not the WABA selection path.**

### Step 2 — Production Setup workflow (reached 2026-07-21)

Atlas ops reached Meta's **Production Setup** page inside **Step 2 (Production setup)**.

#### Current status (Production Setup — wabaID error 2026-07-21)

| Field | Status |
|-------|--------|
| **Production phone registration** | ❌ **Failed** — before SMS verification |
| **Meta error** | **`Unexpected null value for wabaID`** (internal Meta UI error) |
| **Root cause (refined)** | **Meta backend failure** resolving WABA during production phone registration (`wabaID = null`) — **not** wrong Business Portfolio or missing app asset assignment |
| **Business Portfolio verified** | ✅ Atlas Developer App and Approved WABAs share portfolio **`367219934273986`** (Team Vision Financial) |
| **App–portfolio link verified** | ✅ Atlas AI app linked to portfolio with **administrator access** |
| **App asset assignment ruled out** | ✅ **Connect assets** dialog exposes **Ad Accounts only** — no WABA assignment option |
| **SMS verification reached?** | ❌ **No** — error occurred **before** verification code step |
| **Phone migration complete?** | ❌ **No** — **786-752-8080** not migrated to Cloud API via this app |
| **Atlas backend involved?** | ❌ **No** — failure is **Meta-side**, not Atlas or the phone number |
| **Wrong Business Portfolio?** | ❌ **Ruled out** — app and WABAs share portfolio **`367219934273986`** |
| **Next action** | Meta Support / retry after WABA explicit selection — portfolio alignment is confirmed |

> **Rule:** **`wabaID` null with correct portfolio = Meta backend failed to resolve WABA in registration flow — not Atlas env or Railway.**

#### Business Portfolio alignment verified (2026-07-21)

Verified the Atlas AI Developer App operates under the **same Business Portfolio** that owns the Approved production WABAs:

| Asset | Business Portfolio ID | Status |
|-------|----------------------|--------|
| **Atlas AI Developer App** | **`367219934273986`** | ✅ Verified |
| **Approved WABAs** (Niovel Perez, Ana Perez) | **`367219934273986`** (Team Vision Financial) | ✅ Same portfolio |

**Conclusion:** **Incorrect Business Portfolio selection is ruled out** as the root cause of the `wabaID = null` error. The Atlas app and target WABAs are in the same portfolio.

**Remaining evidence:** Meta **backend failure** resolving the WABA during production phone registration — the UI/API returned **`wabaID = null`** despite portfolio alignment and Approved WABA status.

#### App–portfolio link and Connect assets verified (2026-07-21)

Verified the **Atlas AI Developer App** is correctly linked to the **Team Vision Financial Business Portfolio** and holds **administrator access**:

| Check | Result |
|-------|--------|
| **App linked to portfolio** | ✅ Verified — Atlas AI app under portfolio **`367219934273986`** |
| **Administrator access** | ✅ Verified — app has administrator role on the Business Portfolio |
| **Connect assets dialog** | Business Settings → **Connect assets** — **Ad Accounts only** |
| **WABA assignment via Connect assets** | ❌ **Not available** — dialog does **not** expose WhatsApp Business Accounts |

**Conclusion:** **App asset assignment is ruled out** as the root cause of the `wabaID = null` registration failure. The Atlas app is correctly linked with admin access; Meta's **Connect assets** UI does not provide a path to assign WABAs to the Developer App. WABA binding for Cloud API is expected through **Use cases → Step 2 (Production setup)**, not Business Settings asset connection.

**Remaining evidence (unchanged):** Meta **backend failure** resolving the WABA during production phone registration (`wabaID = null`).

#### Incident: `Unexpected null value for wabaID` (2026-07-21)

During **Add phone number** for **786-752-8080** in Step 2 Production Setup, Meta returned an internal error **before SMS verification**:

| Finding | Detail |
|---------|--------|
| **Error message** | `Unexpected null value for wabaID` |
| **When** | Production Setup — after registration initiated, **before** verification code / SMS step |
| **Meaning** | Meta UI could not resolve the **target WABA** for phone registration — `wabaID` was **null** in Meta's internal flow |
| **Not caused by** | Atlas backend, Railway, webhook code, **786-752-8080** number validity, SMS delivery, **wrong Business Portfolio**, or **missing app–WABA asset assignment** |
| **Business Portfolio** | ✅ **Ruled out** — Atlas app and WABAs share **`367219934273986`** |
| **App asset assignment** | ✅ **Ruled out** — app linked with admin access; **Connect assets** exposes Ad Accounts only, not WABAs |
| **Classification (refined)** | **Meta backend failure** — WABA not resolved in production phone registration API (`wabaID = null`) |
| **Expected WABA** | **Niovel Perez** → **786-752-8080** (Approved) |

**Corrective action (Meta-side):**

1. Confirm **Niovel Perez WABA ID** in Business settings → Accounts → WhatsApp accounts.
2. In **Use cases → Step 2 (Production setup)**, verify WABA is **explicitly selected** before **Add phone number** — UI may have skipped WABA resolution (related to [Step 1 vs Step 2](#testing-vs-production--two-step-use-cases-flow) and disabled Test WABA auto-selection issues).
3. ~~Confirm Atlas Meta app has **permissions** on the Niovel Perez WABA in Business Settings.~~ **Ruled out (2026-07-21):** App has **administrator access** on portfolio; **Connect assets** does not expose WABA assignment — binding is via **Use cases → Step 2**, not Business Settings asset connection.
4. Retry **Add phone number** only after WABA shows as selected/bound in Step 2 UI — capture [confirmation screens](#confirmation-screen-log-deployment-record) on retry.
5. If error persists, contact Meta Support citing **`wabaID` null**, **Business Portfolio ID `367219934273986`**, Niovel Perez **WABA ID**, and Atlas **App ID** — portfolio misalignment is **ruled out**; request Meta backend WABA resolution fix.

**Do not:**

- Change Atlas `WHATSAPP_*` env vars expecting a fix (no `phone_number_id` exists yet)
- Redeploy Railway or rerun Atlas verification scripts as the primary fix
- Assume **786-752-8080** or the phone number format caused the error

#### Verification code pause gate (superseded by wabaID failure — retain for retry)

When registration reaches the verification code step on **retry**, apply this gate before entering SMS code:

1. **All migration warnings** shown by Meta are read and understood (e.g. number transfer, WhatsApp Business App impact, messaging downtime).
2. **All implications** are reviewed against [approved architecture](#production-architecture-approved-2026-07-21) and [final decision](#final-production-decision-approved-2026-07-21) (8080 = Atlas; 7254 independent; history not required).
3. **Every confirmation screen** is captured for the deployment record (see [confirmation screen log](#confirmation-screen-log-deployment-record) below).
4. WABA selection in the flow is confirmed as **Niovel Perez** — not Test WABA or Ana Perez.

> **Rule:** **Pause before verification code. Capture every confirmation screen. Then enter code.**

#### Confirmation screen log (deployment record)

Capture **every** confirmation, warning, and summary screen during **Add phone number** for **786-752-8080**. Store in secure ops vault or `docs/deployment/records/` (screenshots — **do not commit secrets or verification codes to git**).

| # | Screen / step | Warnings or confirmations shown | Screenshot captured | Date | Notes |
|---|---------------|--------------------------------|---------------------|------|-------|
| 1 | WABA selection | _record WABA chosen_ | ☐ | | Must show **Niovel Perez** |
| 2 | Phone number entry | **786-752-8080** entered | ☐ | | |
| 3 | Migration warning(s) | _paste or summarize Meta warnings_ | ☐ | | Review before proceeding |
| 4 | Confirmation / accept terms | _record user confirmations required_ | ☐ | | |
| 5 | Verification code prompt | _not reached — failed with wabaID null_ | ☐ | 2026-07-21 | Error before SMS step |
| 6 | Registration complete | `phone_number_id` visible | ☐ | | _blocked by wabaID error_ |

**Before starting Add phone number:** Complete WABA and migration option review — **document before submitting registration**.

#### WABA and migration review (complete before Add phone number)

| Field | Record before registering |
|-------|---------------------------|
| **Production phone currently on app** | ❌ **Not attached** — registration **failed** (`wabaID` null) before verification |
| **Readiness vs migration** | Registration **attempted** — **failed** at Meta WABA resolution; migration **not started** |
| **WABA options shown in Step 2** | e.g. Niovel Perez, Ana Perez, Test WABA — list all visible at **Add phone number** |
| **WABA selected / intended** | **Niovel Perez** → **786-752-8080** |
| **WABAs rejected** | Test WABA (disabled); Ana Perez (**786-296-7254** — out of scope) |
| **Migration options shown** | _document Meta UI choices in Add phone number flow before proceeding_ |
| **Migration option chosen** | _pending — record after review_ |
| **Chat history impact** | Not required to preserve (per [final decision](#final-production-decision-approved-2026-07-21)) |
| **Reviewed by / date** | _pending_ |
| **Approved to Add phone number** | ❌ **Failed** (2026-07-21) — `Unexpected null value for wabaID` |
| **Approved to enter verification code** | ☐ **N/A** — verification step **not reached** |

> **Rule:** **Review and document WABA selection and migration options before clicking Add phone number. Pause before verification code.**

---

### Documentation caveat — do not rely on legacy Meta UI docs

- **Avoid** older Meta documentation, tutorials, and screenshots that show a dedicated **WhatsApp** product entry in the Developer Console left navigation.
- **Still valid:** Official Meta **API** documentation ([Cloud API Get Started](https://developers.facebook.com/docs/whatsapp/cloud-api/get-started), [Webhooks](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks), [Business Management API](https://developers.facebook.com/docs/whatsapp/business-management-api)) — these describe **API behavior and credentials**, not the current console navigation.
- **Authoritative for navigation:** Live Meta Developer Console **Use cases** UI (Step 1 Testing vs **Step 2 Production setup**), Meta AI in the Developers portal, and this document (DOC-0701 v2.7).
- **Do not confuse Step 1 (Testing)** with production migration — Step 1 has no WABA picker; production WABA selection belongs in **Step 2**.
- If use-case labels differ in your account, consult Meta AI with the [pre-change gate](#pre-change-gate-consult-meta-ai-before-waba-reassignment) question and confirm against the live UI before changing production bindings.

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

**Corrective action:** In **Use cases → Step 2 (Production setup)**, associate the **Niovel Perez** Approved WABA and **786-752-8080** with the existing Atlas Developer App. **Do not use Step 1 (Testing)** for production WABA selection — it does not expose WABA picker. **No new Developer App is required.**

---

## Major discovery — associate existing WABA via API Setup (Meta confirmed 2026-07-21)

Meta confirmed the supported path to production WhatsApp Cloud API messaging:

| Finding | Detail |
|---------|--------|
| **New Developer App required?** | **No** — use the **existing Atlas Developer App** |
| **Where to configure** | Use cases → **Step 2: Production setup** (not Step 1 Testing) — see [Use Cases UI](#meta-developer-console--use-cases-ui-2026-07-21) |
| **What to do** | Associate an **existing Approved production WABA** with the app (e.g. **Niovel Perez** / **786-752-8080**) |
| **What to avoid** | Meta's **automatically created Test WABA** — disabled and not eligible for production onboarding |

**Deployment workflow priority:** Complete **Step 2 (Production setup)** and select **Niovel Perez / 786-752-8080** there. **Do not expect WABA selection in Step 1 (Testing)** — that step is Meta's auto-generated test environment only.

### Confirmed procedure (Atlas MVP)

1. Open [Meta for Developers](https://developers.facebook.com/) → **existing Atlas app** (do not create a new app).
2. Navigate to **Use cases** → WhatsApp use case ([current UI path](#meta-developer-console--use-cases-ui-2026-07-21)).
3. **Skip Step 1 (Testing)** for production — optional for sandbox only; **no WABA selection available**.
4. Open **Step 2 (Production setup)** — confirm **no production phone** is attached; completed tasks = **readiness only** ([current status](#current-status-production-setup-page-confirmed)).
5. Complete [WABA and migration review](#waba-and-migration-review-complete-before-add-phone-number) — document before proceeding.
6. Click **Add phone number** — select **Niovel Perez WABA** and **786-752-8080**; reject Test WABA and Ana Perez (**786-296-7254**).
7. Complete registration; record **WABA ID** and **`phone_number_id`** for Railway env and webhook config.
8. Verify webhook URL, `VERIFY_TOKEN`, and (recommended) `META_APP_SECRET` on Railway.
9. Run live smoke test: personal phone → **786-752-8080** → Atlas reply → qualification → calendar booking.

> **Rule:** **Readiness ≠ migration. Add phone number = start of migration. Document WABA review first.**

---

## Production architecture approved (2026-07-21)

Production architecture for Sprint **11.4** WhatsApp integration is **approved**. This defines which numbers Atlas owns and which remain untouched.

| Channel | WABA | Phone | Role | Atlas action |
|---------|------|-------|------|--------------|
| **Atlas AI production** | **Niovel Perez** | **+1 786-752-8080** | Atlas-owned communication channel | ✅ **Designated for Cloud API migration** — automation, AI conversations, interview scheduling, future integrations |
| **Business operations (protected)** | **Ana Perez** | **+1 786-296-7254** | Day-to-day manual WhatsApp operations | ❌ **Remain unchanged** — do not migrate, reconfigure, or bind to Atlas Developer App |
| **Meta-generated Test** | (Test WABA) | — | Invalid auto-selection | ❌ **Do not use** |

### Atlas ownership — 786-752-8080

**+1 786-752-8080** is the **Atlas AI production number**. After Cloud API migration, Atlas owns this channel for:

- **Automation** — inbound webhook processing and outbound replies via WhatsApp Cloud API
- **AI conversations** — Communication Hub → Conversation Engine qualification flows
- **Scheduling** — Google Calendar interview booking and confirmations
- **Future integrations** — ads (Click-to-WhatsApp), CRM, and additional channels via Communication Hub

All Sprint 11.4 Meta configuration, Railway credentials (`WHATSAPP_*`), webhooks, and smoke tests target **8080 only**.

### Protected channel — Ana Perez (786-296-7254)

**Ana Perez's WhatsApp Business App** and **786-296-7254** remain **unchanged** to protect ongoing day-to-day business operations. Do **not**:

- Associate the Ana Perez WABA with the Atlas Developer App
- Migrate **786-296-7254** to WhatsApp Cloud API for Atlas
- Route Atlas webhooks, tokens, or automation to the Ana Perez WABA
- Modify Ana Perez WABA settings during Sprint 11.4 migration

If operational needs change, require explicit architecture approval before any change to the Ana Perez channel.

> **Rule:** **8080 = Atlas. 7254 = protected business ops. Migrate only the Niovel Perez WABA to Cloud API for Atlas production.**

---

## Final production decision approved (2026-07-21)

The **final production decision** for Sprint **11.4** WhatsApp Cloud API migration is **approved**. Implementation is **authorized to proceed**.

| Decision | Detail |
|----------|--------|
| **Atlas AI production number** | **+1 786-752-8080** — dedicated Atlas channel |
| **WABA for migration** | **Niovel Perez** (Approved) — proceed with Cloud API migration |
| **Chat history** | **Not required to preserve** — existing WhatsApp Business App conversation history on **8080** does not block migration |
| **Ana Perez / 786-296-7254** | **Remains independent** — no Atlas binding; avoids operational risk to day-to-day business |
| **Authorization** | ✅ **Proceed** with Cloud API migration per [confirmed procedure](#confirmed-procedure-atlas-mvp) |

### Implications for migration

- **No history-preservation constraint** — migration can proceed even if Cloud API onboarding resets or replaces prior WhatsApp Business App messaging context on **8080**.
- **Single Atlas channel** — all automation, AI conversations, scheduling, ads (Click-to-WhatsApp), and future integrations use **786-752-8080** only.
- **Operational isolation** — Ana Perez's number continues manual business operations without Atlas webhook, token, or API Setup changes.
- **Next action** — execute **Use cases → Step 2 (Production setup)** on the existing Atlas Developer App; select **Niovel Perez WABA** / **786-752-8080**; complete Railway credential and webhook configuration; run live smoke test.

> **Rule:** **Final decision: migrate 8080 via Niovel Perez WABA. History preservation not required. 7254 stays independent. Proceed with Cloud API setup.**

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
| **Business Portfolio ID** | **`367219934273986`** — Atlas Developer App and Approved WABAs verified in **same portfolio** (2026-07-21) |
| Advertising restrictions | None observed |
| Open support cases | None |
| Business assets (Pages, ad accounts, portfolio health) | Appear healthy |
| Business Portfolio–level policy holds | None identified |
| **Portfolio misalignment as wabaID cause** | ❌ **Ruled out** |
| **App linked to portfolio with admin access** | ✅ Verified (2026-07-21) |
| **Connect assets WABA assignment** | ❌ **Not available** — Ad Accounts only; app asset assignment **ruled out** as wabaID cause |

**Conclusion:** The Cloud API onboarding failure is **not explained by a portfolio-wide Meta restriction** or missing app–WABA asset assignment via Business Settings. Focus troubleshooting on **Use cases → Step 2** WABA resolution for **+1 786-752-8080**, not on Business Verification, portfolio-level advertising status, or **Connect assets**.

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
| **Niovel Perez** | **+1 786-752-8080** | **Approved** | ✅ **Atlas AI production** — migrate to Cloud API |
| **Ana Perez** | **+1 786-296-7254** | **Approved** | 🔒 **Protected** — unchanged; day-to-day ops only; **out of scope for Atlas** |
| **Meta-generated Test WABA** | (test / none) | **Disabled** | ❌ **Do not use** — not eligible for Cloud API onboarding |

**Deployment rule:** Cloud API onboarding applies **only to Niovel Perez / 786-752-8080** via **Use cases** UI. **Do not modify Ana Perez / 786-296-7254.** Explicitly select the **Niovel Perez** WABA in the WhatsApp use case — **do not rely on Meta's automatic WABA selection**.

These approved production accounts are eligible for Cloud API connection. Do **not** proceed with onboarding while Meta has the **disabled Test WABA** selected.

**Do not:**

- Re-submit Business Verification solely because of this WABA error (portfolio already appears healthy)
- Assume Facebook/Instagram ad delivery is blocked (portfolio advertising restrictions were not found)
- **Modify Ana Perez WABA or 786-296-7254** — protected day-to-day business channel; out of scope for Atlas (see [production architecture](#production-architecture-approved-2026-07-21))
- **Enter verification code before reviewing migration warnings** — pause at verification prompt; capture all [confirmation screens](#confirmation-screen-log-deployment-record) first
- **Treat Production Setup readiness as migration complete** — readiness tasks do **not** attach **786-752-8080**; migration completes after verification + `phone_number_id`
- **Add phone number before WABA review** — complete [WABA/migration review](#waba-and-migration-review-complete-before-add-phone-number) first
- **Use Step 1 (Testing) for production WABA selection** — Step 1 has no WABA picker; use **Step 2 (Production setup)** instead
- **Use Meta's automatically created Test WABA** — select **Niovel Perez** (**786-752-8080**) in **Step 2 (Production setup)** instead
- **Follow legacy Meta docs** showing a standalone **WhatsApp** product menu — use [Use Cases UI](#meta-developer-console--use-cases-ui-2026-07-21) path instead
- Redeploy Atlas or change Railway env vars expecting a portfolio-level fix
- **Delete unused WhatsApp Business Accounts during migration** — see [WABA migration policy](#waba-migration-policy-do-not-delete-during-migration)
- **Change Developer App / WABA bindings without consulting Meta AI first** — see [pre-change gate](#pre-change-gate-consult-meta-ai-before-waba-reassignment)

**Do:**

- **Associate existing Approved WABA** via **Use cases → Step 2 (Production setup)** — no new app required (see [Use Cases UI](#meta-developer-console--use-cases-ui-2026-07-21))
- **Before Cloud API onboarding:** Confirm Meta has selected an **Approved production WABA** — not a disabled Test account (see [Deployment checklist](#deployment-checklist-before-cloud-api-onboarding))
- Open **Business settings → Accounts → WhatsApp accounts** and inspect the **individual WABA** Meta will bind to the Atlas app
- Select **Niovel Perez** (**786-752-8080**) as the **Atlas AI production WABA** — **not** Ana Perez (**786-296-7254**) or the disabled Meta-generated Test WABA
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

> **Operational checklist:** For step-by-step migration execution (env, webhook, messaging tests, ID registry), use [whatsapp-cloud-api-migration-checklist.md](./whatsapp-cloud-api-migration-checklist.md) (DOC-0702).

Complete **before** starting Meta WhatsApp Cloud API initialization or Embedded Signup for production:

- [x] **Production architecture confirmed** — **786-752-8080** = Atlas; **786-296-7254** (Ana Perez) unchanged (see [approved architecture](#production-architecture-approved-2026-07-21))
- [x] **Final production decision approved** — proceed Cloud API migration on **Niovel Perez WABA**; history preservation not required (see [final decision](#final-production-decision-approved-2026-07-21))
- [x] **List all WABAs** — Business settings → Accounts → WhatsApp accounts
- [x] **Complete WABA inventory** — ownership, linked apps, phone numbers, production usage (see [completed inventory](#waba-inventory-completed-2026-07-21))
- [ ] **Do not delete unused WABAs** during migration
- [x] **Consult Meta AI** — WABA reassignment procedure confirmed (see [pre-change gate](#pre-change-gate-consult-meta-ai-before-waba-reassignment))
- [x] **Record Meta AI guidance** — existing Approved WABA associable via **WhatsApp → API Setup**; no new Developer App required
- [x] **Production Setup page reached** — readiness complete
- [x] **Add phone number attempted** — **786-752-8080** — **failed** with `Unexpected null value for wabaID` ([incident](#incident-unexpected-null-value-for-wabaid-2026-07-21))
- [ ] **Resolve WABA binding in Meta** — Niovel Perez WABA must resolve in Step 2 before retry
- [ ] **Retry Add phone number** — after WABA confirmed; capture [confirmation screens](#confirmation-screen-log-deployment-record)
- [ ] **Explicitly select intended production WABA** — do not rely on Meta auto-selection
- [ ] **Verify WABA selected by Meta** — confirm Meta is **not** using the disabled **Meta-generated Test WABA**
- [ ] **Confirm target WABA is Niovel Perez** — **786-752-8080** only; do not select Ana Perez (**786-296-7254**) or Test WABA
- [ ] **Reject / switch away from Test WABA** if Meta auto-selects a disabled test account
- [ ] **Atlas Meta app has access** to the chosen production WABA
- [ ] **Record WABA ID and phone_number_id** before proceeding (for Railway env and webhook config)
- [ ] **`GET /health/production`** returns `mvp_ready: true` on Atlas (backend ready independently of Meta UI selection)

> **Rule:** **Production migration = Step 2 (Production setup). Step 1 (Testing) = auto test environment only — no WABA picker.**

---

## Pre-change gate: consult Meta AI before WABA reassignment ✅ guidance received 2026-07-21

**Before making any Meta configuration changes** — reassigning the Atlas **Developer App** from the disabled **Meta-generated Test WABA** to the **Niovel Perez** production WABA (**786-752-8080**) — complete this gate. **Do not implement WABA or app binding changes on Ana Perez / 786-296-7254.**

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

### Step 2 — Select production WABA in Use cases (do not delete others yet)

1. Choose **Niovel Perez** (**786-752-8080**) as the sole Atlas production WABA — **do not migrate or reconfigure Ana Perez** (**786-296-7254**).
2. In **Use cases → Step 2 (Production setup)**, **manually select** **Niovel Perez** / **786-752-8080** — do not use Step 1 (Testing); do not accept Meta's default Test WABA. **No new Developer App is required.**
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
2. Open [Meta for Developers](https://developers.facebook.com/) → **existing Atlas app** → **Use cases** → WhatsApp use case → **Step 2 (Production setup)** — skip Step 1 for production; do not use legacy WhatsApp product menu ([navigation reference](#meta-developer-console--use-cases-ui-2026-07-21)).
3. **Explicitly select Niovel Perez WABA** — **786-752-8080** only — **not** Ana Perez (**786-296-7254**) or the disabled Meta-generated Test WABA.
4. **Verify WABA status** in [Meta Business Suite](https://business.facebook.com/) → **Business settings** → **Accounts** → **WhatsApp accounts**.
5. Confirm the selected Approved WABA shows a valid **`phone_number_id`** in the use case configuration.
6. Record **WABA ID** and **`phone_number_id`** for Railway; complete webhook and credential configuration.
7. Only after the **correct Approved WABA** is associated, verify outbound send and run the live smoke test.

> **Rule:** **Step 2 (Production setup) = WABA and 786-752-8080. Step 1 (Testing) = sandbox only.**

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
| Wrong Business Portfolio | ❌ **Ruled out** — Atlas app and WABAs share portfolio **`367219934273986`** (2026-07-21) |
| App not added to WABA | ❌ **Ruled out** — app has admin access on portfolio; **Connect assets** exposes Ad Accounts only, not WABAs ([verified](#app-portfolio-link-and-connect-assets-verified-2026-07-21)) |
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
4. **Fix:** In **Use cases → Step 2 (Production setup)** on the **existing Atlas app**, select **Niovel Perez** / **786-752-8080** — do not use Step 1 (Testing) for WABA selection.

### Symptom: `Unexpected null value for wabaID`

Meta Production Setup failed **before SMS verification** with internal error **`Unexpected null value for wabaID`**. The UI did not resolve the target WABA for phone registration.

| Check | Action |
|-------|--------|
| WABA not selected in Step 2 | Explicitly select **Niovel Perez** WABA before **Add phone number** |
| App lacks WABA access | ❌ **Ruled out** — app linked with admin access; **Connect assets** has no WABA option; binding is via **Use cases → Step 2** |
| Test WABA auto-selected | Reject disabled Test WABA; confirm **Niovel Perez** WABA ID is non-null in UI |
| Error persists | Meta Support — cite `wabaID` null, **Portfolio ID `367219934273986`**, Niovel Perez WABA ID, Atlas App ID — portfolio ruled out; likely Meta backend WABA resolution failure |

**Not the fix:** Atlas Railway redeploy, `WHATSAPP_*` env rotation, or phone number format changes — no `phone_number_id` exists yet; this is **Meta-side WABA resolution**.

See [incident: wabaID null](#incident-unexpected-null-value-for-wabaid-2026-07-21).

### Symptom: Registration initiated but migration not live

Phone registration for **786-752-8080** may be **in progress** — Meta shows a **verification code** prompt. **Do not enter the code** until [migration warnings are reviewed](#verification-code-pause-gate) and [confirmation screens are captured](#confirmation-screen-log-deployment-record). Migration is complete only when `phone_number_id` is recorded.

### Symptom: Production Setup shows completed tasks but no messaging

The Production Setup page may show **completed readiness tasks** while **no production phone is attached** to the Atlas Developer App. This is **expected** — readiness ≠ migration. Next step: **Add phone number** after [WABA review](#waba-and-migration-review-complete-before-add-phone-number).

### Symptom: Cannot find phone registration in Step 2

Start the **Add phone number** workflow in Step 2. Registration may also appear under collapsed **Register your WhatsApp phone number**. Complete [WABA and migration review](#waba-and-migration-review-complete-before-add-phone-number) first.

### Symptom: Cannot find WABA selection in Use cases

Meta's Use Cases UI separates **Testing** from **Production setup**:

1. **Step 1 (Testing)** — auto-generated test environment; **WABA picker not exposed**. This is expected — do not block on Step 1 for production.
2. **Step 2 (Production setup)** — **expected location** for selecting **Niovel Perez** WABA and **786-752-8080**.
3. If Step 2 does not show Approved WABAs, verify Business Settings → WhatsApp accounts and app permissions before escalating to Meta Support.

### Symptom: Meta auto-selected wrong WABA

**Before switching WABAs:** Use **Step 2 (Production setup)** — see [Use Cases UI](#meta-developer-console--use-cases-ui-2026-07-21).

1. Open Business settings → Accounts → WhatsApp accounts — list all WABAs and note **Approved** vs **Test** / **Disabled**.
2. In Developer Console → **Use cases** → **Step 2 (Production setup)**, check which WABA is currently bound.
3. If the **disabled Meta-generated Test WABA** is selected, switch to **Niovel Perez** (**786-752-8080**) only.
4. Re-run Cloud API onboarding only after the Approved WABA is selected.
5. Record the WABA ID and `phone_number_id` for Railway configuration.

### Symptom: Cannot claim a test number

1. Confirm WABA is **not restricted** (see above).
2. In Developer Console → **Use cases** → **Step 2 (Production setup)**, check whether Meta offers a test number for your app tier — production number **786-752-8080** is the Atlas target regardless.
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

## Atlas production checklist (authorized — proceed with migration)

- [x] **Final production decision** — **786-752-8080** dedicated Atlas number; history not required; Ana Perez independent ([final decision](#final-production-decision-approved-2026-07-21))
- [ ] **WABA inventory complete** — do not delete unused WABAs until live smoke test passes (see [migration policy](#waba-migration-policy-do-not-delete-during-migration))
- [ ] **Step 2 (Production setup) complete** — **Use cases** → **Production setup** → **Niovel Perez** (**786-752-8080**); Step 1 (Testing) not used for production WABA
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
| 2026-07-21 | **Production architecture approved:** **786-752-8080** designated Atlas AI production number (Cloud API migration via Niovel Perez WABA); **Ana Perez / 786-296-7254** unchanged to protect day-to-day ops; Atlas owns 8080 for automation, AI, scheduling, future integrations |
| 2026-07-21 | **Final production decision approved:** **786-752-8080** = dedicated Atlas AI production number; existing WhatsApp Business App history **not required to preserve**; **Ana Perez / 786-296-7254** remains independent (operational risk avoidance); **authorized to proceed** with Cloud API migration on **Niovel Perez WABA** |
| 2026-07-21 | **Meta Use Cases UI (v2.0):** WhatsApp Cloud API configuration no longer in standalone **WhatsApp** product menu — use **Use cases** flow; updated deployment docs; avoid legacy Meta navigation documentation |
| 2026-07-21 | **Use Cases Step 1 vs Step 2 (v2.1):** Step 1 (Testing) = auto test environment, **no WABA selection**; Step 2 (Production setup) = **expected path** for Niovel Perez WABA and **786-752-8080** migration |
| 2026-07-21 | **Production Setup workflow reached (v2.2):** Phone registration under collapsed **Register your WhatsApp phone number** in Step 2; **do not register** until WABA selection and migration options reviewed and documented |
| 2026-07-21 | **Production Setup status confirmed (v2.3):** **No production phone** on Atlas Developer App; completed Step 2 task = **readiness for registration only** — not migration complete; **next:** **Add phone number** (select Niovel Perez WABA + **786-752-8080**) |
| 2026-07-21 | **Phone registration initiated (v2.4):** **786-752-8080** registration started for Atlas AI; **paused before verification code** — review migration warnings and capture all confirmation screens before entering code |
| 2026-07-21 | **Production Setup failed (v2.5):** Meta internal error **`Unexpected null value for wabaID`** before SMS verification — UI failed to resolve target WABA; **not** Atlas or phone number issue; occurred before phone migration |
| 2026-07-21 | **Business Portfolio alignment verified (v2.6):** Atlas Developer App and Approved WABAs share portfolio **`367219934273986`** — wrong portfolio **ruled out**; remaining evidence: **Meta backend failure** resolving WABA during registration (`wabaID = null`) |
| 2026-07-21 | **App–portfolio link verified (v2.7):** Atlas AI app linked to portfolio with **administrator access**; **Connect assets** exposes **Ad Accounts only** — WABA assignment not available; **app asset assignment ruled out** as wabaID cause |

---

## One-line summary

> **wabaID null — portfolio and app link verified; Connect assets has no WABA path. Meta backend WABA resolution failure — not Atlas. Escalate to Meta Support.**
