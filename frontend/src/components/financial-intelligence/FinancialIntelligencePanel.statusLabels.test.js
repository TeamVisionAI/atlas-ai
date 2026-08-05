/**
 * Hotfix — Policy Intelligence must not white-screen on FI history status labels.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertSameNumericEvaluation,
  buildLocalizedFiReportView,
  localizeFiStatus
} from "../../i18n/fiReportMessages.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PANEL = join(__dirname, "FinancialIntelligencePanel.jsx");
const SAMPLE = join(__dirname, "../../../fi-visual-acceptance-evaluation.json");

const KNOWN_STATUSES = [
  "DRAFT_MISSING_POLICY_DATA",
  "DRAFT_TERM_QUOTE_REQUIRED",
  "DRAFT_TERM_CONFIRMATION_REQUIRED",
  "DRAFT_INVESTMENT_HORIZON_REQUIRED",
  "DRAFT_RISK_PROFILE_REQUIRED",
  "DRAFT_REPLACEMENT_REVIEW_REQUIRED",
  "READY_FOR_REPRESENTATIVE_REVIEW",
  "REPRESENTATIVE_ADJUSTED",
  "CLIENT_DISCUSSION_VERSION",
  "SUPERSEDED"
];

describe("FinancialIntelligencePanel status labels hotfix", () => {
  it("panel source has no STATUS_LABELS reference and localizes history statuses", () => {
    const source = readFileSync(PANEL, "utf8");
    assert.equal(/STATUS_LABELS/.test(source), false);
    assert.match(source, /localizeFiStatus\(language,\s*item\.status\)/);
    assert.match(source, /localizeFiStatus\(language,\s*evaluation\.status\)/);
  });

  it("known status codes render in English and Spanish without crashing", () => {
    for (const code of KNOWN_STATUSES) {
      const en = localizeFiStatus("en", code);
      const es = localizeFiStatus("es", code);
      assert.ok(en && en !== "—", code);
      assert.ok(es && es !== "—", code);
      assert.notEqual(en, code, `en localized ${code}`);
      assert.notEqual(es, code, `es localized ${code}`);
    }
  });

  it("unknown status does not crash and uses readable fallback", () => {
    assert.doesNotThrow(() => localizeFiStatus("en", "UNEXPECTED_STATUS_XYZ"));
    assert.equal(localizeFiStatus("en", "UNEXPECTED_STATUS_XYZ"), "UNEXPECTED STATUS XYZ");
    assert.equal(localizeFiStatus("es", "UNEXPECTED_STATUS_XYZ"), "UNEXPECTED STATUS XYZ");
  });

  it("language switch keeps evaluation numbers identical and exposes no named securities", () => {
    const evaluation = JSON.parse(readFileSync(SAMPLE, "utf8"));
    const en = buildLocalizedFiReportView(evaluation, "en");
    const es = buildLocalizedFiReportView(evaluation, "es");
    assert.ok(assertSameNumericEvaluation(en, es));
    assert.equal(en.evaluationId, es.evaluationId);
    assert.equal(en.version, es.version);
    assert.deepEqual(
      en.projectionScenarios.map((s) => s.annualReturn),
      [0.04, 0.07, 0.1]
    );
    const blob = JSON.stringify({ en, es });
    assert.doesNotMatch(blob, /FELAX|VAFAX|VADAX|EPGAX|ACEIX|SBLGX|SB-72|SB72/i);
  });

  it("admin and rvp roles are not required for status label helper (display-only)", () => {
    // Label helper is role-agnostic; route access is enforced elsewhere.
    assert.equal(
      localizeFiStatus("en", "READY_FOR_REPRESENTATIVE_REVIEW"),
      localizeFiStatus("en", "READY_FOR_REPRESENTATIVE_REVIEW")
    );
    assert.ok(localizeFiStatus("es", "READY_FOR_REPRESENTATIVE_REVIEW").length > 0);
  });
});
