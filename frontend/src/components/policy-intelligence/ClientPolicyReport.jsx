import DiscussionScenariosSection from "../financial-intelligence/DiscussionScenariosSection";
import PolicyCostCategoryCards from "./PolicyCostCategoryCards";
import PolicyValuesCheckpoints from "./PolicyValuesCheckpoints";
import PolicyValuesCheckpointChart, {
  PREMIUM_COST_SERIES
} from "./PolicyValuesCheckpointChart";
import LivingBenefitRiderCards from "./LivingBenefitRiderCards";
import { formatUsd, TABLE_UNAVAILABLE } from "./classifiedValueDisplay";
import { buildSourceCatalog, formatSourceLine, footnoteFor } from "./sourceReferences";
import "./ClientPolicyReport.css";
import "../financial-intelligence/fiPrintReport.css";

function Fact({ label, value, testId }) {
  return (
    <div className="pi-snapshot__fact">
      <dt>{label}</dt>
      <dd data-testid={testId}>{value || TABLE_UNAVAILABLE}</dd>
    </div>
  );
}

function snapshotPremium(snapshot) {
  if (!snapshot) {
    return TABLE_UNAVAILABLE;
  }
  const amount = formatUsd(snapshot.premiumAmount);
  if (!amount) {
    return TABLE_UNAVAILABLE;
  }
  return snapshot.premiumFrequency ? `${amount} / ${snapshot.premiumFrequency}` : amount;
}

export default function ClientPolicyReport({ report, financialEvaluation = null }) {
  if (!report) {
    return null;
  }

  const snapshot = report.snapshot || {};
  const economics = report.economics;
  const adapterUnsupported = report.adapter && report.adapter.supported === false;
  const annualUnavailable = report.annualValuesAvailable === false;
  const sourceCatalog = buildSourceCatalog(report);
  const valuesFootnote = footnoteFor(sourceCatalog, (item) => item.kind === "annual_values");
  const valuesSourceLine = formatSourceLine({
    pages: report.illustrationSource?.pages,
    tableLabel: report.illustrationSource?.label || "Policy Illustration"
  });

  return (
    <article
      className="pi-client-report fi-print-root"
      data-testid="pi-client-report"
      data-adapter={report.adapter?.key || ""}
    >
      <header className="pi-client-report__header">
        <p className="pi-print-repeat fi-print-only" data-testid="pi-print-repeat">
          {`Team Vision Financial · Policy Intelligence Report${snapshot.carrier ? ` · ${snapshot.carrier}` : ""}${snapshot.product ? ` · ${snapshot.product}` : ""}`}
        </p>
        <p className="pi-client-report__eyebrow">Team Vision Financial</p>
        <h2>Policy Intelligence Report</h2>
        <p className="pi-client-report__context" data-testid="pi-report-context">
          {[report.reviewTitle, snapshot.carrier, snapshot.product].filter(Boolean).join(" · ") ||
            "Client policy review"}
        </p>
        <p className="pi-client-report__lede">
          Sourced from the uploaded illustration. Exact values stay exact. Undisclosed costs are
          never shown as $0.
        </p>
      </header>

      {adapterUnsupported ? (
        <p className="pi-report__banner" role="status" data-testid="pi-adapter-unsupported">
          {report.adapter.message || "Policy structure requires additional review"}
        </p>
      ) : null}

      <section className="pi-report-section" data-testid="pi-section-snapshot">
        <h3>1. Current policy snapshot</h3>
        <dl className="pi-snapshot">
          <Fact label="Carrier" value={snapshot.carrier} testId="pi-snapshot-carrier" />
          <Fact label="Issuer" value={snapshot.issuer} testId="pi-snapshot-issuer" />
          <Fact label="Product" value={snapshot.product} testId="pi-snapshot-product" />
          <Fact label="Form / version" value={snapshot.formVersion} testId="pi-snapshot-form" />
          <Fact
            label="Insured age"
            value={snapshot.issueAge != null ? String(snapshot.issueAge) : null}
            testId="pi-snapshot-age"
          />
          <Fact label="Gender" value={snapshot.gender} testId="pi-snapshot-gender" />
          <Fact
            label="Underwriting"
            value={snapshot.underwritingClass}
            testId="pi-snapshot-underwriting"
          />
          <Fact label="Tobacco" value={snapshot.tobaccoStatus} testId="pi-snapshot-tobacco" />
          <Fact label="Premium" value={snapshotPremium(snapshot)} testId="pi-snapshot-premium" />
          <Fact
            label="Face amount"
            value={formatUsd(snapshot.faceAmount)}
            testId="pi-snapshot-face"
          />
          <Fact
            label="Death benefit"
            value={formatUsd(snapshot.deathBenefit)}
            testId="pi-snapshot-db"
          />
          <Fact
            label="Death benefit option"
            value={snapshot.deathBenefitOption}
            testId="pi-snapshot-db-option"
          />
        </dl>
      </section>

      <section className="pi-report-section" data-testid="pi-section-costs">
        <h3>2. Policy cost analysis — the 7 costs</h3>
        {economics?.policyCostCategories ? (
          <PolicyCostCategoryCards categories={economics.policyCostCategories} />
        ) : (
          <p className="pi-report__empty">
            Policy cost terms are not available. Missing costs are not treated as $0.
          </p>
        )}
      </section>

      <section className="pi-report-section pi-report-section--values" data-testid="pi-section-values">
        <h3>3. Policy values over time</h3>
        {annualUnavailable ? (
          <p className="pi-report__empty" data-testid="pi-annual-values-missing">
            {report.annualValuesUnavailableMessage ||
              "Illustrated annual values are not available for this review."}
          </p>
        ) : (
          <>
            <PolicyValuesCheckpointChart
              title="Policy values over time"
              checkpoints={economics?.policyCostCheckpoints || []}
              sourceLine={valuesSourceLine}
            />
            <PolicyValuesCheckpointChart
              title="Premium vs known policy costs"
              checkpoints={economics?.policyCostCheckpoints || []}
              series={PREMIUM_COST_SERIES}
              requireAllSeries
              testId="pi-premium-cost-chart"
              sourceLine={valuesSourceLine}
            />
            <PolicyValuesCheckpoints
              checkpoints={economics?.policyCostCheckpoints || []}
              sourceLine={valuesSourceLine}
              footnoteId={valuesFootnote}
            />
          </>
        )}
      </section>

      <section className="pi-report-section" data-testid="pi-section-riders">
        <h3>4. Living benefits / riders</h3>
        <LivingBenefitRiderCards cards={economics?.livingBenefitCards || []} />
      </section>

      <section className="pi-report-section pi-report-section--fi" data-testid="pi-section-term-invest">
        <h3>5. Term + invest-the-difference</h3>
        {financialEvaluation ? (
          <DiscussionScenariosSection evaluation={financialEvaluation} source="api" />
        ) : (
          <p className="pi-report__empty" data-testid="pi-fi-unavailable">
            No Financial Intelligence discussion scenario is on file for this review. Create one
            from Discussion scenarios to include Term + Invest-the-Difference here. Atlas does not
            invent investment values in this report.
          </p>
        )}
      </section>

      <section className="pi-report-section" data-testid="pi-section-safeguards">
        <h3>6. Representative notes / safeguards</h3>
        {report.representativeNotes ? (
          <p className="pi-report__notes" data-testid="pi-representative-notes">
            {report.representativeNotes}
          </p>
        ) : null}
        <ul className="pi-safeguards" data-testid="pi-safeguards-list">
          <li>{report.safeguards?.atlasInforms}</li>
          <li>{report.safeguards?.replacement}</li>
          <li>{report.safeguards?.carrierCalculation}</li>
          <li>{report.safeguards?.hypotheticalInvestments}</li>
        </ul>
      </section>

      {sourceCatalog.length ? (
        <section
          className="pi-report-section pi-report-section--sources"
          data-testid="pi-section-sources"
        >
          <h3>7. Source references</h3>
          <ol className="pi-source-catalog">
            {sourceCatalog.map((item) => (
              <li key={item.id} data-testid={`pi-source-ref-${item.id}`}>
                <span className="pi-fn">{`[${item.id}]`}</span> {item.text}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </article>
  );
}
