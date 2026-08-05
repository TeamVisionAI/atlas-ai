/**
 * RC4 M1.1 — Bilingual FI educational report presentation tests.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertSameNumericEvaluation,
  buildLocalizedFiReportView,
  formatFiMoney,
  localizeFiBackendMessage,
  localizeFiScenarioLabel,
  localizeFiStatus,
  translateFiReport
} from "./fiReportMessages.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Backend-engine snapshot used for visual acceptance (ending values are authoritative). */
function sampleEvaluation() {
  return JSON.parse(
    readFileSync(join(__dirname, "../../fi-visual-acceptance-evaluation.json"), "utf8")
  );
}

describe("FI bilingual report presentation", () => {
  it("English and Spanish render from the same backend evaluation with identical IDs and numbers", () => {
    const evaluation = sampleEvaluation();
    const en = buildLocalizedFiReportView(evaluation, "en");
    const es = buildLocalizedFiReportView(evaluation, "es");

    assert.equal(en.evaluationId, evaluation.id);
    assert.equal(es.evaluationId, evaluation.id);
    assert.equal(en.version, evaluation.version);
    assert.equal(es.version, evaluation.version);
    assert.equal(en.monthlyInvestmentDifference, 56.08);
    assert.equal(es.monthlyInvestmentDifference, 56.08);
    assert.ok(assertSameNumericEvaluation(en, es));
    assert.notEqual(en.sectionTitle, es.sectionTitle);
    assert.equal(en.projectionScenarios.length, 3);
    assert.equal(es.projectionScenarios.length, 3);
    assert.deepEqual(
      en.projectionScenarios.map((s) => s.annualReturn),
      [0.04, 0.07, 0.1]
    );
    assert.deepEqual(
      es.projectionScenarios.map((s) => s.annualReturn),
      [0.04, 0.07, 0.1]
    );
  });

  it("unverified generic scenarios only expose 4%/7%/10% and no fund symbols in either language", () => {
    const evaluation = sampleEvaluation();
    const en = buildLocalizedFiReportView(evaluation, "en");
    const es = buildLocalizedFiReportView(evaluation, "es");
    const blob = JSON.stringify({ en, es });

    assert.deepEqual(
      en.projectionScenarios.map((s) => s.annualReturn),
      [0.04, 0.07, 0.1]
    );
    assert.doesNotMatch(blob, /FELAX|VAFAX|VADAX|EPGAX|ACEIX|SBLGX|SB-72|SB72/i);
    assert.match(es.registeredRepHandoff, /representante debidamente registrado/i);
    assert.match(en.registeredRepHandoff, /appropriately registered representative/i);
  });

  it("Spanish includes non-guarantee, replacement safeguards, and handoff language", () => {
    const es = buildLocalizedFiReportView(sampleEvaluation(), "es");
    assert.ok(es.replacementWarnings.some((w) => /No cancele ni entregue/i.test(w)));
    assert.ok(es.disclaimers.some((w) => /hipotéticas y no garantizadas/i.test(w)));
    assert.match(es.notARecommendation, /Esto no constituye una recomendación/);
    assert.match(es.registeredRepHandoff, /representante debidamente registrado/);
    assert.match(es.strings.fiNonGuaranteed, /No garantizado/);
    assert.match(es.strings.fiHypotheticalProjectedValue, /Valor hipotético proyectado/);
  });

  it("status and scenario labels localize by stable codes/ids", () => {
    assert.equal(localizeFiStatus("en", "READY_FOR_REPRESENTATIVE_REVIEW"), "Ready for representative review");
    assert.equal(localizeFiStatus("es", "READY_FOR_REPRESENTATIVE_REVIEW"), "Lista para revisión del representante");
    assert.equal(localizeFiScenarioLabel("es", { id: "conservative", label: "Conservative" }), "Conservador");
    assert.equal(
      localizeFiBackendMessage(
        "es",
        "Investment projections are hypothetical and non-guaranteed."
      ),
      "Las proyecciones de inversión son hipotéticas y no garantizadas."
    );
  });

  it("currency formatting may differ by locale while numeric input is unchanged", () => {
    const value = 56.08;
    const en = formatFiMoney(value, "en");
    const es = formatFiMoney(value, "es");
    assert.match(en, /56\.08/);
    assert.match(es, /56[.,]08/);
    assert.equal(Number(value), 56.08);
  });

  it("live report uses LanguageContext and does not introduce preview math helpers", () => {
    const section = readFileSync(
      join(__dirname, "../components/financial-intelligence/DiscussionScenariosSection.jsx"),
      "utf8"
    );
    const panel = readFileSync(
      join(__dirname, "../components/financial-intelligence/FinancialIntelligencePanel.jsx"),
      "utf8"
    );

    assert.match(section, /useLanguage/);
    assert.match(section, /fiRegisteredRepHandoff/);
    assert.match(section, /data-fi-evaluation-id/);
    assert.match(section, /fi-section-monthly-difference/);
    assert.match(section, /fi-projection-compare/);
    assert.equal(section.includes("buildDiscussionScenarioEvaluation"), false);
    assert.equal(section.includes("calculateMonthlyFutureValue"), false);
    assert.equal(panel.includes("preview/"), false);
    assert.match(panel, /useLanguage/);
  });

  it("projection visualization uses only backend ending values (no invented series)", () => {
    const section = readFileSync(
      join(__dirname, "../components/financial-intelligence/DiscussionScenariosSection.jsx"),
      "utf8"
    );
    assert.match(section, /illustrativeProjectedValue/);
    assert.match(section, /maxEndingValue/);
    assert.equal(section.includes("interpolate"), false);
    assert.equal(section.includes("annualPoints"), false);
    assert.equal(section.includes("fakeSeries"), false);
    assert.equal(section.includes("calculateMonthlyFutureValue"), false);
  });

  it("Spanish print-critical strings exist for titles and disclosures", () => {
    assert.match(translateFiReport("es", "fiReportEyebrow"), /Informe de Inteligencia Financiera/);
    assert.match(translateFiReport("es", "fiEducationalIllustration"), /Ilustración educativa/);
    assert.match(translateFiReport("es", "fiReplacementSafeguards"), /Salvaguardas sobre el reemplazo/);
    assert.match(translateFiReport("es", "fiDisclaimerHypotheticalReturns"), /hipotéticas y educativas/);
  });

  it("language switch helper does not imply a write or revision", () => {
    const evaluation = sampleEvaluation();
    const first = buildLocalizedFiReportView(evaluation, "en");
    const second = buildLocalizedFiReportView(evaluation, "es");
    const third = buildLocalizedFiReportView(evaluation, "en");
    assert.equal(first.version, third.version);
    assert.equal(first.evaluationId, second.evaluationId);
    assert.equal(evaluation.version, 3);
  });

  it("visual hierarchy sections, report language indicator, and safeguard pillars exist", () => {
    const section = readFileSync(
      join(__dirname, "../components/financial-intelligence/DiscussionScenariosSection.jsx"),
      "utf8"
    );
    for (const marker of [
      "fi-section-current",
      "fi-section-proposed-term",
      "fi-section-monthly-difference",
      "fi-section-projections",
      "fi-section-safeguards",
      "fi-report-language",
      "fi-safeguard-pillars",
      "fiNotARecommendation",
      "fiRegisteredRepHandoff"
    ]) {
      assert.match(section, new RegExp(marker));
    }
    assert.match(section, /fi-projection-\$\{scenario\.id\}/);
    assert.match(section, /fi-report-facts--primary/);
  });

  it("backend visual snapshot uses engine ending values and no securities leakage", () => {
    const evaluation = sampleEvaluation();
    assert.equal(evaluation.id, "fi-eval-visual-m11-001");
    assert.equal(evaluation.monthlyInvestmentDifference, 56.08);
    assert.equal(evaluation.scenarioEmphasis.canEmphasizeInvestmentScenario, false);
    assert.deepEqual(
      evaluation.projectionOutputs.scenarios.map((s) => s.illustrativeProjectedValue),
      [28832.39, 45428.82, 74408.82]
    );
    const blob = JSON.stringify(evaluation);
    assert.doesNotMatch(blob, /FELAX|VAFAX|VADAX|EPGAX|ACEIX|SBLGX|SB-72|SB72|ticker|CUSIP/i);
  });

  it("Spanish long labels remain full phrases (no forced truncation)", () => {
    assert.match(
      translateFiReport("es", "fiProposedTermPremium"),
      /Prima propuesta del seguro a término/
    );
    assert.match(
      translateFiReport("es", "fiCurrentDeathBenefit"),
      /Beneficio por fallecimiento actual/
    );
    assert.match(
      translateFiReport("es", "fiHypotheticalProjectedValue"),
      /Valor hipotético proyectado/
    );
    assert.equal(translateFiReport("es", "fiProposedTermPremium").includes("…"), false);
  });

  it("print CSS keeps scenario cards together and identifies language meta", () => {
    const printCss = readFileSync(
      join(__dirname, "../components/financial-intelligence/fiPrintReport.css"),
      "utf8"
    );
    const section = readFileSync(
      join(__dirname, "../components/financial-intelligence/DiscussionScenariosSection.jsx"),
      "utf8"
    );
    assert.match(printCss, /\.fi-projection[\s\S]*page-break-inside:\s*avoid/);
    assert.match(printCss, /break-after:\s*avoid/);
    assert.match(section, /fiReportLanguageLabel/);
    assert.match(section, /data-fi-language/);
  });
});
