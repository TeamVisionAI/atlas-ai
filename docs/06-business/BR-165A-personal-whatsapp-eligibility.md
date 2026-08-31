# BR-165A — Personal WhatsApp connection is routing, not automation eligibility

Atlas must treat a user-owned/personal WhatsApp connection as an ownership and routing signal only.

A personal WhatsApp inbound must not become eligible for Atlas automation solely because it arrived on a personal connection or because the prospect row stores `PERSONAL_WHATSAPP` as its entry/source.

Atlas may auto-reply only when positive Atlas eligibility exists, including a verified CTWA ad referral, verified QR attribution, valid active campaign intake code, explicit `atlasAutomationEnabled=true`, a still-active continuation whose persisted eligibility source was earned from one of those verified paths, or BR-193 Meta Ad Destination fallback on an explicitly configured connection.

Ordinary personal contacts may remain visible in the owner's human workspace, but Atlas must stay silent.

This rule is global across all tenants and users. It must not contain Team Vision, Team Legacy, Misleisys, Niovel, phone-number, or organization-specific exceptions.
