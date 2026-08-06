# Communications Center — Read Model (MVP)

**Status:** Implemented (read-only aggregation)  
**Canonical endpoint:** `GET /api/prospects/:prospectId/communications`  
**Identity rule:** `prospect.id` is canonical. Phone is contact-channel metadata only.

## Purpose

One chronological, backend-aggregated timeline of prospect communications and operational events. Observability/evidence layer before Recruit AI v2 decision changes.

## Request flow

1. `requireAtlasUser`
2. `organizationGuard`
3. `requireProspectAccessById` — load legacy `prospects` by id, else core; org + hierarchy checks
4. Resolve approved channel identities from the authorized prospect
5. Evaluate phone-sharing / recycled-number safety
6. Aggregate by correlation precedence
7. Return masked contact information only

Never authorize from phone possession. Never: phone → global search → infer prospect.

## Identity model (read response)

| Field | Meaning |
|---|---|
| `prospectId` | Immutable Atlas prospect identity |
| `conversationId` | Thread/session when known (often null today) |
| `channelIdentityId` | Opaque id for a WhatsApp/phone/email identity |
| `normalizedAddress` | Internal only — not returned in API |
| `maskedAddress` | Public mask (`***7338`) |
| `validFrom` / `validTo` / `isCurrent` | Identity validity |
| `source` | Where the identity was resolved from |
| `verifiedAt` | Verification timestamp when known |

## Historical contact identity audit

| Source | Historical prior phone? |
|---|---|
| `prospects.phone` / `normalized_phone` | **Current only** — no prior-phone column |
| `atlas_core_prospects.primary_phone` / `secondary_phone` / `communication_channels` | Secondary exists; no dated prior-phone history |
| `conversation_logs.prospect_phone` | Phone-keyed transcript; no `prospect_id` |
| `workflow_events` / `whatsapp_outbound_deliveries` | Phone-keyed; no durable prior identity |
| `atlas_appointments.prospect_id` | Explicit link when present |
| Merge / dedup history | Core `merged_into_id` only — not a channel ledger |

**Conclusion for PR #22:** Historical channel identity does **not** exist as a canonical store. Old-phone history cannot be recovered reliably after a number change. Phone fallback is limited to the prospect’s **currently authorized** contact identities and marked `legacy_phone_correlation`.

## Correlation precedence

1. Explicit `prospect_id`
2. Conversation/thread linked to prospect (when available)
3. Appointment linked to prospect
4. Provider delivery linked to a prospect conversation log
5. Historical channel identity linked to prospect *(not available yet)*
6. Authorized current-phone fallback — flagged `legacy_phone_correlation`
7. Otherwise exclude + report in `dataQuality` / `gaps`

Phone match alone never overrides a conflicting `prospect_id`.

## Shared / recycled number safety

- Within-org shared phone → disable phone fallback
- Cross-org shared phone → allow org-scoped rows only; exclude null-`organization_id` phone rows
- Ambiguous or unlinked rows → excluded, counted in `dataQuality`
- Reassignment of a phone must not transfer old communications to a new prospect (no auto-merge)

## Response envelope

```json
{
  "prospect": {
    "id": "immutable-prospect-id",
    "displayName": "Juanito Garcia",
    "preferredLanguage": "en",
    "currentContact": {
      "channel": "whatsapp",
      "maskedAddress": "***7338"
    }
  },
  "channelIdentities": [],
  "items": [],
  "pagination": { "nextCursor": null, "hasMore": false },
  "dataQuality": {
    "legacyPhoneCorrelations": 0,
    "ambiguousRecordsExcluded": 0,
    "unlinkedRecordsExcluded": 0
  },
  "gaps": [],
  "sources": {}
}
```

## Follow-up (not in this PR)

Proposed durable table: `atlas_prospect_channel_identities`

Suggested fields: `id`, `organization_id`, `prospect_id`, `channel`, `normalized_address`, `provider_contact_id`, `valid_from`, `valid_to`, `is_current`, `verification_status`, `source`, `created_at`, `updated_at`.

Do not implement without explicit approval.

## Boundaries

- Read-only (no WhatsApp sends, no appointment mutations, no CE/parser changes)
- Express + service-role only
- Meta Review / BR-075 / migrations / Storage untouched
- No phone-keyed public Communications Center URL
