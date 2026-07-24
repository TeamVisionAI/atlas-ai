# Meta Review Evidence — Manual Capture Guide

**Document ID:** MTP-EV-001  
**Version:** 1.2  
**Status:** Draft for Meta Tech Provider Review  
**Related:** [Screenshot_Checklist.md](../Screenshot_Checklist.md) · [MTP-009 Demo Script](../09_Demo_Script.md) · [demo-prospect.md](./demo-prospect.md)

---

## Automation status

**Playwright, Puppeteer, and Cypress are not installed in this workspace.** There is no browser automation script in the repository.

Capture screenshots manually using the steps below. Save PNG files to this folder:

```
docs/11-meta-tech-provider/evidence/
```

Use the exact filenames from [Screenshot_Checklist.md](../Screenshot_Checklist.md).

---

## Before you start

### Environment

Use the **Meta review environment** (production or staging) where the following are configured:

| Requirement | Variable / detail |
|-------------|-------------------|
| Atlas web app (HTTPS) | e.g. `https://atlas-ai-three-ruby.vercel.app` or local `https://localhost:5173` |
| Bootstrap auth | `ATLAS_BOOTSTRAP_TOKEN` (Railway) + `VITE_ATLAS_BOOTSTRAP_TOKEN` (Vercel/local) |
| Meta Embedded Signup | `VITE_META_APP_ID`, `VITE_META_EMBEDDED_SIGNUP_CONFIG_ID` |
| WhatsApp Cloud API + webhooks | Railway `META_*`, `WHATSAPP_*` vars; webhook reachable |
| Demo WABA | Customer-owned test number for Embedded Signup |
| Second WhatsApp client | Personal phone to send **user-initiated** test message |

### Local dev (optional)

```bash
# Terminal 1 — repo root
npm run dev

# Terminal 2 — frontend (HTTPS required for Meta SDK)
cd frontend && npm run dev -- --host
```

Open `https://localhost:5173/app`. Accept the self-signed certificate if prompted. Add `https://localhost:5173` to Meta app **Allowed domains**.

### Capture settings (all Atlas web screenshots)

| Setting | Value |
|---------|--------|
| **Viewport** | **1440 × 900** (desktop — shows full sidebar + main content) |
| **Browser zoom** | 100% |
| **Language** | English (toggle in sidebar footer if UI is in Spanish) |
| **Format** | PNG, device pixel ratio 2× if available (Retina) |
| **Redaction** | Blur or crop bootstrap tokens, full WABA tokens, and personal phone numbers in submitted PNGs |

### Live review phone (never commit to Git)

WhatsApp inbound/outbound testing requires a **real personal WhatsApp number**. That value is **not stored in Git**.

| Placeholder | Meaning |
|-------------|---------|
| `<REVIEW_TEST_PHONE_E164>` | Personal WhatsApp in E.164 form — local worksheet only |
| `<URL_ENCODED_REVIEW_PHONE>` | URL-encoded phone as stored in Atlas after inbound — local worksheet only |

Copy [review-phone.local.example](./review-phone.local.example) → `review-phone.local.txt` (gitignored) and fill in before capture.

> **Screenshots 05–12** must use the **real review number** at capture time (customer device + Atlas routes). Substitute placeholders locally; do not commit real numbers.

### Demo prospect (committed — John Smith)

Use for screenshots **05–12**. Full reference: [demo-prospect.md](./demo-prospect.md).

| Field | Value |
|-------|--------|
| **Prospect name** | John Smith |
| **Phone** | `<REVIEW_TEST_PHONE_E164>` (local only — personal WhatsApp that sends inbound) |
| **Status (narrative)** | New Prospect → Atlas UI milestone: **New Lead** |
| **Last inbound message** | `Hi, I'm interested in learning more.` |
| **Journey (narrative)** | Initial Contact → Atlas UI journey step: **Lead** (step 1 active) |
| **Organization (narrative)** | Demo Organization → sidebar shows **Team Vision Recruiting** in current build |

**Fictional sample (documentation only — not for live testing):** +1 305-555-0101 is reserved fictitious numbering. Never use it as `<REVIEW_TEST_PHONE_E164>` or for WhatsApp API tests.

### URL templates

Replace `{BASE}` with your review host (no trailing slash). Substitute `<URL_ENCODED_REVIEW_PHONE>` from your local worksheet.

| Template | Path |
|----------|------|
| `{WORKSPACE}` | `{BASE}/app/prospect-workspace/<URL_ENCODED_REVIEW_PHONE>` |
| `{MISSION}` | `{BASE}/app/mission-control?phone=<URL_ENCODED_REVIEW_PHONE>` |
| `{CENTER}` | `{BASE}/app/prospect-center?q=John` |

If Prospect Workspace 404s, confirm stored phone in Prospect Center (E.164 vs digits-only) and re-encode.

### Capture order

Complete **01 → 09** in sequence. Steps **05–08** require inbound from `<REVIEW_TEST_PHONE_E164>` and automated reply (~30 seconds after webhook processing). Steps **06–09** and recommended **10–12** use `<URL_ENCODED_REVIEW_PHONE>` in Atlas URLs.

**Do not capture** placeholder routes: `/app/conversations`, `/app/appointments`, `/app/analytics`, `/app/settings`.

---

## Required screenshots

### 01 — Authenticated workspace

| Field | Value |
|-------|--------|
| **Filename** | `01-authenticated-workspace-executive-dashboard.png` |
| **Route** | `{BASE}/app` |
| **Data required** | Bootstrap token configured; backend `/api/auth/session` succeeds |
| **Viewport** | 1440 × 900 |
| **Expected UI** | `MainLayout` sidebar with nav links (Executive Dashboard, Quick Capture, Mission Control, Prospect Center, …). Main area shows **Executive Dashboard** — morning brief, focus cards, pipeline widgets, or loading skeleton replaced by live metrics. **No username/password login form.** |
| **MTP references** | MTP-009 Step 1 · MTP-010 Q1, Q15 |

**Steps:** Open `{BASE}/app` in a fresh browser profile or after clearing `localStorage` key `atlas_session_token`. Wait for dashboard content to load. Capture full window including sidebar.

---

### 02 — WhatsApp Connect (pre-connect)

| Field | Value |
|-------|--------|
| **Filename** | `02-whatsapp-connect-pre-connect.png` |
| **Route** | `{BASE}/app/settings/whatsapp` |
| **Data required** | Meta SDK env vars set; organization **not** connected (or use review org before signup). If already connected, skip to 04 for connected state and obtain 02 from a disconnected review org only. |
| **Viewport** | 1440 × 900 |
| **Expected UI** | Page title **WhatsApp Business**; subtitle explaining connection; primary button **Connect WhatsApp Business** (not disabled). No connected-details block (`Connected` / WABA dl). Meta SDK version line in footer optional. |
| **MTP references** | MTP-009 Step 3 · MTP-010 Q15 |

**Steps:** Navigate directly to WhatsApp Connect. Confirm button is visible and enabled. Capture card section; crop secrets from Meta App ID display if shown truncated.

---

### 03 — Meta Embedded Signup permissions

| Field | Value |
|-------|--------|
| **Filename** | `03-meta-embedded-signup-permissions.png` |
| **Route** | External — Meta popup from `{BASE}/app/settings/whatsapp` |
| **Data required** | Demo Meta Business Account; click **Connect WhatsApp Business** to launch `FB.login` |
| **Viewport** | Capture **popup window** at native resolution (typically 480–600px wide) |
| **Expected UI** | Meta/Facebook authorization dialog listing permissions including `whatsapp_business_management`, `whatsapp_business_messaging`, and `public_profile` (exact wording per Meta UI). Customer business account context visible. |
| **MTP references** | MTP-009 Step 3 · MTP-010 Q3, Q9 · MTP-008 Appendix A |

**Steps:** From screenshot 02 state, click **Connect WhatsApp Business**. When Meta popup appears, capture before clicking Continue/Grant. This screen is **not** an Atlas route — save as PNG in evidence folder.

---

### 04 — WhatsApp Connect (connected)

| Field | Value |
|-------|--------|
| **Filename** | `04-whatsapp-connect-connected.png` |
| **Route** | `{BASE}/app/settings/whatsapp` |
| **Data required** | Embedded Signup completed; WABA + phone number linked |
| **Viewport** | 1440 × 900 |
| **Expected UI** | Heading **Connected**; definition list with **Phone number ID**, **WABA ID**, optional **Display phone**, **Connection type** (`Embedded Signup`), **Status** (Healthy / Degraded / etc.). Connect button hidden. **No in-app disconnect button.** |
| **MTP references** | MTP-009 Steps 3, 7 · MTP-010 Q9, Q15 |

**Steps:** Complete Embedded Signup from step 03. Return to WhatsApp Connect after success. Capture full connected card.

---

### 05 — Customer WhatsApp inbound

| Field | Value |
|-------|--------|
| **Filename** | `05-customer-whatsapp-inbound-message.png` |
| **Route** | External — customer WhatsApp app (iOS, Android, or WhatsApp Web) |
| **Data required** | Connected business display number from step 04; personal device using `<REVIEW_TEST_PHONE_E164>` |
| **Viewport** | Phone screenshot or WhatsApp Web window (~390 × 844 mobile or chat window crop) |
| **Expected UI** | Chat with **business number** showing a message **sent by the customer** (outgoing bubble on customer device) — proves user-initiated contact. Include timestamp and business name if visible. |
| **MTP references** | MTP-009 Step 4 · MTP-010 Q4, Q5, Q15 |

**Steps:** From the personal WhatsApp registered as `<REVIEW_TEST_PHONE_E164>`, send to the connected business number:

```
Hi, I'm interested in learning more.
```

Capture customer-side chat **before** Atlas auto-reply arrives if possible. Atlas creates/links prospect **John Smith** keyed to `<REVIEW_TEST_PHONE_E164>`.

---

### 06 — Prospect Workspace (inbound Activity Feed)

| Field | Value |
|-------|--------|
| **Filename** | `06-prospect-workspace-activity-feed-inbound.png` |
| **Route** | `{WORKSPACE}` (`/app/prospect-workspace/<URL_ENCODED_REVIEW_PHONE>`) |
| **Data required** | John Smith after inbound from `<REVIEW_TEST_PHONE_E164>`; message: `Hi, I'm interested in learning more.` |
| **Viewport** | 1440 × 900 — scroll so **Activity Feed** column is visible |
| **Expected UI** | **Prospect Workspace** for **John Smith** (phone shows `<REVIEW_TEST_PHONE_E164>` as stored); milestone **New Lead**; journey step **Lead** active; **Activity Feed** inbound entry with preview `Hi, I'm interested in learning more.` **No free-form WhatsApp compose box.** |
| **MTP references** | MTP-009 Step 4 · MTP-010 Q5, Q13, Q15 |

**Steps:** Open `{WORKSPACE}`. If 404, try digits-only path. Filter Activity Feed to **Messages** if helpful. Capture feed showing John Smith’s inbound message only.

---

### 07 — Customer WhatsApp automated reply

| Field | Value |
|-------|--------|
| **Filename** | `07-customer-whatsapp-automated-reply.png` |
| **Route** | External — customer WhatsApp app |
| **Data required** | Wait ~30s after inbound for Conversation Engine reply (Sprint 11.4 Phase A); prospect not in workflow-gate / human-ownership block |
| **Viewport** | Same as step 05 |
| **Expected UI** | Same chat with **incoming message from business** (Atlas automated reply to John Smith) below: `Hi, I'm interested in learning more.` |
| **MTP references** | MTP-009 Step 5 · MTP-010 Q6, Q8, Q15 |

**Steps:** Wait for Atlas reply on customer device. Capture chat showing both customer message and business reply.

---

### 08 — Prospect Workspace (inbound + outbound Activity Feed)

| Field | Value |
|-------|--------|
| **Filename** | `08-prospect-workspace-activity-feed-inbound-outbound.png` |
| **Route** | `{WORKSPACE}` |
| **Data required** | Automated reply delivered (step 07) for John Smith |
| **Viewport** | 1440 × 900 — Activity Feed visible |
| **Expected UI** | Activity Feed for John Smith with **two message entries**: inbound (`Hi, I'm interested in learning more.`, actor Prospect) and outbound (actor **Atlas**). |
| **MTP references** | MTP-009 Step 5 · MTP-010 Q6, Q8, Q13 |

**Steps:** Refresh workspace or wait for feed reload. Capture feed with both entries visible in one frame.

---

### 09 — Mission Control prospect queue

| Field | Value |
|-------|--------|
| **Filename** | `09-mission-control-prospect-queue.png` |
| **Route** | `{MISSION}` |
| **Data required** | John Smith in live queue after inbound |
| **Viewport** | 1440 × 900 |
| **Expected UI** | Mission Control with **John Smith** as current prospect; queue position visible; **Next actions** (Call, WhatsApp, Notes — no compose box); **Conversation** panel showing inbound `Hi, I'm interested in learning more.` |
| **MTP references** | MTP-009 Steps 2, 4 · MTP-010 Q5, Q15 |

**Steps:** Open `{MISSION}`. Capture queue context with John Smith selected.

---

## Recommended screenshots

### 10 — Prospect Center pipeline entry

| Field | Value |
|-------|--------|
| **Filename** | `10-prospect-center-pipeline-entry.png` |
| **Route** | `{CENTER}` |
| **Data required** | John Smith prospect in pipeline |
| **Viewport** | 1440 × 900 |
| **Expected UI** | Prospect Center with `?q=John`; row for **John Smith** with milestone **New Lead**, priority badge, phone matching `<REVIEW_TEST_PHONE_E164>`. |
| **MTP references** | MTP-009 Steps 2, 6 · MTP-010 Q5, Q15 |

---

### 11 — Prospect Workspace journey context

| Field | Value |
|-------|--------|
| **Filename** | `11-prospect-workspace-journey-context.png` |
| **Route** | `{WORKSPACE}` |
| **Data required** | John Smith prospect |
| **Viewport** | 1440 × 900 — frame **identity strip + journey progress** above Activity Feed |
| **Expected UI** | **John Smith**, phone `<REVIEW_TEST_PHONE_E164>`, journey track with **Lead** step active (Initial Contact narrative), Activity Feed partially visible below. |
| **MTP references** | MTP-009 Step 6 |

---

### 12 — Mission Control conversation panel

| Field | Value |
|-------|--------|
| **Filename** | `12-mission-control-conversation-panel.png` |
| **Route** | `{MISSION}` |
| **Data required** | John Smith selected; inbound message loaded |
| **Viewport** | 1440 × 900 — scroll to **Conversation** section if below fold |
| **Expected UI** | Dark **Conversation** panel — last message from **Prospect**: `Hi, I'm interested in learning more.` |
| **MTP references** | MTP-010 Q5 |

---

### 13 — WhatsApp Connect closing

| Field | Value |
|-------|--------|
| **Filename** | `13-whatsapp-connect-connected-closing.png` |
| **Route** | `{BASE}/app/settings/whatsapp` |
| **Data required** | Still connected (same as step 04) |
| **Viewport** | 1440 × 900 |
| **Expected UI** | Same connected state as 04 — usable as closing evidence for permission scope discussion. |
| **MTP references** | MTP-009 Step 7 · MTP-010 Q9, Q10 |

---

## Optional screenshots

Capture only when applicable.

### 14 — Next Actions structured outbound

| **Filename** | `14-next-actions-structured-outbound.png` |
| **Route** | `{WORKSPACE}` or `{MISSION}` |
| **Data required** | Workflow milestone allows action (e.g. Send Zoom link); `zoomInterviewUrl` configured |
| **Viewport** | 1440 × 900 |
| **Expected UI** | **Next actions** cards including accent action (Zoom / office location). |
| **MTP references** | MTP-009 Step 5 (optional) · MTP-010 Q6, Q7 |

### 15 — Quick Capture

| **Filename** | `15-quick-capture-form.png` |
| **Route** | `{BASE}/app/quick-capture` |
| **Data required** | Bootstrap session only |
| **Viewport** | 1440 × 900 |
| **Expected UI** | Quick Capture form (name, phone, source fields). |
| **MTP references** | MTP-009 Before the Demo · MTP-010 Q1 |

### 16 — Meta Business Manager revocation

| **Filename** | `16-meta-business-manager-revocation.png` |
| **Route** | External — Meta Business Manager / Business settings |
| **Data required** | Meta admin access to demo business |
| **Viewport** | Native Meta UI |
| **Expected UI** | Screen where customer can remove app authorization / disconnect WABA (Meta-side). |
| **MTP references** | MTP-009 Step 7 · MTP-010 Q9, Q10 |

---

## Troubleshooting

| Issue | Action |
|-------|--------|
| Blank dashboard / API errors | Verify `VITE_API_BASE_URL`, bootstrap tokens, Supabase connectivity |
| Connect button disabled | Check `VITE_META_APP_ID`, `VITE_META_EMBEDDED_SIGNUP_CONFIG_ID`; use HTTPS |
| Inbound not in Activity Feed | Confirm webhook + signature; open workspace by exact stored phone |
| No auto-reply | Check Railway logs for `conversation_engine_reply_sent`; verify workflow gate off |
| Wrong language | Sidebar language toggle → English before capture |

---

## Submission checklist

- [ ] Substituted `<REVIEW_TEST_PHONE_E164>` and `<URL_ENCODED_REVIEW_PHONE>` locally for screenshots **05–12** (real number on device + in Atlas UI)
- [ ] Real review phone **not** committed to Git (`review-phone.local.txt` gitignored)
- [ ] All 9 required PNGs saved in `docs/11-meta-tech-provider/evidence/`
- [ ] Filenames match checklist exactly
- [ ] No placeholder pages captured
- [ ] Secrets and personal data redacted
- [ ] Pair with [MTP-009](../09_Demo_Script.md) and [MTP-010](../10_Reviewer_FAQ.md) for submission narrative
