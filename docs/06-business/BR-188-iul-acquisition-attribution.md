# BR-188 — IUL Acquisition Attribution V1

Status: V1 implemented.

## Goal

Connect a policy-review lead to its actual marketing source so Atlas can answer which campaign, ad, or creative produced the review, appointment, application, placed case, and estimated commission.

Builds on BR-186. Does not redesign the policy-review pipeline.

## Current architecture reused

- **BR-186 pipeline** (`atlas_policy_review_pipeline`) already stores first-touch `source`, `campaign`, ad/adset/creative IDs, and `campaign_intake_code`.
- **BR-147 Campaign Intake Codes** resolve org + WhatsApp phone number ID + purpose. `IUL` / `IUL_REVIEW` is policy-review eligible and never recruiting eligible.
- **Meta CTWA** is parsed by `extractClickToWhatsAppReferral` and is complementary evidence, not required.
- **BR-129 QR first-touch** remains on recruiting `lead_source`. IUL attribution does not write recruiting `lead_source` as SoT.

## Design

One attribution engine (`policyReviewAttribution`) merges touches onto the existing pipeline row:

- First valid acquisition source locks **first touch**.
- Later valid sources update **latest touch** only.
- Events that omit attribution do not erase a confirmed source.
- Intake code alone is valid. CTWA + intake keeps both.
- Denormalized list/filter columns always reflect first touch.
- Raw provider IDs and CTWA metadata live in `acquisition` JSONB.
- Spend / CPL / ROAS stay `null` so a later spend BR can attach without reshaping the model.

IUL intake (`establishInboundAttribution`) still writes policy-review workflow context and now **creates or links** a pipeline row when a client can be resolved (existing phone match or a thin org-scoped client). It never sets recruiting eligibility or Recruit AI routing.

## Migration

`backend/database/migrations/068_br188_policy_review_acquisition.sql` (+ down).

Adds `source_platform`, campaign/ad/creative names, landing/form source, UTMs, `first_touch_at`, `latest_touch_at`, and `acquisition` JSONB. No new identity table.

## APIs / read model

- List / create / detail already carry attribution; list accepts `platform`, `campaign`, `source`, `intakeCode`, `language`, `state`.
- `GET /api/policy-reviews/acquisition-metrics?groupBy=campaign|platform|ad|creative|intakeCode|owner|language|state`

Metrics per group: review leads, qualified reviews, appointments booked, reviews completed, replacement opportunities, applications submitted, placed policies, monthly premium, annualized premium, estimated commission. `adSpend`, `costPerLead`, and `roas` are present and null.

Access: mine / authorized team / control-plane empty / Support Mode tenant-bound.

## UI

`/app/policy-reviews`: friendly Source badge, campaign, optional ad/creative, platform/campaign/source filters. Selecting a row opens an **Acquisition** section with first touch and latest touch. No marketing dashboard.

## Out of scope

Meta Ads spend import, TikTok Ads API, automatic ad creation, CRM replacement, marketing content calendar, OCR/policy analysis, automatic replacement recommendations, recruiting changes.
