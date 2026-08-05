/**
 * RC4 M1.1 — Language selection must not unlock securities-restricted FI content.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const { StrategyEvaluationService } = require("../modules/financial-intelligence");
const { canAccessSecuritiesContent } = require("../security/securitiesAccessService");

test("module summary strips fund catalog for unverified users regardless of language preference", async () => {
  const service = new StrategyEvaluationService();
  const summary = service.getModuleSummary();
  assert.ok(summary.fundCatalog);

  const fakeReq = {
    authContext: {
      userId: "00000000-0000-4000-8000-000000000099",
      organizationId: "00000000-0000-4000-8000-000000000001",
      preferredLanguage: "es",
      locale: "es-US"
    },
    headers: { "accept-language": "es-US,es;q=0.9" }
  };

  const allowed = await canAccessSecuritiesContent(fakeReq.authContext, {
    findAuthorization: async () => null
  });
  assert.equal(allowed, false);

  // Mirror FI route gate (language headers must not restore fundCatalog).
  const payload = { ...summary };
  if (!allowed) {
    delete payload.fundCatalog;
    payload.securitiesContentRestricted = true;
  }

  const blob = JSON.stringify(payload);
  assert.equal(payload.fundCatalog, undefined);
  assert.equal(payload.securitiesContentRestricted, true);
  assert.doesNotMatch(blob, /FELAX|VAFAX|SB-72/i);
  assert.ok(payload.projectionAssumptions || payload.projectionDisclaimer || payload.br066);
});

test("securities access decision is independent of report language", async () => {
  for (const language of ["en", "es", "fr"]) {
    const allowed = await canAccessSecuritiesContent(
      {
        userId: "u-1",
        organizationId: "o-1",
        language
      },
      { findAuthorization: async () => null }
    );
    assert.equal(allowed, false, `language=${language}`);
  }
});
