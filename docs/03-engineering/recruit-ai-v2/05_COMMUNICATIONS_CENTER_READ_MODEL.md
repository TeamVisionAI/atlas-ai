# Communications Center — Read Model (MVP)

**Status:** Implemented (read-only aggregation)  
**Branch intent:** `feature/communications-center-read-model`  
**Endpoint:** `GET /api/communications-center/:phone`

## Purpose

One chronological, backend-aggregated timeline of prospect communications and operational events. This is the observability/evidence layer before Recruit AI v2 decision changes.

## Boundaries

- Read-only (no WhatsApp sends, no appointment mutations, no CE/parser changes)
- Express + service-role only (no browser Supabase)
- Auth: `requireAtlasUser` + `organizationGuard` + `requireLegacyProspectAccess`
- Simulator phones rejected via `isProductionProspect`
- Meta Review / BR-075 / migrations / Storage untouched

## Sources (verified)

| Source | Role | Inclusion rule |
|---|---|---|
| `conversation_logs` | Canonical message content + order | Always (phone-linked) |
| `whatsapp_outbound_deliveries` | Delivery / BR-075 ledger | Enrich messages by `conversation_log_id`; emit standalone when unlinked |
| `workflow_events` | Lifecycle / ownership | Include; skip message mirrors already covered by logs |
| `atlas_appointments` | Appointment chips | Phone + org filter |
| `atlas_business_events` | Domain analytics | Only when `prospect_id` present |
| `atlas_timeline_entries` | Projection | Only when `prospect_id` present |

Unlinkable rows are omitted and reported in `gaps[]`.

## Contract

See timeline item shape in the sprint brief / `communicationsCenterReadModel.js` `baseItem()`.

Response envelope:

- `items[]` chronological ascending
- `sources` counts
- `gaps[]` missing org on logs, empty BE/timeline, etc.
- `phoneMasked` only (`+***####`)

## Forensic flags (observability)

Heuristic flags for TV-000028 evidence (not decision engine):

- `counteroffer` / `counteroffer_6` / `counteroffer_630`
- `ignored_counteroffer` / `unhandled`
- `internal_error_leaked`
- `dual_confirmation`
- `post_confirmation_lock` / `no_reschedule_path`
- `repeated_slot_menu`
- `br075_decision` / `delivery_attention`

## Tests

`backend/test/communicationsCenterReadModel.test.js` replays sanitized TV-000028 turns through injectable loaders (no production writes).
