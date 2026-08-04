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
 * Possible Discussion Scenarios for the Primerica Representative.
 * Visually separate from PI factual report. BR-066-safe language only.
 */
export default function DiscussionScenariosSection({ evaluation, policySnapshot }) {
  if (!evaluation) {
    return null;
  }

  const calc = evaluation.calculations;
  const table = evaluation.comparisonTable;
  const projections = evaluation.projections?.scenarios || [];
  const termQuote = evaluation.termQuote;
  const emphasize = evaluation.canEmphasizeInvestmentScenario;

  return (
    <section
      className="fi-discussion-scenarios"
      aria-labelledby="fi-discussion-scenarios-title"
      data-testid="fi-discussion-scenarios"
    >
      <header className="fi-discussion-scenarios__header">
        <p className="fi-discussion-scenarios__eyebrow">Financial Intelligence</p>
        <h2 id="fi-discussion-scenarios-title" className="fi-discussion-scenarios__title">
          {evaluation.sectionTitle ||
            "Possible Discussion Scenarios for the Primerica Representative"}
        </h2>
        <p className="fi-discussion-scenarios__lede">
          Educational planning illustration for representative review. Atlas informs.
          Representatives recommend. Clients decide.
        </p>
      </header>

      <div className="fi-discussion-scenarios__status" data-status={evaluation.status}>
        <span className="fi-discussion-scenarios__status-label">Status</span>
        <span>{evaluation.status}</span>
      </div>

      {/* Existing IUL summary */}
      <div className="fi-discussion-scenarios__block">
        <h3>Existing IUL summary</h3>
        <dl className="fi-discussion-scenarios__facts">
          <div>
            <dt>Product</dt>
            <dd>{policySnapshot?.productType || calc?.productType || "IUL"}</dd>
          </div>
          <div>
            <dt>Current monthly premium</dt>
            <dd>{money(calc?.currentIulMonthlyPremium)}</dd>
          </div>
          <div>
            <dt>Current death benefit</dt>
            <dd>{money(calc?.currentIulDeathBenefit, { cents: false })}</dd>
          </div>
          <div>
            <dt>Carrier (sample / factual)</dt>
            <dd>{policySnapshot?.carrier || "—"}</dd>
          </div>
        </dl>
      </div>

      {/* Comparison table */}
      {table ? (
        <div className="fi-discussion-scenarios__block fi-discussion-scenarios__print-table">
          <h3>Discussion scenario comparison</h3>
          <div className="fi-discussion-scenarios__table-wrap">
            <table>
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
                  <td>{money(table.deathBenefit.existingIul, { cents: false })}</td>
                  <td>
                    {money(table.deathBenefit.discussionScenario, { cents: false })}
                    <span className="fi-discussion-scenarios__hint"> Same amount in term</span>
                  </td>
                </tr>
                <tr>
                  <th scope="row">Monthly insurance premium</th>
                  <td>{money(table.monthlyInsurancePremium.existingIul)}</td>
                  <td>
                    {money(table.monthlyInsurancePremium.discussionScenario)}
                    {termQuote?.premiumSource ? (
                      <span className="fi-discussion-scenarios__hint">
                        {" "}
                        Source: {String(termQuote.premiumSource).replace(/_/g, " ")}
                      </span>
                    ) : null}
                  </td>
                </tr>
                <tr>
                  <th scope="row">Monthly investment amount</th>
                  <td>Not evaluated</td>
                  <td>{money(table.monthlyInvestmentAmount.discussionScenario)}</td>
                </tr>
                <tr>
                  <th scope="row">Total monthly outlay</th>
                  <td>{money(table.totalMonthlyOutlay.existingIul)}</td>
                  <td>{money(table.totalMonthlyOutlay.discussionScenario)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {termQuote?.selectedTermDuration != null ? (
            <p className="fi-discussion-scenarios__meta">
              Representative-entered term duration: {termQuote.selectedTermDuration} years
              {evaluation.investmentHorizon?.years != null
                ? ` · Investment projection horizon: ${evaluation.investmentHorizon.years} years (distinct field)`
                : ""}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Projections */}
      <div className="fi-discussion-scenarios__block">
        <h3>Educational investment projections</h3>
        <p className="fi-discussion-scenarios__note">
          Hypothetical · Educational · Non-guaranteed. Before investment fees, expenses, taxes, and
          inflation unless separately disclosed. General categories only — fund symbols are not
          presented as client recommendations.
        </p>
        {projections.length ? (
          <div className="fi-discussion-scenarios__projection-grid">
            {projections.map((scenario) => {
              const highlighted =
                emphasize && evaluation.highlightedScenarioId === scenario.id;
              return (
                <article
                  key={scenario.id}
                  className={
                    highlighted
                      ? "fi-projection fi-projection--aligned"
                      : "fi-projection"
                  }
                >
                  <h4>{scenario.label}</h4>
                  <p className="fi-projection__rate">
                    Illustrative annual return: {percent(scenario.annualReturn)}
                  </p>
                  {highlighted ? (
                    <p className="fi-projection__align">
                      Scenario most aligned with the information currently available
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
            Projections appear after a confirmed term premium and investment horizon are provided.
          </p>
        )}
        {!emphasize ? (
          <p className="fi-discussion-scenarios__warning" role="status">
            Complete the client risk-profile process before emphasizing an investment scenario.
            Scenarios remain unranked educational illustrations until a representative records a
            risk-profile classification.
          </p>
        ) : null}
      </div>

      {/* Missing information */}
      {(evaluation.missingDataWarnings || []).length ? (
        <div className="fi-discussion-scenarios__block fi-discussion-scenarios__missing">
          <h3>Missing information</h3>
          <ul>
            {evaluation.missingDataWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Replacement safeguards */}
      <div className="fi-discussion-scenarios__block fi-discussion-scenarios__safeguards">
        <h3>Replacement safeguards</h3>
        <ul>
          {(evaluation.replacementWarnings || []).map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      </div>

      {/* Disclaimers */}
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
