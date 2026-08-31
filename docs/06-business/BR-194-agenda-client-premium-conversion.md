# BR-194 — Agenda CLIENT conversion with premium and KPI rollup

## AI Summary

When an Agenda appointment is closed with outcome = CLIENT, Atlas records an explicit incomplete conversion, immediately asks for premium, then promotes the Agenda contact to a Client and writes one canonical `atlas_client_production` row. Cancelling the premium modal leaves a visible “Client conversion incomplete” state with Resume / Complete Client Setup. KPIs read only that production table.

## Purpose

Stop leaving CLIENT outcomes in a hidden `promotionPending` state. Capture premium as structured production, not notes. Reuse BR-181 production instead of a parallel system.

## Status

Approved — V1 implemented.

## Business Rules

See [BUSINESS_RULES.md](./BUSINESS_RULES.md) BR-194.

Safe flow:

1. Record CLIENT intent (`clientConversionStatus=incomplete`)
2. Collect premium (numeric, >= 0) + currency + production date
3. Promote/create Client
4. Create or update the appointment-linked production row
5. Mark conversion complete

Outcome selection alone does not create production.

## Technical Notes

Migration `070_br194_agenda_client_production.sql` adds `appointment_id`, `currency`, and `source` to `atlas_client_production`. Manual BR-181 rows stay compatible (`appointment_id` null, `source=MANUAL`). Unique `(organization_id, appointment_id)` prevents duplicates.

KPI engine: `backend/core/clientProduction/productionKpiEngine.js`. Hierarchy rollups are always organization-scoped. Platform/global totals require SUPER_ADMIN and never run for a tenant role.
