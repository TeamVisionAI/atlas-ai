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

function Fact({ label, value, testId, variant = "meta", hideIfEmpty = false }) {
  const display = value || TABLE_UNAVAILABLE;
  if (hideIfEmpty && (!value || value === TABLE_UNAVAILABLE)) {
    return null;
  }
  return (
    <div className={`pi-snapshot__fact pi-snapshot__fact--${variant}`}>
      <dt>{label}</dt>
      <dd data-testid={testId}>{display}</dd>
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

function issuerIsDistinct(snapshot = {}) {
  const carrier = String(snapshot.carrier || "").trim().toLowerCase();
  const issuer = String(snapshot.issuer || "").trim().toLowerCase();
  return Boolean(issuer && carrier && issuer !== carrier);
}

function SectionBand({ title, testId }) {
  return (
    <header className="pi-section-band" data-testid={testId}>
      <span className="pi-section-band__accent" aria-hidden="true" />
      <h3>{title}</h3>
    </header>
  );
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
  const showIssuer = issuerIsDistinct(snapshot);

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
        <p className="pi-report__banner pi-report__banner--alert" role="status" data-testid="pi-adapter-unsupported">
          {report.adapter.message || "Policy structure requires additional review"}
        </p>
      ) : null}

      <section className="pi-report-section" data-testid="pi-section-snapshot">
        <SectionBand title="1. Current Policy Snapshot" testId="pi-section-band-snapshot" />
        <dl className="pi-snapshot pi-snapshot--hero" data-testid="pi-snapshot-hero">
          <Fact
            label="Premium"
            value={snapshotPremium(snapshot)}
            testId="pi-snapshot-premium"
            variant="hero"
          />
          <Fact
            label="Face amount"
            value={formatUsd(snapshot.faceAmount)}
            testId="pi-snapshot-face"
            variant="hero"
          />
          <Fact
            label="Death benefit"
            value={formatUsd(snapshot.deathBenefit)}
            testId="pi-snapshot-db"
            variant="hero"
          />
        </dl>
        <dl className="pi-snapshot pi-snapshot--meta" data-testid="pi-snapshot-meta">
          <Fact label="Carrier" value={snapshot.carrier} testId="pi-snapshot-carrier" hideIfEmpty />
          {showIssuer ? (
            <Fact label="Issuer" value={snapshot.issuer} testId="pi-snapshot-issuer" hideIfEmpty />
          ) : null}
          <Fact label="Product" value={snapshot.product} testId="pi-snapshot-product" hideIfEmpty />
          <Fact
            label="Form / version"
            value={snapshot.formVersion}
            testId="pi-snapshot-form"
            hideIfEmpty
          />
          <Fact
            label="Insured age"
            value={snapshot.issueAge != null ? String(snapshot.issueAge) : null}
            testId="pi-snapshot-age"
            hideIfEmpty
          />
          <Fact label="Gender" value={snapshot.gender} testId="pi-snapshot-gender" hideIfEmpty />
          <Fact
            label="Underwriting"
            value={snapshot.underwritingClass}
            testId="pi-snapshot-underwriting"
            hideIfEmpty
          />
          <Fact label="Tobacco" value={snapshot.tobaccoStatus} testId="pi-snapshot-tobacco" hideIfEmpty />
          <Fact
            label="Death benefit option"
            value={snapshot.deathBenefitOption}
            testId="pi-snapshot-db-option"
            hideIfEmpty
          />
        </dl>
      </section>

      <section className="pi-report-section" data-testid="pi-section-costs">
        <SectionBand title="2. Policy Cost Analysis — The 7 Costs" testId="pi-section-band-costs" />
        {economics?.policyCostCategories ? (
          <PolicyCostCategoryCards categories={economics.policyCostCategories} />
        ) : (
          <p className="pi-report__empty">
            Policy cost terms are not available. Missing costs are not treated as $0.
          </p>
        )}
      </section>

      <section className="pi-report-section pi-report-section--values" data-testid="pi-section-values">
        <SectionBand title="3. Policy Values Over Time" testId="pi-section-band-values" />
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
        <SectionBand title="4. Living Benefits / Riders" testId="pi-section-band-riders" />
        <LivingBenefitRiderCards cards={economics?.livingBenefitCards || []} />
      </section>

      <section className="pi-report-section pi-report-section--fi" data-testid="pi-section-term-invest">
        <SectionBand title="5. Term + Invest-the-Difference" testId="pi-section-band-term-invest" />
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
        <SectionBand title="6. Representative Notes / Safeguards" testId="pi-section-band-safeguards" />
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
          className="pi-report-section pi-report-section--sources fi-print-hide"
          data-testid="pi-section-sources"
        >
          <details className="pi-source-catalog-details">
            <summary>Source references</summary>
            <ol className="pi-source-catalog">
              {sourceCatalog.map((item) => (
                <li key={item.id} data-testid={`pi-source-ref-${item.id}`}>
                  <span className="pi-fn">{`[${item.id}]`}</span> {item.text}
                </li>
              ))}
            </ol>
          </details>
        </section>
      ) : null}
    </article>
  );
}
