# RC4 M1 — Placeholder Fund Catalog Containment Hotfix

**UTC:** 2026-08-05  
**Branch:** `hotfix/rc4-m1-suppress-placeholder-fund-catalog`  
**Business rule:** BR-074 (access semantics unchanged; catalog release gate added)  
**Final status (pre-merge):** HOTFIX READY TO MERGE (pending PR checks)

## Root cause

`GET /api/financial-intelligence` attached `fundCatalog` from `getModuleSummary()` whenever `canAccessSecuritiesContent` was true. After Phase A bootstrap made Niovel `VERIFIED_ACTIVE`, the non-production placeholder catalog (FELAX, VAFAX, VADAX, EPGAX, ACEIX, SBLGX) was returned on the live API.

## Containment design

Canonical gate: `canExposeVerifiedFundCatalog()` in `backend/security/verifiedFundCatalogGate.js`.

- Requires `canAccessSecuritiesContent === true` **and** an approved active authoritative catalog release.
- Current release readiness flags are all false → **fail closed for everyone**.
- Live `getModuleSummary()` omits `fundCatalog` by default (`namedFundCatalogActive: false`).
- Placeholder config retained as `NON_PRODUCTION_PLACEHOLDER` only (not live API contract).

## Securities authority (unchanged)

| Item | Expected after hotfix |
|------|------------------------|
| Niovel `securities:verify` grant | Retained |
| Niovel `VERIFIED_ACTIVE` auth | Retained |
| Bootstrap lock | Retained |
| Self-verification forbidden | Retained |
| Verify-other capability | Retained |
| Probe 200 for verified authority | Retained |
| `canAccessSecuritiesContent` | Still true for Niovel |
| `canVerifySecuritiesAuthorization` | Still true for Niovel |

## Test residue (Phase A verify-other acceptance)

| Field | Value |
|-------|--------|
| User ID | `5ace4c1b-6329-49ac-9d63-bfb38da106a1` |
| Email | `review@teamvisionfinancial.com` |
| Role | `recruiter` |
| Identity | Meta Reviewer (designated Meta Review / acceptance account) |
| Authorization | One `TERMINATED` row (`PHASE_A_POSTVERIFY_CLEANUP`) |
| History | Two immutable rows (created → PENDING_VERIFICATION; revoked → TERMINATED) |
| Verifier grant | None |

**Assessment:** Intentional production acceptance residue. **Retain** authorization history and audit events. Do **not** hard-delete. No further cleanup required for counts.

## Boundary statement

> VERIFIED_ACTIVE authorizes access to approved securities content, but no named fund catalog is approved or active in the current release.
