/**
 * RC4 Milestone 1 — Firm-Verified Securities Access Foundation (BR-074)
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { hasExplicitUserPermission } = require("../security/explicitUserPermissionService");
const {
  canAccessSecuritiesContent,
  canVerifySecuritiesAuthorization,
  getSecuritiesAccessSummary,
  upsertSecuritiesAuthorization,
  hasCompleteVerificationMetadata,
  isWithinEffectiveWindow,
  SECURITIES_ACCESS_STATUS,
  VERIFICATION_SOURCE
} = require("../security/securitiesAccessService");
const {
  CONTENT_ACCESS_CLASS,
  SB72_DEFAULT_CLASSIFICATION,
  canAccessContentClass
} = require("../security/contentAccessClassification");
const { PERMISSIONS, ROLE_PERMISSIONS, roleHasPermission } = require("../security/permissions");
const { ROLES } = require("../security/roles");
const {
  getFundCatalog,
  buildInvestTheDifferenceEvaluation,
  buildCurrentIulSnapshot,
  listProjectionScenarios,
  PREMIUM_SOURCES,
  RISK_PROFILES
} = require("../modules/financial-intelligence");
const { sanitizeUser } = require("../services/atlasUserService");

const ORG_A = "00000000-0000-4000-8000-000000000001";
const ORG_B = "00000000-0000-4000-8000-000000000002";
const ACTOR = "00000000-0000-4000-8000-0000000000a1";
const TARGET = "00000000-0000-4000-8000-0000000000b1";

function verifiedRow(overrides = {}) {
  return {
    id: "00000000-0000-4000-8000-0000000000c1",
    organization_id: ORG_A,
    user_id: TARGET,
    securities_access_status: SECURITIES_ACCESS_STATUS.VERIFIED_ACTIVE,
    verification_source: VERIFICATION_SOURCE.MANUAL_FIRM_VERIFICATION,
    verified_by: ACTOR,
    verified_at: "2026-01-01T00:00:00.000Z",
    effective_from: "2026-01-01T00:00:00.000Z",
    effective_to: "2027-01-01T00:00:00.000Z",
    permitted_product_scope: ["MUTUAL_FUNDS"],
    principal_scope: [],
    deleted_at: null,
    ...overrides
  };
}

test("missing authorization row fails closed as UNKNOWN summary", async () => {
  const summary = await getSecuritiesAccessSummary(
    { userId: TARGET, organizationId: ORG_A },
    { findAuthorization: async () => null }
  );

  assert.equal(summary.securities_access_status, "UNKNOWN");
  assert.equal(summary.securities_access_verified, false);
  assert.equal(summary.canAccessSecuritiesContent, false);
});

const DENIED_STATUSES = [
  "UNKNOWN",
  "NOT_REGISTERED",
  "PENDING_VERIFICATION",
  "RESTRICTED",
  "SUSPENDED",
  "EXPIRED",
  "TERMINATED"
];

for (const status of DENIED_STATUSES) {
  test(`${status} cannot access securities content`, async () => {
    const allowed = await canAccessSecuritiesContent(
      { userId: TARGET, organizationId: ORG_A },
      {
        now: new Date("2026-06-01T00:00:00.000Z"),
        findAuthorization: async () =>
          verifiedRow({ securities_access_status: status })
      }
    );
    assert.equal(allowed, false);
  });
}

test("VERIFIED_ACTIVE within effective window can access", async () => {
  const allowed = await canAccessSecuritiesContent(
    { userId: TARGET, organizationId: ORG_A },
    {
      now: new Date("2026-06-01T00:00:00.000Z"),
      findAuthorization: async () => verifiedRow()
    }
  );
  assert.equal(allowed, true);
});

test("VERIFIED_ACTIVE with incomplete verification fields fails closed", async () => {
  const allowed = await canAccessSecuritiesContent(
    { userId: TARGET, organizationId: ORG_A },
    {
      now: new Date("2026-06-01T00:00:00.000Z"),
      findAuthorization: async () =>
        verifiedRow({ verified_by: null, verified_at: null, verification_source: null })
    }
  );
  assert.equal(allowed, false);
  assert.equal(
    hasCompleteVerificationMetadata(verifiedRow({ verified_by: null })),
    false
  );
});

test("VERIFIED_ACTIVE past effective_to fails closed", async () => {
  const row = verifiedRow({ effective_to: "2026-02-01T00:00:00.000Z" });
  assert.equal(isWithinEffectiveWindow(row, new Date("2026-06-01T00:00:00.000Z")), false);

  const allowed = await canAccessSecuritiesContent(
    { userId: TARGET, organizationId: ORG_A },
    {
      now: new Date("2026-06-01T00:00:00.000Z"),
      findAuthorization: async () => row
    }
  );
  assert.equal(allowed, false);
});

test("requested product/principal scope must be satisfied", async () => {
  const denyProduct = await canAccessSecuritiesContent(
    { userId: TARGET, organizationId: ORG_A },
    {
      now: new Date("2026-06-01T00:00:00.000Z"),
      requiredProductScope: "VARIABLE_ANNUITIES",
      findAuthorization: async () => verifiedRow({ permitted_product_scope: ["MUTUAL_FUNDS"] })
    }
  );
  assert.equal(denyProduct, false);

  const denyPrincipal = await canAccessSecuritiesContent(
    { userId: TARGET, organizationId: ORG_A },
    {
      now: new Date("2026-06-01T00:00:00.000Z"),
      requiredPrincipalScope: "SERIES_24",
      findAuthorization: async () => verifiedRow({ principal_scope: [] })
    }
  );
  assert.equal(denyPrincipal, false);
});

test("administrator / SUPER_ADMIN without explicit grant cannot verify", async () => {
  for (const role of ["administrator", "ADMIN", "SUPER_ADMIN"]) {
    const allowed = await canVerifySecuritiesAuthorization(
      { userId: ACTOR, organizationId: ORG_A, role },
      {
        hasExplicitPermission: async () => false
      }
    );
    assert.equal(allowed, false, `${role} must not verify without explicit grant`);
  }
});

test("explicit grant enables verify; wrong org / expired / deny do not", async () => {
  const base = {
    organizationId: ORG_A,
    userId: ACTOR,
    permissionCode: "securities:verify",
    now: new Date("2026-06-01T00:00:00.000Z")
  };

  assert.equal(
    await hasExplicitUserPermission({
      ...base,
      loadUserOrganizationId: async () => ORG_A,
      loadUserPermissions: async () => [{ permission_code: "securities:verify", granted: true }]
    }),
    true
  );

  assert.equal(
    await hasExplicitUserPermission({
      ...base,
      organizationId: ORG_B,
      loadUserOrganizationId: async () => ORG_A,
      loadUserPermissions: async () => [{ permission_code: "securities:verify", granted: true }]
    }),
    false
  );

  assert.equal(
    await hasExplicitUserPermission({
      ...base,
      loadUserOrganizationId: async () => ORG_A,
      loadUserPermissions: async () => [
        {
          permission_code: "securities:verify",
          granted: true,
          expires_at: "2026-01-01T00:00:00.000Z"
        }
      ]
    }),
    false
  );

  assert.equal(
    await hasExplicitUserPermission({
      ...base,
      loadUserOrganizationId: async () => ORG_A,
      loadUserPermissions: async () => [
        { permission_code: "securities:verify", granted: true },
        { permission_code: "securities:verify", granted: false }
      ]
    }),
    false
  );
});

test("no role matrix includes securities:verify", () => {
  assert.equal(PERMISSIONS.SECURITIES_VERIFY, "securities:verify");

  for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
    assert.equal(
      perms.includes(PERMISSIONS.SECURITIES_VERIFY),
      false,
      `${role} must not receive securities:verify`
    );
  }

  assert.equal(roleHasPermission(ROLES.ADMINISTRATOR, PERMISSIONS.SECURITIES_VERIFY), false);
  assert.equal(roleHasPermission(ROLES.RVP, PERMISSIONS.SECURITIES_VERIFY), false);
  assert.equal(roleHasPermission(ROLES.AGENT, PERMISSIONS.SECURITIES_VERIFY), false);
});

test("migration 026 seeds zero verifiers and no role_permissions grant", () => {
  const migrationPath = path.join(
    __dirname,
    "../database/migrations/026_securities_access_authorization.sql"
  );
  const sql = fs.readFileSync(migrationPath, "utf8");

  assert.match(sql, /securities:verify/);
  assert.doesNotMatch(sql, /INSERT INTO role_permissions[\s\S]*securities:verify/i);
  assert.doesNotMatch(sql, /INSERT INTO user_permissions/i);
  assert.match(sql, /atlas_user_securities_authorization/);
  assert.match(sql, /atlas_user_securities_authorization_history/);
});

test("self-verification is rejected by upsert service", async () => {
  await assert.rejects(
    () =>
      upsertSecuritiesAuthorization(
        ACTOR,
        { securities_access_status: "VERIFIED_ACTIVE" },
        { userId: ACTOR, organizationId: ORG_A, email: "admin@example.com" }
      ),
    (error) => {
      assert.equal(error.publicCode, "SELF_VERIFICATION_FORBIDDEN");
      assert.equal(error.statusCode, 403);
      return true;
    }
  );
});

test("verification permission does not unlock securities content for the verifier", async () => {
  const canVerify = await canVerifySecuritiesAuthorization(
    { userId: ACTOR, organizationId: ORG_A },
    { hasExplicitPermission: async () => true }
  );
  assert.equal(canVerify, true);

  const canAccess = await canAccessSecuritiesContent(
    { userId: ACTOR, organizationId: ORG_A },
    { findAuthorization: async () => null }
  );
  assert.equal(canAccess, false);
});

test("VERIFIED_ACTIVE status does not grant authority to verify others", async () => {
  const canAccess = await canAccessSecuritiesContent(
    { userId: TARGET, organizationId: ORG_A },
    {
      now: new Date("2026-06-01T00:00:00.000Z"),
      findAuthorization: async () => verifiedRow()
    }
  );
  assert.equal(canAccess, true);

  const canVerify = await canVerifySecuritiesAuthorization(
    { userId: TARGET, organizationId: ORG_A },
    { hasExplicitPermission: async () => false }
  );
  assert.equal(canVerify, false);
});

test("session sanitizeUser remains free of sensitive licensing fields; capabilities are separate", () => {
  const dto = sanitizeUser({
    id: TARGET,
    email: "rep@example.com",
    first_name: "Rep",
    last_name: "User",
    role: "recruiter",
    status: "active",
    organization_id: ORG_A,
    profile_settings: { meta_review_user: false }
  });

  assert.equal(dto.meta_review_user, false);
  assert.equal(Object.prototype.hasOwnProperty.call(dto, "status_reason"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(dto, "supervisory_restrictions"), false);
});

test("content classification foundation and SB-72 defaults", () => {
  assert.equal(SB72_DEFAULT_CLASSIFICATION.accessClass, CONTENT_ACCESS_CLASS.SECURITIES_REGISTERED_ONLY);
  assert.equal(SB72_DEFAULT_CLASSIFICATION.visibility, "INTERNAL_ONLY");

  assert.equal(
    canAccessContentClass(CONTENT_ACCESS_CLASS.INSURANCE, { canAccessSecuritiesContent: false }),
    true
  );
  assert.equal(
    canAccessContentClass(CONTENT_ACCESS_CLASS.SECURITIES_REGISTERED_ONLY, {
      canAccessSecuritiesContent: false
    }),
    false
  );
  assert.equal(
    canAccessContentClass(CONTENT_ACCESS_CLASS.SECURITIES_PRINCIPAL_ONLY, {
      canAccessSecuritiesContent: true,
      isPrincipal: false
    }),
    false
  );
  assert.equal(
    canAccessContentClass(CONTENT_ACCESS_CLASS.SECURITIES_PRINCIPAL_ONLY, {
      canAccessSecuritiesContent: true,
      isPrincipal: true
    }),
    true
  );
});

test("generic FI 4%/7%/10% remains available without named securities", () => {
  const scenarios = listProjectionScenarios();
  const rates = scenarios.map((row) => row.annualReturn).sort((a, b) => a - b);
  assert.deepEqual(rates, [0.04, 0.07, 0.1]);

  const snapshotResult = buildCurrentIulSnapshot(
    {
      layer: "insurance_facts",
      immutable: true,
      productType: "Indexed Universal Life",
      faceAmount: 250000,
      premium: { amount: 173, frequency: "monthly", currency: "USD" }
    },
    { sourceReviewId: "review-1" }
  );

  const evaluation = buildInvestTheDifferenceEvaluation({
    snapshotResult,
    termQuoteInput: {
      deathBenefit: 250000,
      termDurationYears: 20,
      monthlyPremium: 116.92,
      premiumSource: PREMIUM_SOURCES.REPRESENTATIVE_CONFIRMED,
      longestAvailableTermConfirmed: true,
      representativeConfirmed: true
    },
    investmentHorizon: { years: 25, confirmed: true },
    riskProfile: RISK_PROFILES.MODERATE,
    replacementAcknowledged: true
  });

  const serialized = JSON.stringify(evaluation);
  assert.ok(evaluation.calculations.monthlyInvestmentDifference != null);
  assert.match(serialized, /0\.04|4%/);
  assert.doesNotMatch(serialized, /FELAX|VAFAX|VADAX|EPGAX|ACEIX|SBLGX/);
});

test("fund catalog exists internally but UI policy hides symbols pending securities gate", () => {
  const catalog = getFundCatalog();
  assert.equal(catalog.uiPolicy.showSymbolsInClientUi, false);
  assert.ok(catalog.funds.some((fund) => fund.symbol === "FELAX"));
});

test("BR-074 is documented in BUSINESS_RULES.md", () => {
  const rulesPath = path.join(__dirname, "../../docs/06-business/BUSINESS_RULES.md");
  const text = fs.readFileSync(rulesPath, "utf8");
  assert.match(text, /## BR-074 — Firm-Verified Securities Content Access/);
  assert.match(text, /securities:verify/);
  assert.match(text, /Administrator, SUPER_ADMIN, and other role wildcards do not satisfy/);
  assert.match(text, /BR-066/);
});
