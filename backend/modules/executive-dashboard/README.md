# Executive Dashboard Read Model

Sprint 15.1 — projection-backed analytical read model derived exclusively from Business Events.

## Purpose

Executive Dashboard provides organization-level analytics (funnel, conversion, trends, KPIs, agent productivity) without querying the Prospect write model.

## Architecture

```
Business Event published
  → ProjectionEngine.dispatch()
    → ExecutiveDashboardProjection.handle()
      → ExecutiveDashboardRepository.applyEvent()
```

## Metrics

| Area | Description |
|------|-------------|
| Lead source distribution | Count by `leadSource.sourceType` from `prospect_created` |
| Recruiting funnel | Prospects reaching each lifecycle stage |
| Prospect conversion | Leads → qualified → interview → completion rates |
| Assignment metrics | Total and per-agent assignment counts |
| Interview completion | Scheduled vs completed with completion rate |
| Production trends | Daily / weekly / monthly event buckets |
| KPIs | Daily / weekly / monthly operational KPIs |
| Agent productivity | Assignments, interviews, leads per agent |
| Organization summary | Active prospects, event totals, last event |

## REST API (read-only)

| Method | Path |
|--------|------|
| GET | `/api/executive-dashboard` |
| GET | `/api/executive-dashboard/summary` |
| GET | `/api/executive-dashboard/trends` |
| GET | `/api/executive-dashboard/kpis` |

Legacy gateway summary route remains mounted after projection routes.

## Verification

```bash
node backend/dev/verifyExecutiveDashboardProjection.js
```
