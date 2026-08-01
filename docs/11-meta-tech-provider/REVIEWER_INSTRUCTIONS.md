# Meta App Review — Reviewer Instructions

**Document ID:** MTP-RI-001  
**Version:** 1.0  
**Status:** Approved for MVP Freeze Milestone 3  
**Last updated:** 2026-08-01

---

## Purpose

Step-by-step instructions for Meta App Review evaluators testing Atlas AI WhatsApp Business integration. Every route and behavior below exists in the current `main` branch.

**Related:** [MTP-009 Demo Script](./09_Demo_Script.md) · [META_SUBMISSION_READINESS.md](../09-releases/META_SUBMISSION_READINESS.md) · [MTP-010 Reviewer FAQ](./10_Reviewer_FAQ.md)

---

## Before you begin

Confirm the review operator has provided (via secure channel):

- HTTPS Atlas URL (e.g. `https://atlas-ai-three-ruby.vercel.app`)
- Matching bootstrap tokens (`ATLAS_BOOTSTRAP_TOKEN` / `VITE_ATLAS_BOOTSTRAP_TOKEN`)
- Administrator role for Operations Center (simulator path)
- Demo Meta Business admin credentials (live WABA path)
- Personal WhatsApp device (live WABA path)

---

## Path A — Live WhatsApp (preferred)

### Step 1 — Access Atlas

1. Open `{BASE}/app`.
2. Session establishes automatically via bootstrap authentication.
3. Confirm **Executive Dashboard** or navigate to **Mission Control**.

> There is no username/password login form in the current MVP.

### Step 2 — Connect WhatsApp Business

1. Open `{BASE}/app/settings/whatsapp`.
2. Click **Connect WhatsApp** — Meta Embedded Signup popup opens.
3. Sign in with the demo organization's Meta Business admin.
4. Grant: `whatsapp_business_management`, `whatsapp_business_messaging`, `public_profile`.
5. Confirm connected WABA ID, phone number ID, and health status on Atlas.

### Step 3 — User-initiated inbound message

1. From a **personal WhatsApp client**, send to the connected **business number**:

   ```
   Hi, I'm interested in learning more.
   ```

2. This must be **user-initiated** — Atlas does not send the first message.

### Step 4 — Verify in Atlas

1. Open `{BASE}/app/prospect-center` — locate prospect by phone or name.
2. Open `{BASE}/app/prospect-workspace/{phone}` — confirm inbound in **Activity Feed**.
3. Open `{BASE}/app/mission-control?phone={phone}` — confirm prospect in queue.

### Step 5 — Verify automated outbound reply

1. Wait up to ~30 seconds on the personal WhatsApp device.
2. Confirm Atlas qualification reply arrives (Conversation Engine via Communication Hub).
3. Refresh Prospect Workspace Activity Feed — confirm outbound entry (actor: Atlas).

### Step 6 — Permissions and revocation

1. Return to `{BASE}/app/settings/whatsapp` — review connected status.
2. Revocation is performed in **Meta Business Manager** (Atlas has no in-app disconnect button).

---

## Path B — Simulator review (WABA unavailable)

Use when live WABA is restricted or Embedded Signup cannot complete.

### Step 1 — Operations Center access

1. Sign in with **Administrator** bootstrap session.
2. Open `{BASE}/app/operations-center`.

### Step 2 — Generate simulated conversation

1. Open **Workflow Simulator**.
2. Run **Generate WhatsApp Conversation** (creates `sim-ops-*` phone).
3. Click **Open Review Experience**.

### Step 3 — Review experience

1. URL: `{BASE}/app/operations-center/review/{phone}`.
2. Confirm **Simulated WhatsApp** disclaimer badge.
3. Confirm Conversation panel, AI Action Center, Atlas Brief, workflow trace.
4. Send follow-up: `Vivo en Miami, Florida.` — confirm second qualification turn.

> Simulator phones (`sim-*`) are excluded from production Mission Control and Prospect Center lists by design.

---

## Executable verification (operator)

The review operator can confirm the simulator path programmatically:

```bash
node backend/dev/verifySprint21_0.js
```

Expected output: `=== Sprint 21.0 Verification PASSED ===`

---

## Public policy pages

| Page | URL |
|------|-----|
| Privacy Policy | `https://teamvisionfinancial.com/privacy` |
| Terms of Service | `https://teamvisionfinancial.com/terms` |
| Legal | `https://teamvisionfinancial.com/legal` |
| Data Deletion | `https://teamvisionfinancial.com/data-deletion` |

---

## What is out of scope for this review

| Surface | Status |
|---------|--------|
| `/app/conversations` standalone page | UI shell only |
| Instagram Direct / Messenger | Not implemented |
| Free-form WhatsApp compose in UI | Not implemented — automated + structured agent actions only |
| Username/password recruiter login | Planned — bootstrap auth only today |

---

## Troubleshooting

| Issue | Check |
|-------|-------|
| Cannot access `/app` | Bootstrap tokens match between frontend and Railway |
| Embedded Signup fails | WABA not restricted; correct Meta App ID and Config ID |
| No inbound visible | Webhook subscribed; check Prospect Workspace by exact phone key |
| No automated reply | Prospect not in human-ownership gate; check logs for `conversation_engine_reply_sent` |
| Simulator review 403 | User must be Administrator role |

See [MTP-009 Troubleshooting](./09_Demo_Script.md#troubleshooting-for-reviewers).
