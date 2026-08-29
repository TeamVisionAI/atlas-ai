# BR-167 — Global burst and turn ordering

## Problem
Rapid WhatsApp messages can overlap while Recruit AI v2 is still authoring a prior turn. Atlas already has durable context-version protection and BR-166 pre-send coherence checks, but two gaps remained:

1. the short-fragment burst aggregator was keyed by sender phone only, so the same sender reaching different WhatsApp assets could share an in-memory burst;
2. when live v2 authoring timed out or failed technically, the communication hub could hand the same inbound to legacy CE, which can answer from a different/staler state model.

## Rules

1. Burst aggregation identity is scoped by the concrete receiving WhatsApp asset plus sender identity. Prefer `phone_number_id`, then WABA, never phone-only when an asset is available.
2. Rapid fragments on the same receiving asset and sender may aggregate into one logical inbound turn.
3. The same sender on different WhatsApp assets must never cross-aggregate.
4. After live Recruit AI v2 is eligible and authoritative for a turn, timeout or technical authoring loss is fail-closed after BR-125/126 appointment reclaim. The same inbound must not fall through to legacy CE.
5. BR-166 remains the final pre-send guard: if a newer durable context version wins before transport, the older v2 reply is suppressed.
6. No tenant, user, phone, city, or campaign is hardcoded.

## Expected burst behavior

Example fragments on the same WhatsApp number:

- `Orlando`
- `Florida`

Within the bounded burst window, Atlas evaluates `Orlando Florida` as one logical turn.

The same sender contacting two different Atlas WhatsApp assets is treated as two separate conversations.

## Failure behavior

If an overlapping v2 turn loses a durable context-version race, or v2 otherwise returns a technical/timeout authoring loss, Atlas does not ask legacy CE to answer that same inbound. Atlas stays silent for the losing turn and lets the newer durable turn remain authoritative.
