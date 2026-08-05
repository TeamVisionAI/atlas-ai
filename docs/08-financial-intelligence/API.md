# Financial Intelligence API (RC3 Phase B)

Base path: `/api/financial-intelligence`

All endpoints require authentication, organization tenant isolation (from auth context — never trusted from body), and `policy:read` / `policy:write` as noted.

## Endpoints

| Method | Path | Permission | Purpose |
|--------|------|------------|---------|
| GET | `/` | policy:read | Module summary, assumptions, deferred capabilities |
| POST | `/evaluations` | policy:write | Create evaluation from PI `reviewId` (term quote optional) |
| GET | `/evaluations/:evaluationId` | policy:read | Retrieve evaluation |
| GET | `/reviews/:reviewId/evaluations/latest` | policy:read | Latest non-superseded evaluation |
| GET | `/reviews/:reviewId/evaluations/history` | policy:read | Version history |
| PUT | `/evaluations/:evaluationId/term-quote` | policy:write | Representative-entered term quote (new revision) |
| PUT | `/evaluations/:evaluationId/investment-horizon` | policy:write | Investment horizon (new revision) |
| PUT | `/evaluations/:evaluationId/risk-profile` | policy:write | Risk-profile classification (new revision) |
| PUT | `/evaluations/:evaluationId/replacement-acknowledgement` | policy:write | Replacement acknowledgement (new revision) |
| POST | `/evaluations/:evaluationId/override` | policy:write | Documented outlay override (reason required) |
| POST | `/evaluations/:evaluationId/revisions` | policy:write | Explicit revision |

Organization ID and actor identity come from authenticated context only.

## Canonical response contract

Successful create/get/update responses return `{ evaluation }` where `evaluation` is the **frontend-safe contract** (`buildFrontendContract`):

| Field | Notes |
|-------|--------|
| `id`, `version`, `isCurrentVersion` | Versioning |
| `evaluationFamilyId`, `reviewId`, `sourceFactVersion` | Linkage |
| `sectionTitle`, `status`, `strategyKey` | Display / readiness |
| `currentIulSnapshot`, `currentIulMonthlyPremium`, `currentIulDeathBenefit` | FI-owned snapshot |
| `termQuote`, `proposedTerm*`, `premiumSource`, quote/eligibility confirmation | Representative inputs |
| `sameDeathBenefit` | Default true; false = explicit adjustment |
| `totalProposedMonthlyOutlay`, `unboundedPremiumDifference`, `monthlyInvestmentDifference`, `proposedMutualFundContribution`, `outlayValidation` | Backend math |
| `investmentHorizon`, `projectionAssumptions`, `projectionOutputs` | Horizon + projections |
| `riskProfile`, `scenarioEmphasis` | Emphasis gate (not suitability) |
| `comparisonTable`, `talkingPoints`, `disclaimers` | Display |
| `missingDataWarnings`, `replacementWarnings`, `replacementAcknowledged` | Safeguards |
| `representativeOverride`, `overrideReason` | Overrides |
| `supersededBy`, `createdBy`, `updatedBy`, `createdAt`, `updatedAt` | Audit |
| `metadata.calculationAuthority` | Always `"backend"` |
| `metadata.frontendMayRecalculate` | Always `false` |

The UI must not reconstruct business rules from raw persistence columns.

## Frontend localization contract (RC4 M1.1)

- `status` codes, scenario `id`s, and known English warning/disclaimer strings are mapped to EN/ES presentation strings in `frontend/src/i18n/fiReportMessages.js`.
- Historical evaluations are **not** rewritten for localization. Numeric fields remain backend-authoritative.
- `Accept-Language` / UI language must not change calculations, create revisions, or restore securities-restricted fields such as `fundCatalog` for unverified users.
- Report title displayed to users uses the localized FI dictionary (not a recalculated `sectionTitle`).

## Validation (selected)

- Negative premiums rejected  
- Invalid / non-positive horizons rejected  
- Unsupported premium-source / risk-profile enums rejected  
- Override without reason rejected  

## Security notes

- Cross-tenant review or evaluation IDs return not-found style errors (no org ownership leakage).  
- Quote notes and override reasons are only on authorized FI endpoints.  
- PI shared reports must not include FI strategy payloads.  
- Prefer not logging full premium/death-benefit payloads in application logs.
