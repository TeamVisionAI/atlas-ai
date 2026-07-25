# Data Classification

| Tier | Label | Examples | Controls |
|------|-------|----------|----------|
| **T1 — Restricted** | Credentials & secrets | `META_APP_SECRET`, WhatsApp tokens, `GOOGLE_REFRESH_TOKEN`, session tokens, bootstrap tokens | Secrets manager only; never client-side; never logs |
| **T2 — Confidential** | Prospect PII | Phone, name, email, messages, notes, recruiting status | Authenticated API; encrypted in transit (TLS); Supabase at rest |
| **T3 — Internal** | Operational | Workflow events, Mission Control aggregates, org Zoom URL | Authenticated Atlas users |
| **T4 — Public** | Marketing / legal | Privacy policy, terms, public contact form submissions (with consent) | Rate-limited public endpoints |

## Storage mapping

| Store | Tier | Notes |
|-------|------|-------|
| Supabase `prospects` | T2 | Legacy recruiting records |
| Supabase `atlas_core_prospects` | T2 | Atlas Core prospect engine |
| Supabase `conversation_logs` | T2 | Full message history |
| Supabase `atlas_business_events` | T2–T3 | Event payloads may embed PII |
| Supabase `atlas_sessions` | T1 | Session tokens |
| `localStorage` atlas_session_token | T1 | Browser session |
| `localStorage` workflow state | T3 | Client-side workflow cache per phone key — review for PII |
| Operations Center activity log | T3 | In-memory; may reference phones |

## Transmission

All T1–T3 data must use HTTPS in production. Webhooks must verify Meta signatures when `META_APP_SECRET` is configured (required in production).
