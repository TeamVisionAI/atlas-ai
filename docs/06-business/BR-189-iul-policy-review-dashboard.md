# BR-189 — IUL / Policy Review Dashboard V1

Status: V1 implemented.

## Goal

Give Policy Reviews an operational/revenue dashboard on the existing `/app/policy-reviews` page so Atlas can answer how many leads, qualifications, appointments, completed reviews, explicit replacements, applications, and placed cases a tenant has — and which campaign, source, or agent produced the estimated commission.

Builds on BR-186 and BR-188. Does not add a marketing dashboard page or a second sidebar item.

## Ownership

Dashboard | Pipeline toggle on `/app/policy-reviews`. KPI / funnel / attribution / needs-action rows drill into the same pipeline list with existing filters.

## Read model

`GET /api/policy-reviews/dashboard` composes:

- BR-188 `aggregateAcquisitionMetrics` for KPI totals and group-by performance
- Funnel counts + conversion % from those totals
- Current-stage needs-action counts from the same scoped rows
- Date range via BR-079 tenant timezone (`today`, `7d`, `30d`, `this_month`, `last_month`, `custom`, `all`)

`GET /api/policy-reviews` and `GET /api/policy-reviews/acquisition-metrics` accept the same `range` / `from` / `to` filters.

No migration. No new revenue table. Commission math stays in `policyReviewPipeline/calculations.js`.

## Spend

`adSpend`, `costPerLead`, and `roas` remain null and are not shown.

## Out of scope

Meta/TikTok spend import, recruiting changes, WhatsApp routing, OCR/policy analysis, automatic replacement recommendations, a second task engine.
