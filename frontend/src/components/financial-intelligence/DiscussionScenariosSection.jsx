import "./DiscussionScenariosSection.css";

function money(value, { cents = true } = {}) {
  if (value == null || Number.isNaN(Number(value))) {
    return "—";
  }
  return Number(value).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0
  });
}

function percent(rate) {
  if (rate == null) {
    return "—";
  }
  return `${(Number(rate) * 100).toFixed(0)}%`;
}

/**
 * Display-only FI scenario section.
 * All authoritative values must come from the backend API contract (RC3 Phase B).
 * No Invest-the-Difference or projection math is performed here.
 */
export default function DiscussionScenariosSection({ evaluation, source = "api" }) {
  if (!evaluation) {
    return null;
  }

  const snapshot = evaluation.currentIulSnapshot || {};
  const table = evaluation.comparisonTable;
  const projections = evaluation.projectionOutputs?.scenarios || [];
  const termQuote = evaluation.termQuote;
  const emphasize = Boolean(evaluation.scenarioEmphasis?.canEmphasizeInvestmentScenario);
  const highlightedId = evaluation.scenarioEmphasis?.highlightedScenarioId || null;

  return (
    <section
      className="fi-discussion-scenarios"
      aria-labelledby="fi-discussion-scenarios-title"
      data-testid="fi-discussion-scenarios"
      data-fi-source={source}
    >
      <header className="fi-discussion-scenarios__header">
        <p className="fi-discussion-scenarios__eyebrow">Financial Intelligence</p>
        <h2 id="fi-discussion-scenarios-title" className="fi-discussion-scenarios__title">
          {evaluation.sectionTitle ||
            "Possible Discussion Scenarios for the Primerica Representative"}
        </h2>
        <p className="fi-discussion-scenarios__lede">
          Educational planning illustration for representative review. Atlas informs.
          Representatives recommend. Clients decide. Values shown are provided by the Atlas
          Financial Intelligence API.
        </p>
      </header>

      <div className="fi-discussion-scenarios__status" data-status={evaluation.status}>
        <span className="fi-discussion-scenarios__status-label">Status</span>
        <span data-testid="fi-status-code">{evaluation.status}</span>
      </div>

      <div className="fi-discussion-scenarios__block">
        <h3>Existing IUL summary</h3>
        <dl className="fi-discussion-scenarios__facts">
          <div>
            <dt>Product</dt>
            <dd data-testid="fi-existing-product">
              {snapshot.productType || snapshot.product || "—"}
            </dd>
          </div>
          <div>
            <dt>Current monthly premium</dt>
            <dd data-testid="fi-existing-premium">
              {money(evaluation.currentIulMonthlyPremium)}
            </dd>
          </div>
          <div>
            <dt>Current death benefit</dt>
            <dd data-testid="fi-existing-death-benefit">
              {money(evaluation.currentIulDeathBenefit, { cents: false })}
            </dd>
          </div>
          <div>
            <dt>Carrier</dt>
            <dd>{snapshot.carrier || "—"}</dd>
          </div>
        </dl>
      </div>

      {table ? (
        <div className="fi-discussion-scenarios__block fi-discussion-scenarios__print-table">
          <h3>Discussion scenario comparison</h3>
          <div className="fi-discussion-scenarios__table-wrap">
            <table data-testid="fi-comparison-table">
              <thead>
                <tr>
                  <th scope="col">Category</th>
                  <th scope="col">Existing IUL</th>
                  <th scope="col">Discussion Scenario</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Death benefit</th>
                  <td>{money(table.deathBenefit?.existingIul, { cents: false })}</td>
                  <td data-testid="fi-proposed-death-benefit">
                    {money(table.deathBenefit?.discussionScenario, { cents: false })}
                    {evaluation.sameDeathBenefit ? (
                      <span className="fi-discussion-scenarios__hint"> Same amount in term</span>
                    ) : (
                      <span className="fi-discussion-scenarios__hint">
                        {" "}
                        Explicit representative adjustment
                      </span>
                    )}
                  </td>
                </tr>
                <tr>
                  <th scope="row">Monthly insurance premium</th>
                  <td>{money(table.monthlyInsurancePremium?.existingIul)}</td>
                  <td data-testid="fi-proposed-term-premium">
                    {money(table.monthlyInsurancePremium?.discussionScenario)}
                    {evaluation.premiumSource ? (
                      <span className="fi-discussion-scenarios__hint">
                        {" "}
                        Source: {String(evaluation.premiumSource).replace(/_/g, " ")}
                      </span>
                    ) : null}
                  </td>
                </tr>
                <tr>
                  <th scope="row">Monthly investment amount</th>
                  <td>Not evaluated</td>
                  <td data-testid="fi-monthly-investment-difference">
                    {money(table.monthlyInvestmentAmount?.discussionScenario)}
                  </td>
                </tr>
                <tr>
                  <th scope="row">Total monthly outlay</th>
                  <td>{money(table.totalMonthlyOutlay?.existingIul)}</td>
                  <td data-testid="fi-total-proposed-outlay">
                    {money(table.totalMonthlyOutlay?.discussionScenario)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          {termQuote?.selectedTermDuration != null || evaluation.proposedTermDuration != null ? (
            <p className="fi-discussion-scenarios__meta">
              Representative-entered term duration:{" "}
              {termQuote?.selectedTermDuration ?? evaluation.proposedTermDuration} years
              {evaluation.investmentHorizon?.years != null
                ? ` · Investment projection horizon: ${evaluation.investmentHorizon.years} years (distinct field)`
                : ""}
              {termQuote?.quoteDate ? ` · Quote date: ${termQuote.quoteDate}` : ""}
            </p>
          ) : null}
          {evaluation.eligibilityConfirmationStatus === "PENDING" ||
          !termQuote?.longestAvailableTermConfirmed ? (
            <p className="fi-discussion-scenarios__warning" role="status">
              The representative must confirm the longest available Primerica term and official
              premium.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="fi-discussion-scenarios__block">
        <h3>Invest-the-Difference</h3>
        <dl className="fi-discussion-scenarios__facts">
          <div>
            <dt>Unbounded premium difference</dt>
            <dd data-testid="fi-unbounded-difference">
              {money(evaluation.unboundedPremiumDifference)}
            </dd>
          </div>
          <div>
            <dt>Monthly investment difference</dt>
            <dd>{money(evaluation.monthlyInvestmentDifference)}</dd>
          </div>
          <div>
            <dt>Proposed mutual-fund contribution</dt>
            <dd data-testid="fi-mf-contribution">
              {money(evaluation.proposedMutualFundContribution)}
            </dd>
          </div>
          <div>
            <dt>Same-outlay validation</dt>
            <dd data-testid="fi-outlay-validation">
              {evaluation.outlayValidation
                ? evaluation.outlayValidation.passesOutlayIdentity
                  ? "Passes"
                  : "Review required"
                : "Pending term premium"}
            </dd>
          </div>
        </dl>
      </div>

      <div className="fi-discussion-scenarios__block">
        <h3>Educational investment projections</h3>
        <p className="fi-discussion-scenarios__note">
          Hypothetical · Educational · Non-guaranteed. Before investment fees, expenses, taxes, and
          inflation unless separately disclosed. General categories only — fund symbols are not
          presented as client recommendations. Projection math is computed by the backend.
        </p>
        {projections.length ? (
          <div className="fi-discussion-scenarios__projection-grid" data-testid="fi-projections">
            {projections.map((scenario) => {
              const highlighted = emphasize && highlightedId === scenario.id;
              return (
                <article
                  key={scenario.id}
                  className={highlighted ? "fi-projection fi-projection--aligned" : "fi-projection"}
                  data-testid={`fi-projection-${scenario.id}`}
                >
                  <h4>{scenario.label}</h4>
                  <p className="fi-projection__rate">
                    Illustrative annual return: {percent(scenario.annualReturn)}
                  </p>
                  {scenario.monthlyContribution != null ? (
                    <p className="fi-projection__rate">
                      Monthly contribution: {money(scenario.monthlyContribution)}
                    </p>
                  ) : null}
                  {scenario.timeHorizonYears != null ? (
                    <p className="fi-projection__rate">
                      Horizon: {scenario.timeHorizonYears} years
                    </p>
                  ) : null}
                  {highlighted ? (
                    <p className="fi-projection__align">
                      {evaluation.scenarioEmphasis?.highlightedScenarioLabel ||
                        "Scenario most aligned with the information currently available"}
                    </p>
                  ) : null}
                  <dl>
                    <div>
                      <dt>Total contributions</dt>
                      <dd>{money(scenario.totalContributions)}</dd>
                    </div>
                    <div>
                      <dt>Illustrative growth</dt>
                      <dd>{money(scenario.illustrativeGrowth)}</dd>
                    </div>
                    <div>
                      <dt>Illustrative ending value</dt>
                      <dd>{money(scenario.illustrativeProjectedValue)}</dd>
                    </div>
                  </dl>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="fi-discussion-scenarios__note">
            Projections appear after a confirmed term premium and investment horizon are provided
            to the Financial Intelligence API.
          </p>
        )}
        {!emphasize ? (
          <p className="fi-discussion-scenarios__warning" role="status">
            Complete the client risk-profile process before emphasizing an investment scenario.
            Scenarios remain unranked educational illustrations until a representative records a
            risk-profile classification. Arithmetic completion alone does not make the evaluation
            client-ready.
          </p>
        ) : null}
      </div>

      {(evaluation.missingDataWarnings || []).length ? (
        <div
          className="fi-discussion-scenarios__block fi-discussion-scenarios__missing"
          data-testid="fi-missing-warnings"
        >
          <h3>Missing information</h3>
          <ul>
            {evaluation.missingDataWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="fi-discussion-scenarios__block fi-discussion-scenarios__safeguards">
        <h3>Replacement safeguards</h3>
        <ul data-testid="fi-replacement-warnings">
          {(evaluation.replacementWarnings || []).map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      </div>

      <footer className="fi-discussion-scenarios__disclaimers">
        <h3>Educational disclaimers</h3>
        <ul>
          {(evaluation.disclaimers || []).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </footer>
    </section>
  );
}
