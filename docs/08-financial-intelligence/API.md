# Financial Intelligence API (RC3)

Base path: `/api/financial-intelligence`

All endpoints require authentication, organization tenant isolation, and `policy:read` / `policy:write` as noted.

| Method | Path | Permission | Purpose |
|--------|------|------------|---------|
| GET | `/` | policy:read | Module summary, assumptions, deferred capabilities |
| POST | `/evaluations` | policy:write | Create evaluation from PI `reviewId` |
| GET | `/evaluations/:evaluationId` | policy:read | Retrieve evaluation |
| GET | `/reviews/:reviewId/evaluations/latest` | policy:read | Latest non-superseded evaluation |
| GET | `/reviews/:reviewId/evaluations/history` | policy:read | Version history |
| PUT | `/evaluations/:evaluationId/term-quote` | policy:write | Representative-entered term quote (new revision) |
| PUT | `/evaluations/:evaluationId/investment-horizon` | policy:write | Investment horizon (new revision) |
| PUT | `/evaluations/:evaluationId/risk-profile` | policy:write | Risk-profile classification (new revision) |
| PUT | `/evaluations/:evaluationId/replacement-acknowledgement` | policy:write | Replacement acknowledgement (new revision) |
| POST | `/evaluations/:evaluationId/override` | policy:write | Documented outlay override (reason required) |
| POST | `/evaluations/:evaluationId/revisions` | policy:write | Explicit revision |

Material input changes always create a new version and mark the prior evaluation `SUPERSEDED`.
