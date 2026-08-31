# BR-193 — Meta Ad Destination fallback eligibility

## AI Summary

When Meta Cloud API omits `message.referral` and `ctwa_clid` on a legitimate Facebook/Instagram Click-to-WhatsApp lead, Atlas may still promote and auto-reply **only** if the exact receiving WhatsApp connection is CONNECTED and explicitly marked as a Meta ad destination. Ordinary personal inbound stays fail-closed.

## Purpose

Support real Meta ad traffic that WhatsApp UI labels as ad-origin, without making every personal-agent inbound eligible.

## Status

Approved — V1 implemented.

## Business Rules

See [BUSINESS_RULES.md](./BUSINESS_RULES.md) BR-193.

Eligibility priority remains:

1. Positive CTWA referral / `ctwa_clid`
2. QR / pending inbound match
3. Valid campaign intake code
4. Stored Atlas automation origin / existing eligible prospect
5. Explicit Meta Ad Destination connection fallback
6. Otherwise fail closed

Fallback requirements:

- Connection status `connected`
- Exact inbound `phone_number_id` resolves to that connection
- `metaAdDestinationAutomationEnabled = true`
- `owner_user_id` resolves from the connection owner
- Organization resolves from the same connection
- Brand-new unknown sender may be promoted and assigned to that owner
- Outbound uses the same personal connection credentials (no org token/phone, no RVP fallback)
- Do not infer from greeting text or `from_user_id`

Observability: `eligibilityReason = AD_DESTINATION_FALLBACK_NO_CTWA_METADATA`.

## Technical Notes

Setting lives on `whatsapp_integrations.meta_ad_destination_automation_enabled` (default `false`). UI copy: “Use this number for Meta ad automation”, with a warning that unknown inbound may become Atlas leads.

Provenance is `META_AD_DESTINATION`. Atlas must not invent `ctwa_clid` or Meta `referral`.
