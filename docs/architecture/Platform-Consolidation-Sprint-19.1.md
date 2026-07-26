# Platform Consolidation — Sprint 19.1

**Status:** Complete  
**Type:** Focused tenant-isolation remediation (not a feature sprint)

---

## Problem Statement

Independent Sprint 19 verification found four remaining authenticated-path tenant violations:

1. Unscoped `findProspect(phone)` on user-facing read chains
2. Mission Control GET route bypassed organization-aware request handler
3. Prospect Workspace frontend still used localStorage workflow gate fallback
4. No automated negative cross-organization access tests

Sprint 19.1 closes these gaps without redesigning Atlas or expanding WhatsApp migration scope.

---

## Defects Corrected

| Defect | Fix |
|--------|-----|
| `agentActionApplicationService` unscoped lookups | `resolveTenantProspect()` requires `organizationId` on tenant paths |
| Mission Control route unscoped assembly | Wired `getMissionControlWithActionsForRequest(req, phone)` + `organizationGuard()` |
| `missionControlReadModel.resolveProspect()` fallback | Requires org on tenant paths; uses `findProspectForSystemIngress` only for system ingress |
| `prospectWorkspaceReadModel` unscoped re-fetch | Organization-scoped via `findProspectInOrganization()` |
| Quick Capture global deduplication | `findProspectByNormalizedPhoneInOrganization(normalizedPhone, organizationId)` |
| Frontend gate fallback | `Boolean(workspace?.workflowGate?.active)` only |
| Missing negative tests | `backend/test/sprint19_1.test.js` + `verifySprint19_1.js` |

---

## Organization-Scoped Lookup Contract

For every **authenticated user-facing path**:

| Allowed | Forbidden |
|---------|-----------|
| `organizationId + prospectId` | `phone` alone |
| `organizationId + normalizedPhone` | Browser-supplied org for normal users |

Helpers:

- `findProspectInOrganization(phone, organizationId)` — tenant-scoped user lookup
- `findProspectByNormalizedPhoneInOrganization(normalizedPhone, organizationId)` — Quick Capture dedup
- `findProspectForSystemIngress(phone)` — **Legacy system-ingress only** (WhatsApp inbound)

Organization context comes from authenticated session + `organizationGuard()` / `getTenantOrganizationId(req)`.

Missing organization on tenant-scoped calls throws `TenantOrganizationRequiredError`.

---

## Mission Control Request Flow

```
GET /api/mission-control/:phone
  → requireAtlasUser
  → organizationGuard()
  → requireLegacyProspectAccess()   // org + phone
  → getMissionControlWithActionsForRequest(req, phone)
  → getMissionControlWithActions(phone, { organizationId, tenantScoped: true })
  → getMissionControlState(phone, { organizationId, tenantScoped: true })
  → findProspectInOrganization(phone, organizationId)
  → response
```

Post-action refresh paths (interview outcome, conversation outcome, required information) pass the same tenant options.

---

## Prospect Workspace Backend Authority

- Orchestration: `prospectWorkspaceApplicationService.js`
- Composition: `prospectWorkspaceReadModel.js` (no application imports)
- Route: `buildProspectWorkspaceForRequest(req, phone)`

Frontend rule:

```javascript
const showGate = Boolean(workspace?.workflowGate?.active);
```

`localStorage` may remain for non-authoritative UI continuity writes only. It is **not** read for gate decisions.

---

## Quick Capture Tenant Deduplication

Duplicate detection is scoped to the authenticated user's organization:

- Same phone in Org A and Org B → separate records allowed
- Same phone twice in Org A → existing duplicate behavior (409)
- Phone normalization preserved

---

## Negative Tenant Tests

`backend/test/sprint19_1.test.js` asserts:

- Org A cannot resolve Org B prospect via tenant-scoped Mission Control
- Org A `requireLegacyProspectAccess` denies Org B phone (404/403)
- Org B middleware allows its own phone
- Quick Capture duplicate within org vs cross-org separation
- Wiring and backend-authority static checks

---

## Intentional WhatsApp Exception

`findProspectForSystemIngress(phone)` remains for inbound WhatsApp and dev/system paths where organization routing is handled separately. **Do not use for authenticated tenant routes.**

Comment marker in code:

```javascript
// Legacy system-ingress lookup. Do not use for authenticated tenant routes.
```

---

## Remaining Technical Debt

- Dual mission priority systems (`prioritizedWorkflowQueue` vs `/api/missions`) — unchanged
- JSON workflow state migration — unchanged
- WhatsApp multi-tenant routing — out of scope
- `prospectWorkspaceProfileEngine` still uses unscoped `findProspect` on PATCH language (pre-existing; not on Sprint 19.1 defect list)

---

## Verification

```bash
node backend/dev/verifySprint19_1.js
npm test
```

Regression:

```bash
node backend/dev/verifySprint18_2.js
node backend/dev/verifySprint18_3.js
node backend/dev/verifySprint19.js
```
