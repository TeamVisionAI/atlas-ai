# Meta Review — Demo Prospect

Canonical **committed** test data for Meta App Review documentation and screenshot planning.

## Live review phone (never commit to Git)

The inbound/outbound WhatsApp test must use a **real personal WhatsApp number** available to the review operator. That number is **not stored in this repository**.

| Placeholder | Use |
|-------------|-----|
| `<REVIEW_TEST_PHONE_E164>` | E.164 value of the personal WhatsApp that sends the inbound message (e.g. `+1…`) — **local only** |
| `<URL_ENCODED_REVIEW_PHONE>` | `encodeURIComponent` of the phone value **as stored in Atlas** after inbound (confirm in Prospect Center) — **local only** |

**Before capture:** copy [review-phone.local.example](./review-phone.local.example) to `review-phone.local.txt` (gitignored), fill in your values, and use those substitutions for screenshots **05–12** only.

> **Screenshots 05–12** must show the **real review number** at capture time (customer WhatsApp device + Atlas UI keyed to that number). Do not use the fictional sample below for live testing.

---

## Canonical prospect (committed)

| Field | Value | Atlas UI notes |
|-------|--------|----------------|
| **Prospect name** | John Smith | Display name in Workspace, Mission Control, Prospect Center |
| **Phone** | `<REVIEW_TEST_PHONE_E164>` at capture | Shown in UI after inbound; value comes from live test device |
| **Status (narrative)** | New Prospect | UI milestone: **New Lead** |
| **Last message (inbound)** | Hi, I'm interested in learning more. | Activity Feed + Conversation panel preview |
| **Journey (narrative)** | Initial Contact | UI journey step: **Lead** (step 1 active) |
| **Organization (narrative)** | Demo Organization | Sidebar: **Team Vision Recruiting** in current build |

---

## URL templates

Replace `{BASE}` with review host (e.g. `https://atlas-ai-three-ruby.vercel.app` or `https://localhost:5173`).

Substitute `<URL_ENCODED_REVIEW_PHONE>` with your local encoded value before navigating.

| Screen | Template |
|--------|----------|
| Prospect Workspace | `{BASE}/app/prospect-workspace/<URL_ENCODED_REVIEW_PHONE>` |
| Mission Control (selected) | `{BASE}/app/mission-control?phone=<URL_ENCODED_REVIEW_PHONE>` |
| Prospect Center (search) | `{BASE}/app/prospect-center?q=John` |

**Phone key troubleshooting:** If workspace 404s, Atlas may have stored digits-only or E.164 — open Prospect Center, click John Smith, and copy the phone segment from the browser URL.

---

## WhatsApp test message

From the personal device using `<REVIEW_TEST_PHONE_E164>`, send exactly:

```
Hi, I'm interested in learning more.
```

to the connected demo **business** number **before** capturing screenshots **05–08**.

---

## Fictional sample data (documentation only — not for live testing)

The following is **reserved fictitious numbering** (NANP 555 exchange). **Do not** use it for WhatsApp Cloud API, webhooks, or screenshot capture.

| Field | Fictional example |
|-------|-------------------|
| Phone (display) | +1 305-555-0101 |
| Phone (E.164) | +13055550101 |

Use only when illustrating narrative or UI labels in written materials — never as `<REVIEW_TEST_PHONE_E164>`.
