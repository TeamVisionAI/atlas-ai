# Firm-Verified Securities Access — Bootstrap & Deployment

**Implements:** BR-074 · RC4 Milestone 1
**Permission:** `securities:verify` (explicit `user_permissions` grant only)
**Normal verification source:** `MANUAL_FIRM_VERIFICATION`
**Initial authority source:** `INITIAL_FIRM_AUTHORITY_BOOTSTRAP` (ops script only)

Atlas does **not** independently certify FINRA, CRD, or Primerica registration.
Exam completion alone is never sufficient.

---

## Important distinction

| Action | Mechanism |
|--------|-----------|
| Grant authority to verify **other** users | Explicit `user_permissions` row for `securities:verify` |
| Establish first authority’s own `VERIFIED_ACTIVE` row | **Phase A** controlled ops bootstrap only |
| Verify / renew / suspend others | **Phase B** Admin Users (requires `securities:verify`) |
| Modify one’s **own** securities authorization | **Never** via normal application routes |

Administrator and SUPER_ADMIN roles do **not** bypass self-verification prohibition.
The Admin Users UI never exposes self-verification.

---

## Deployment sequence (high level)

1. Merge BR-074 + migrations **026** and **027** + code.
2. Apply `026_securities_access_authorization.sql`.
3. Apply `027_securities_authority_bootstrap_lock.sql`.
4. Verify tables/indexes and that **zero** verifiers / authorizations exist.
5. Deploy backend + frontend.
6. Confirm users resolve as `UNKNOWN`; probe returns 403; generic FI works.
7. **Phase A** — run initial authority bootstrap (dry-run, then execute).
8. **Phase B** — Niovel (or designated authority) verifies other eligible users.
9. Production acceptance.

Do **not** seed Niovel or any verifier in migration 026/027.

---

## Phase A — Initial Authority Bootstrap

**Purpose:** Establish the first firm securities authority when no verifier exists above them.

For Team Vision, the intended initial authority is **Niovel**.

### What Phase A may do

1. Explicitly grant the target `securities:verify`.
2. Create the target’s initial `VERIFIED_ACTIVE` authorization.
3. Record evidence source / reference / date (metadata only).
4. Record the technical operator who executed the script.
5. Append authorization history and metadata-only audit events.
6. Insert an organization bootstrap **lock** (one-time).

### Preconditions (all required)

- Organization has **no** bootstrap lock row.
- Organization has **no** active `securities:verify` grant.
- Target has **no** current securities authorization row.
- Target belongs to the specified organization.
- Evidence source, evidence reference, evidence date, effective dates, product scope, reason, and technical actor are present.

### Evidence (compliance-determined)

Acceptable evidence categories (manual; no external scrape in this milestone):

- `INTERNAL_FIRM_REGISTRATION_RECORD`
- `CRD_DERIVED_FIRM_RECORD`
- `BROKERCHECK_CONFIRMATION`
- `WRITTEN_COMPLIANCE_CONFIRMATION`

Do **not** treat Series exam completion alone as sufficient.
Do **not** store registration document contents or unnecessary identifiers in logs.

### Script

`backend/scripts/bootstrapInitialSecuritiesAuthority.js`

One-time lock table: `atlas_organization_securities_authority_bootstrap` (migration 027).

Config file pattern (avoid secrets in shell history):

Keep the **real** bootstrap configuration **outside the repository**. Never commit completed configs, evidence references, or user UUIDs. After execution, delete the config or retain it only under firm compliance policy for secure storage.

```bash
# 1) Copy example to a secure path OUTSIDE the repo and fill offline
cp backend/scripts/securities-authority-bootstrap.example.json /secure/path/tv-securities-bootstrap.json
# Edit organizationId, targetUserId, evidence*, scopes, reason, technicalActor

# 2) Dry-run (default — no writes)
node -r dotenv/config backend/scripts/bootstrapInitialSecuritiesAuthority.js \
  --config /secure/path/tv-securities-bootstrap.json

# 3) Execute only after dry-run review
CONFIRM_SECURITIES_AUTHORITY_BOOTSTRAP=yes \
node -r dotenv/config backend/scripts/bootstrapInitialSecuritiesAuthority.js \
  --config /secure/path/tv-securities-bootstrap.json \
  --execute

# 4) Delete or securely retain the config per firm policy — do not commit it
```

### After Phase A

- Target can verify **other** users (`canVerifySecuritiesAuthorization: true`).
- Target has content access if `VERIFIED_ACTIVE` window is valid (`canAccessSecuritiesContent: true`).
- Target **cannot** modify their own authorization via Admin Users / HTTP (`SELF_VERIFICATION_FORBIDDEN`).
- Future changes to the authority’s own row require another explicit verifier or a separate controlled procedure.
- Other administrators remain unable to verify unless explicitly granted `securities:verify`.
- Re-running Phase A is refused (`BOOTSTRAP_ALREADY_COMPLETED`).

---

## Phase B — Normal Operations

1. Designated authority (e.g. Niovel) verifies eligible registered representatives via Admin Users.
2. Only users with an explicit `securities:verify` grant see/edit securities authorization controls.
3. Self-verification remains forbidden for everyone, including the initial authority.
4. Expiration, suspension, restriction, termination, or revocation removes securities content access immediately.
5. Generic FI (premiums, ITD, 4%/7%/10%) remains available without named securities.

### Granting additional verifiers (optional)

Still explicit `user_permissions` only — never `role_permissions`. Prefer a second human verifier once available so the initial authority’s own row can be renewed without a special procedure.

```sql
INSERT INTO user_permissions (user_id, permission_code, granted, granted_by, reason, expires_at)
VALUES (
  '<VERIFIER_USER_UUID>',
  'securities:verify',
  true,
  '<GRANTER_USER_UUID>',
  'BR-074 designated firm securities verifier',
  NULL
)
ON CONFLICT (user_id, permission_code) DO UPDATE
SET granted = EXCLUDED.granted,
    granted_by = EXCLUDED.granted_by,
    reason = EXCLUDED.reason,
    expires_at = EXCLUDED.expires_at;
```

### Revoking verifier authority

```sql
UPDATE user_permissions
SET granted = false, reason = 'BR-074 verifier grant revoked'
WHERE user_id = '<VERIFIER_USER_UUID>'
  AND permission_code = 'securities:verify';
```

---

## Runtime rules (summary)

| Capability | Requirement |
|------------|-------------|
| Access named securities content | `VERIFIED_ACTIVE` + complete verification metadata + effective window |
| Verify others | Explicit org-scoped `securities:verify` user grant |
| Self-verify via app | Never |
| Initial authority when none exists | Phase A ops script only |

---

## Rollback

- App rollback: redeploy prior revision.
- Data: `027_*_down.sql` then `026_*_down.sql` only with explicit compliance approval (destroys bootstrap lock + authorizations).

---

## Remaining compliance decision

Team Vision / Primerica compliance must confirm which evidence category and evidence reference label will be used for Niovel’s Phase A bootstrap **before** `--execute`. Atlas records the firm’s attestation; it does not replace supervisory diligence.
