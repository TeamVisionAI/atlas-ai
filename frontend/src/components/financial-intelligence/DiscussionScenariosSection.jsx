import { useLanguage } from "../../i18n/LanguageContext";
import {
  formatFiMoney,
  formatFiPercent,
  formatFiTimestamp,
  localizeFiBackendMessage,
  localizeFiScenarioLabel,
  localizeFiStatus,
  normalizeFiLanguage,
  translateFiReport
} from "../../i18n/fiReportMessages";
import "./DiscussionScenariosSection.css";
import "./fiPrintReport.css";

/**
 * Display-only FI scenario section (RC4 M1.1 bilingual + visual polish).
 * All authoritative values come from the backend API contract.
 * Language changes presentation only — no Invest-the-Difference or projection math.
 * Projection cards use backend ending values only (no invented annual series).
 */
export default function DiscussionScenariosSection({ evaluation, source = "api" }) {
  const { language } = useLanguage();

  if (!evaluation) {
    return null;
  }

  const t = (key, params) => translateFiReport(language, key, params);
  const money = (value, options) => formatFiMoney(value, language, options);
  const percent = formatFiPercent;
  const lang = normalizeFiLanguage(language);

  const snapshot = evaluation.currentIulSnapshot || {};
  const table = evaluation.comparisonTable;
  const projections = evaluation.projectionOutputs?.scenarios || [];
  const termQuote = evaluation.termQuote;
  const emphasize = Boolean(evaluation.scenarioEmphasis?.canEmphasizeInvestmentScenario);
  const highlightedId = evaluation.scenarioEmphasis?.highlightedScenarioId || null;
  const statusLabel = localizeFiStatus(language, evaluation.status);
  const generatedAt = formatFiTimestamp(evaluation.updatedAt || evaluation.createdAt, language);
  const assumptions = evaluation.projectionAssumptions || null;
  const overrideReason =
    evaluation.overrideReason ||
    evaluation.representativeOverride?.reason ||
    evaluation.representativeOverride?.overrideReason ||
    null;
  const quoteNotes = termQuote?.notes || null;
  const isPreliminary = evaluation.premiumSource === "PRELIMINARY_ESTIMATE";

  const termDuration = termQuote?.selectedTermDuration ?? evaluation.proposedTermDuration;
  const proposedTermPremium =
    table?.monthlyInsurancePremium?.discussionScenario ?? evaluation.proposedTermMonthlyPremium;
  const proposedDeathBenefit =
    table?.deathBenefit?.discussionScenario ?? evaluation.proposedTermDeathBenefit;
  const monthlyDifference =
    table?.monthlyInvestmentAmount?.discussionScenario ?? evaluation.monthlyInvestmentDifference;

  const maxEndingValue = projections.reduce((max, scenario) => {
    const value = Number(scenario.illustrativeProjectedValue);
    return Number.isFinite(value) && value > max ? value : max;
  }, 0);

  return (
    <div
      className="fi-print-root"
      data-testid="fi-print-root"
      data-fi-language={lang}
      data-fi-evaluation-id={evaluation.id || ""}
      data-fi-evaluation-version={evaluation.version ?? ""}
    >
      <section
        className="fi-discussion-scenarios"
        aria-labelledby="fi-discussion-scenarios-title"
        data-testid="fi-discussion-scenarios"
        data-fi-source={source}
      >
        <header className="fi-discussion-scenarios__header">
          <p className="fi-discussion-scenarios__eyebrow">{t("fiReportEyebrow")}</p>
          <p
            className="fi-discussion-scenarios__illustration-label"
            data-testid="fi-educational-illustration-label"
          >
            {t("fiEducationalIllustration")}
          </p>
          <h2 id="fi-discussion-scenarios-title" className="fi-discussion-scenarios__title">
            {t("fiReportTitle")}
          </h2>
          <p className="fi-discussion-scenarios__lede">{t("fiReportLede")}</p>
        </header>

        <div className="fi-discussion-scenarios__print-meta" data-testid="fi-print-meta">
          <div>
            {t("fiReportLanguageLabel")}:{" "}
            <strong data-testid="fi-report-language">
              {lang === "es" ? t("fiReportLanguageEs") : t("fiReportLanguageEn")}
            </strong>
          </div>
          <div>
            {t("fiStatus")}: <strong data-testid="fi-status-label-print">{statusLabel}</strong>
            <span className="fi-print-only"> ({evaluation.status})</span>
          </div>
          <div>
            {t("fiCurrentVersion")}:{" "}
            <strong data-testid="fi-version-print">{evaluation.version ?? "—"}</strong>
            {evaluation.isCurrentVersion === false ? ` ${t("fiSupersededNotForClient")}` : ""}
          </div>
          {generatedAt ? (
            <div>
              {t("fiGenerated")}: <strong data-testid="fi-generated-at">{generatedAt}</strong>
            </div>
          ) : null}
          <div data-testid="fi-educational-status">{t("fiEducationalStatus")}</div>
        </div>

        {isPreliminary ? (
          <p className="fi-panel__preliminary" role="status" data-testid="fi-preliminary-in-report">
            {t("fiPreliminaryEstimate")}
          </p>
        ) : null}

        <div className="fi-discussion-scenarios__status" data-status={evaluation.status}>
          <span className="fi-discussion-scenarios__status-label">{t("fiStatus")}</span>
          <span data-testid="fi-status-code">{statusLabel}</span>
        </div>

        {/* 1. Current situation */}
        <div
          className="fi-discussion-scenarios__block fi-report-section"
          data-testid="fi-section-current"
        >
          <h3>{t("fiSectionCurrentSituation")}</h3>
          <dl className="fi-discussion-scenarios__facts fi-report-facts fi-report-facts--primary">
            <div className="fi-report-fact">
              <dt>{t("fiCurrentMonthlyPremium")}</dt>
              <dd data-testid="fi-existing-premium">
                {money(evaluation.currentIulMonthlyPremium)}
              </dd>
            </div>
            <div className="fi-report-fact">
              <dt>{t("fiCurrentDeathBenefit")}</dt>
              <dd data-testid="fi-existing-death-benefit">
                {money(evaluation.currentIulDeathBenefit, { cents: false })}
              </dd>
            </div>
          </dl>
          {(snapshot.productType || snapshot.product || snapshot.carrier) && (
            <p className="fi-discussion-scenarios__meta" data-testid="fi-existing-product">
              {[snapshot.productType || snapshot.product, snapshot.carrier]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>

        {/* 2. Proposed term strategy */}
        <div
          className="fi-discussion-scenarios__block fi-report-section"
          data-testid="fi-section-proposed-term"
        >
          <h3>{t("fiSectionProposedTerm")}</h3>
          <dl className="fi-discussion-scenarios__facts fi-report-facts fi-report-facts--primary">
            <div className="fi-report-fact">
              <dt>{t("fiProposedTermPremium")}</dt>
              <dd data-testid="fi-proposed-term-premium">{money(proposedTermPremium)}</dd>
            </div>
            <div className="fi-report-fact">
              <dt>{t("fiDeathBenefit")}</dt>
              <dd data-testid="fi-proposed-death-benefit">
                {money(proposedDeathBenefit, { cents: false })}
                {evaluation.sameDeathBenefit ? (
                  <span className="fi-discussion-scenarios__hint">{t("fiSameAmountInTerm")}</span>
                ) : (
                  <span className="fi-discussion-scenarios__hint">{t("fiExplicitAdjustment")}</span>
                )}
              </dd>
            </div>
            <div className="fi-report-fact">
              <dt>{t("fiTermDuration")}</dt>
              <dd data-testid="fi-term-duration">
                {termDuration != null ? t("fiYearsUnit", { years: termDuration }) : "—"}
              </dd>
            </div>
          </dl>
          {evaluation.premiumSource ? (
            <p className="fi-discussion-scenarios__meta">
              {t("fiSource")}: {String(evaluation.premiumSource).replace(/_/g, " ")}
              {termQuote?.quoteDate
                ? ` · ${t("fiQuoteDateMeta", { date: termQuote.quoteDate })}`
                : ""}
            </p>
          ) : null}
          {!evaluation.sameDeathBenefit ? (
            <p
              className="fi-discussion-scenarios__warning"
              role="status"
              data-testid="fi-death-benefit-adjustment"
            >
              {t("fiDeathBenefitAdjustment")}{" "}
              {overrideReason
                ? t("fiOverrideReason", { reason: overrideReason })
                : t("fiOverrideReasonRequired")}
            </p>
          ) : null}
          {evaluation.eligibilityConfirmationStatus === "PENDING" ||
          !termQuote?.longestAvailableTermConfirmed ? (
            <p className="fi-discussion-scenarios__warning" role="status">
              {t("fiConfirmLongestTerm")}
            </p>
          ) : null}
        </div>

        {/* 3. Invest-the-Difference — principal visual result */}
        <div
          className="fi-discussion-scenarios__block fi-report-section fi-hero-difference"
          data-testid="fi-section-monthly-difference"
        >
          <h3>{t("fiSectionMonthlyDifference")}</h3>
          <div className="fi-hero-difference__card">
            <p className="fi-hero-difference__eyebrow">{t("fiInvestTheDifference")}</p>
            <p className="fi-hero-difference__label">{t("fiHeroDifferenceLabel")}</p>
            <p className="fi-hero-difference__value" data-testid="fi-monthly-investment-difference">
              {money(monthlyDifference)}
            </p>
            <p className="fi-hero-difference__hint">{t("fiHeroDifferenceHint")}</p>
            <p className="fi-hero-difference__outlay" data-testid="fi-total-proposed-outlay">
              {t("fiTotalMonthlyOutlay")}:{" "}
              <strong>
                {money(
                  table?.totalMonthlyOutlay?.discussionScenario ??
                    evaluation.totalProposedMonthlyOutlay
                )}
              </strong>
            </p>
          </div>
          {Number(evaluation.unboundedPremiumDifference) < 0 ? (
            <p className="fi-discussion-scenarios__warning" role="status">
              {t("fiNegativeDifferenceWarning")}
            </p>
          ) : null}
        </div>

        {/* 4. Hypothetical growth — three equal cards; backend ending values only */}
        <div
          className="fi-discussion-scenarios__block fi-report-section"
          data-testid="fi-section-projections"
        >
          <h3>{t("fiSectionHypotheticalGrowth")}</h3>
          <p className="fi-discussion-scenarios__note">{t("fiProjectionsNote")}</p>

          {projections.length && maxEndingValue > 0 ? (
            <div
              className="fi-projection-compare"
              data-testid="fi-projection-compare"
              aria-label={t("fiSectionHypotheticalGrowth")}
            >
              <p className="fi-projection-compare__caption">{t("fiComparisonBarsCaption")}</p>
              <ul className="fi-projection-compare__bars">
                {projections.map((scenario) => {
                  const ending = Number(scenario.illustrativeProjectedValue) || 0;
                  const widthPct = maxEndingValue > 0 ? (ending / maxEndingValue) * 100 : 0;
                  return (
                    <li key={`bar-${scenario.id}`} className="fi-projection-compare__row">
                      <div className="fi-projection-compare__meta">
                        <span>{localizeFiScenarioLabel(language, scenario)}</span>
                        <span>
                          {percent(scenario.annualReturn)} · {t("fiHypotheticalBadge")}
                        </span>
                      </div>
                      <div
                        className="fi-projection-compare__track"
                        role="img"
                        aria-label={`${localizeFiScenarioLabel(language, scenario)} ${money(ending)}`}
                      >
                        <div
                          className="fi-projection-compare__fill"
                          style={{ width: `${Math.max(widthPct, ending > 0 ? 4 : 0)}%` }}
                        />
                      </div>
                      <div className="fi-projection-compare__value">{money(ending)}</div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {projections.length ? (
            <div className="fi-discussion-scenarios__projection-grid" data-testid="fi-projections">
              {projections.map((scenario) => {
                const highlighted = emphasize && highlightedId === scenario.id;
                return (
                  <article
                    key={scenario.id}
                    className={
                      highlighted ? "fi-projection fi-projection--aligned" : "fi-projection"
                    }
                    data-testid={`fi-projection-${scenario.id}`}
                  >
                    <div className="fi-projection__badge">{t("fiHypotheticalBadge")}</div>
                    <h4>{localizeFiScenarioLabel(language, scenario)}</h4>
                    <p className="fi-projection__rate">
                      {t("fiAnnualHypotheticalRate")}: {percent(scenario.annualReturn)}
                    </p>
                    {scenario.monthlyContribution != null ? (
                      <p className="fi-projection__rate">
                        {t("fiMonthlyContribution", {
                          amount: money(scenario.monthlyContribution)
                        })}
                      </p>
                    ) : null}
                    {scenario.timeHorizonYears != null ? (
                      <p className="fi-projection__rate">
                        {t("fiInvestmentHorizon")}:{" "}
                        {t("fiYearsUnit", { years: scenario.timeHorizonYears })}
                      </p>
                    ) : null}
                    {highlighted ? (
                      <p className="fi-projection__align">
                        {evaluation.scenarioEmphasis?.highlightedScenarioLabel
                          ? localizeFiScenarioLabel(language, {
                              id: highlightedId,
                              label: evaluation.scenarioEmphasis.highlightedScenarioLabel
                            })
                          : t("fiScenarioAligned")}
                      </p>
                    ) : null}
                    <dl>
                      <div>
                        <dt>{t("fiTotalContributions")}</dt>
                        <dd>{money(scenario.totalContributions)}</dd>
                      </div>
                      <div>
                        <dt>{t("fiIllustrativeGrowth")}</dt>
                        <dd>{money(scenario.illustrativeGrowth)}</dd>
                      </div>
                      <div>
                        <dt>{t("fiHypotheticalProjectedValue")}</dt>
                        <dd>{money(scenario.illustrativeProjectedValue)}</dd>
                      </div>
                    </dl>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="fi-discussion-scenarios__note">{t("fiProjectionsPending")}</p>
          )}

          {!emphasize ? (
            <p className="fi-discussion-scenarios__warning" role="status">
              {t("fiRiskProfileGate")}
            </p>
          ) : (
            <p className="fi-discussion-scenarios__note" data-testid="fi-risk-emphasis">
              {t("fiRiskProfileRecorded", {
                profile: String(evaluation.riskProfile || "").replace(/_/g, " ")
              })}
            </p>
          )}

          <div
            className="fi-discussion-scenarios__assumptions"
            data-testid="fi-projection-assumptions"
          >
            <h4>{t("fiProjectionAssumptions")}</h4>
            <ul>
              {assumptions?.rates ? (
                <li>
                  {t("fiIllustrativeRates", {
                    rates:
                      [
                        assumptions.rates.conservative,
                        assumptions.rates.moderate,
                        assumptions.rates.aggressive
                      ]
                        .filter((rate) => rate != null)
                        .map((rate) => percent(rate))
                        .join(", ") || "—"
                  })}
                </li>
              ) : (
                <li>{t("fiAssumptionsDefaultRates")}</li>
              )}
              <li>{t("fiAssumptionsCompounding")}</li>
              <li>{t("fiAssumptionsNotGuaranteed")}</li>
            </ul>
          </div>
        </div>

        {(evaluation.missingDataWarnings || []).length ? (
          <div
            className="fi-discussion-scenarios__block fi-discussion-scenarios__missing"
            data-testid="fi-missing-warnings"
          >
            <h3>{t("fiMissingInformation")}</h3>
            <ul>
              {evaluation.missingDataWarnings.map((warning) => (
                <li key={warning}>{localizeFiBackendMessage(language, warning)}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* 5. Important safeguards */}
        <div
          className="fi-discussion-scenarios__block fi-report-section fi-discussion-scenarios__safeguards"
          data-testid="fi-section-safeguards"
        >
          <h3>{t("fiSectionImportantSafeguards")}</h3>
          <ul className="fi-safeguards-pillars" data-testid="fi-safeguard-pillars">
            <li>{t("fiEducationalIllustration")}</li>
            <li>{t("fiNonGuaranteed")}</li>
            <li data-testid="fi-not-a-recommendation">{t("fiNotARecommendation")}</li>
            <li data-testid="fi-registered-rep-handoff">{t("fiRegisteredRepHandoff")}</li>
          </ul>
          <h4 className="fi-safeguards-subtitle">{t("fiReplacementSafeguards")}</h4>
          <ul data-testid="fi-replacement-warnings">
            {(evaluation.replacementWarnings || []).map((warning) => (
              <li key={warning}>{localizeFiBackendMessage(language, warning)}</li>
            ))}
          </ul>
          {evaluation.replacementAcknowledged ? (
            <p className="fi-discussion-scenarios__meta">{t("fiReplacementAcknowledgement")}</p>
          ) : null}
        </div>

        {quoteNotes ? (
          <div className="fi-discussion-scenarios__block" data-testid="fi-quote-notes">
            <h3>{t("fiRepresentativeNotes")}</h3>
            <p className="fi-discussion-scenarios__note">{quoteNotes}</p>
          </div>
        ) : null}

        <footer className="fi-discussion-scenarios__disclaimers" data-testid="fi-disclaimers">
          <h3>{t("fiEducationalDisclaimers")}</h3>
          <ul>
            {(evaluation.disclaimers || []).map((item) => (
              <li key={item}>{localizeFiBackendMessage(language, item)}</li>
            ))}
            <li>{t("fiDisclaimerHypotheticalReturns")}</li>
            <li>{t("fiDisclaimerNoSurrender")}</li>
          </ul>
        </footer>
      </section>
    </div>
  );
}
