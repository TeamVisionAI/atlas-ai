# Meta Review Evidence Package

PNG screenshots for Meta App Review. Capture procedure: [CAPTURE_GUIDE.md](./CAPTURE_GUIDE.md).

**Source checklist:** [Screenshot_Checklist.md](../Screenshot_Checklist.md) (MTP-SC-001) · **Demo prospect:** [demo-prospect.md](./demo-prospect.md) · **Readiness report:** [META_SUBMISSION_READINESS.md](../../09-releases/META_SUBMISSION_READINESS.md)

## Verification before submission

```bash
node backend/dev/verifySprint21_0.js
```

Expected: `=== Sprint 21.0 Verification PASSED ===`

## Canonical prospect (Git)

| Field | Value |
|-------|--------|
| **Name** | John Smith |
| **Phone** | `<REVIEW_TEST_PHONE_E164>` — local only; see [review-phone.local.example](./review-phone.local.example) |
| **Inbound message** | `Hi, I'm interested in learning more.` |

Screenshots **05–12** must use the **real personal WhatsApp number** at capture time. Do not commit that number to Git.

## Required files (Path A — live WABA)

| File | Status |
|------|--------|
| `01-authenticated-workspace-executive-dashboard.png` | Pending capture |
| `02-whatsapp-connect-pre-connect.png` | Pending capture |
| `03-meta-embedded-signup-permissions.png` | Pending capture |
| `04-whatsapp-connect-connected.png` | Pending capture |
| `05-customer-whatsapp-inbound-message.png` | Pending capture — real review phone |
| `06-prospect-workspace-activity-feed-inbound.png` | Pending capture — `<URL_ENCODED_REVIEW_PHONE>` |
| `07-customer-whatsapp-automated-reply.png` | Pending capture — real review phone |
| `08-prospect-workspace-activity-feed-inbound-outbound.png` | Pending capture — `<URL_ENCODED_REVIEW_PHONE>` |
| `09-mission-control-prospect-queue.png` | Pending capture — `<URL_ENCODED_REVIEW_PHONE>` |

## Recommended files

| File | Status |
|------|--------|
| `10-prospect-center-pipeline-entry.png` | Pending capture — search `?q=John` |
| `11-prospect-workspace-journey-context.png` | Pending capture — `<URL_ENCODED_REVIEW_PHONE>` |
| `12-mission-control-conversation-panel.png` | Pending capture — `<URL_ENCODED_REVIEW_PHONE>` |
| `13-whatsapp-connect-connected-closing.png` | Pending capture |

## Simulator review files (Path B — WABA unavailable)

| File | Status |
|------|--------|
| `sim-01-operations-center-simulator.png` | Pending capture |
| `sim-02-review-experience-conversation.png` | Pending capture |
| `sim-03-review-ai-action-center.png` | Pending capture |
| `sim-04-review-follow-up-message.png` | Pending capture |

Redact bootstrap tokens, Meta secrets, and personal phone numbers in submitted PNGs if required by your review policy.
