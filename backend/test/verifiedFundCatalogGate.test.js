/**
 * RC4 M1 hotfix — Named fund catalog release gate (fail closed).
 *
 * VERIFIED_ACTIVE authorizes access to approved securities content, but no
 * named fund catalog is approved or active in the current release.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  canExposeVerifiedFundCatalog,
  getCurrentFundCatalogReleaseState
} = require("../security/verifiedFundCatalogGate");
const { StrategyEvaluationService } = require("../modules/financial-intelligence");
const {
  getFundCatalog,
  getNonProductionPlaceholderFundCatalog
} = require("../modules/financial-intelligence/domain/config/fundFamilyConfig");
const { ROLES } = require("../security/roles");

const PLACEHOLDER_SYMBOL_RE = /FELAX|VAFAX|VADAX|EPGAX|ACEIX|SBLGX/i;

function publicSummaryFor(roleLabel, canAccessSecuritiesContent) {
  const service = new StrategyEvaluationService();
  const summary = service.getModuleSummary();
  const expose = canExposeVerifiedFundCatalog({ canAccessSecuritiesContent });
  if (!expose) {
    delete summary.fundCatalog;
    summary.namedFundCatalogActive = false;
    summary.securitiesContentRestricted = true;
  }
  summary._roleLabel = roleLabel;
  return summary;
}

test("current release catalog readiness is inactive", () => {
  const release = getCurrentFundCatalogReleaseState();
  assert.equal(release.featureImplemented, false);
  assert.equal(release.activeVersionExists, false);
  assert.equal(release.versionApproved, false);
  assert.equal(release.sourceVerified, false);
  assert.equal(release.effectiveDateCurrent, false);
  assert.equal(release.catalogSource, null);
  assert.equal(release.catalogVersion, null);
  assert.match(release.note, /no named fund catalog is approved or active/i);
});

test("VERIFIED_ACTIVE alone cannot expose named fund catalog", () => {
  assert.equal(
    canExposeVerifiedFundCatalog({ canAccessSecuritiesContent: true }),
    false
  );
});

test("unverified, administrator, and SUPER_ADMIN paths cannot expose catalog", () => {
  for (const role of [ROLES.ADMINISTRATOR, ROLES.RECRUITER, "SUPER_ADMIN", null]) {
    assert.equal(
      canExposeVerifiedFundCatalog({
        canAccessSecuritiesContent: false,
        actorRole: role
      }),
      false,
      `role=${role}`
    );
  }
});

test("gate opens only when all future catalog release conditions are met", () => {
  assert.equal(
    canExposeVerifiedFundCatalog({
      canAccessSecuritiesContent: true,
      catalogRelease: {
        featureImplemented: true,
        activeVersionExists: true,
        versionApproved: true,
        sourceVerified: true,
        effectiveDateCurrent: true,
        catalogSource: "FIRM_SB72_AUTHORITATIVE",
        catalogVersion: "2026.1"
      }
    }),
    true
  );

  assert.equal(
    canExposeVerifiedFundCatalog({
      canAccessSecuritiesContent: true,
      catalogRelease: {
        featureImplemented: true,
        activeVersionExists: true,
        versionApproved: true,
        sourceVerified: true,
        effectiveDateCurrent: true,
        catalogSource: "FIRM_SB72_AUTHORITATIVE",
        catalogVersion: ""
      }
    }),
    false
  );
});

test("live module summary omits fundCatalog and placeholder symbols for all actors", () => {
  const actors = [
    ["unverified", false],
    ["VERIFIED_ACTIVE", true],
    ["administrator", false],
    ["SUPER_ADMIN", false]
  ];

  for (const [label, canAccess] of actors) {
    const summary = publicSummaryFor(label, canAccess);
    const blob = JSON.stringify(summary);
    assert.equal(summary.fundCatalog, undefined, label);
    assert.equal(summary.namedFundCatalogActive, false, label);
    assert.equal(summary.securitiesContentRestricted, true, label);
    assert.doesNotMatch(blob, PLACEHOLDER_SYMBOL_RE, label);
    assert.ok(summary.projectionAssumptions, label);
    assert.equal(summary.capabilities.verifiedFundCatalog, false, label);
  }
});

test("English and Spanish public summaries contain no named securities", () => {
  for (const language of ["en", "es"]) {
    const summary = publicSummaryFor(`locale-${language}`, true);
    summary.language = language;
    const blob = JSON.stringify(summary);
    assert.doesNotMatch(blob, PLACEHOLDER_SYMBOL_RE);
    assert.doesNotMatch(blob, /SB-72|share class|model portfolio/i);
  }
});

test("generic FI 4%/7%/10% assumptions remain on public summary", () => {
  const summary = publicSummaryFor("verified", true);
  const rates = Object.values(summary.projectionAssumptions || {}).map(
    (s) => s.annualReturn
  );
  assert.deepEqual(rates, [0.04, 0.07, 0.1]);
});

test("placeholder catalog remains available only as non-production preview helper", () => {
  const catalog = getNonProductionPlaceholderFundCatalog();
  assert.equal(catalog.productionAuthorized, false);
  assert.equal(catalog.catalogStatus, "NON_PRODUCTION_PLACEHOLDER");
  assert.equal(catalog.uiPolicy.liveApiExposureForbidden, true);
  assert.ok(catalog.funds.some((f) => f.symbol === "FELAX"));
  assert.equal(getFundCatalog().productionAuthorized, false);
});

test("FI route source uses catalog release gate, not securities access alone", () => {
  const routesPath = path.join(
    __dirname,
    "../modules/financial-intelligence/api/financialIntelligence.routes.js"
  );
  const text = fs.readFileSync(routesPath, "utf8");
  assert.match(text, /canExposeVerifiedFundCatalog/);
  assert.match(text, /verifiedFundCatalogGate/);
  assert.doesNotMatch(
    text,
    /strip unless verified active/i
  );
});

test("service getModuleSummary does not attach fundCatalog by default", () => {
  const summary = new StrategyEvaluationService().getModuleSummary();
  assert.equal(summary.fundCatalog, undefined);
  assert.equal(summary.namedFundCatalogActive, false);
  assert.doesNotMatch(JSON.stringify(summary), PLACEHOLDER_SYMBOL_RE);

  const preview = new StrategyEvaluationService().getModuleSummary({
    includeNonProductionFundCatalogPreview: true
  });
  assert.ok(preview.fundCatalog);
  assert.equal(preview.fundCatalogPreviewOnly, true);
});
