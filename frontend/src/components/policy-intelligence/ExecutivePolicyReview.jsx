import { useId, useMemo, useState } from "react";
import ExecutiveBadge from "../design-system/ExecutiveBadge";
import ActionCardGrid from "../design-system/ActionCardGrid";
import CollapsibleExecutiveSection from "../design-system/CollapsibleExecutiveSection";
import DiscussionScenariosSection from "../financial-intelligence/DiscussionScenariosSection";
import { buildDiscussionScenarioEvaluation } from "../../lib/financial-intelligence/preview/buildDiscussionScenarioEvaluation";
import PolicyReviewChart from "./PolicyReviewChart";
import "./ExecutivePolicyReview.css";

function money(value) {
  if (value == null || Number.isNaN(Number(value))) {
    return "—";
  }
  return Number(value).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  });
}

function yearsLabel(value) {
  if (value == null) {
    return "—";
  }
  return `${value} yrs`;
}

function severityPriority(severity) {
  const normalized = String(severity || "").toLowerCase();
  if (normalized === "critical") {
    return "Critical";
  }
  if (normalized === "high") {
    // Design-system Critical variant provides the stronger visual cue for High findings.
    return "Critical";
  }
  if (normalized === "medium") {
    return "Medium";
  }
  if (normalized === "info" || normalized === "low") {
    return "Low";
  }
  return "Medium";
}

function KpiCard({ label, value, hint }) {
  return (
    <div className="epr-kpi executive-card">
      <div className="epr-kpi__label">{label}</div>
      <div className="epr-kpi__value">{value}</div>
      {hint ? <div className="epr-kpi__hint">{hint}</div> : null}
    </div>
  );
}

function HeroMetricCard({ label, value }) {
  return (
    <div className="epr-hero-card">
      <div className="epr-hero-card__label">{label}</div>
      <div className="epr-hero-card__value">{value}</div>
    </div>
  );
}

function FindingCard({ finding }) {
  const [open, setOpen] = useState(false);
  const [techOpen, setTechOpen] = useState(false);
  const panelId = useId();

  return (
    <article className="epr-finding executive-card">
      <div className="epr-finding__top">
        <ExecutiveBadge
          label={finding.severity || "Info"}
          priority={severityPriority(finding.severity)}
        />
        <h4 className="epr-finding__title">{finding.title || finding.finding}</h4>
      </div>

      <p className="epr-finding__evidence">
        <span className="epr-finding__kicker">Evidence</span>
        {finding.evidence || finding.explanation}
      </p>

      <button
        type="button"
        className="epr-finding__toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Hide details" : "Why it matters & recommendation"}
      </button>

      {open ? (
        <div id={panelId} className="epr-finding__details">
          <div>
            <h5>Why it matters</h5>
            <p>{finding.whyItMatters}</p>
          </div>
          <div>
            <h5>Recommendation</h5>
            <p>{finding.recommendation || "Review with the client using educational framing only."}</p>
          </div>
          <button
            type="button"
            className="epr-finding__tech"
            onClick={() => setTechOpen((value) => !value)}
          >
            {techOpen ? "Hide technical details" : "Technical details"}
          </button>
          {techOpen ? (
            <p className="epr-finding__rule">Business Rule ID: {finding.ruleId || "—"}</p>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

/**
 * Executive Policy Review — premium PX only (Sprint 6).
 * Consumes existing seed/analysis shapes. No backend / API / rule changes.
 */
export default function ExecutivePolicyReview({ seed }) {
  const {
    executiveSummary,
    policySnapshot,
    financialSnapshot,
    findings,
    annualValues,
    sustainability,
    advisorDiscussionGuide,
    recommendations,
    conclusion
  } = seed;

  const policyStatus = seed.policyStatus || sustainability?.riskLevel || "Review Ready";
  const findingCards = (findings || []).map((item) => ({
    ...item,
    title: item.title || item.finding,
    evidence: item.evidence || item.explanation,
    whyItMatters:
      item.whyItMatters ||
      "This characteristic affects long-term funding needs, illustrated outcomes, and client expectations."
  }));

  const discussion = seed.discussionGuide || {
    questionsToAsk: advisorDiscussionGuide?.slice(0, 2) || [],
    topicsToDiscuss: advisorDiscussionGuide?.slice(2, 4) || [],
    followUpItems: advisorDiscussionGuide?.slice(4) || []
  };

  const actionCards = [
    {
      title: "Request In-force Illustration",
      subtitle: "Refresh carrier values before recommendations",
      icon: "📄"
    },
    {
      title: "Run Stress Test",
      subtitle: "Compare illustrated rate vs lower-rate path",
      icon: "📉"
    },
    {
      title: "Compare Scenarios",
      subtitle: "Side-by-side funding or strategy view",
      icon: "⇄"
    },
    {
      title: "Schedule Policy Review",
      subtitle: "Book a structured follow-up conversation",
      icon: "📅"
    }
  ];

  const closing = conclusion || {
    keyFindings: findingCards.map((item) => item.title).slice(0, 3),
    characteristics: [
      `${policySnapshot.productType} with ${policySnapshot.deathBenefitOption}`,
      `Illustrated ${policySnapshot.illustratedDuration} years vs guaranteed ${policySnapshot.guaranteedDuration} years`,
      `Planned premium ${money(policySnapshot.premium.amount)} ${policySnapshot.premium.frequency}`
    ],
    suggestedNextStep:
      "Review the illustration-dependency finding with a lower-rate stress view, then confirm funding discipline before long-term planning assumptions."
  };

  // PREVIEW-ONLY FI demonstration — not used by live Policy Intelligence workspace.
  // Production FI uses FinancialIntelligencePanel + /api/financial-intelligence.
  const fiEvaluation = useMemo(() => {
    if (seed.financialIntelligenceEvaluation) {
      return seed.financialIntelligenceEvaluation;
    }
    const previewInputs = seed.financialIntelligencePreviewInputs || null;
    if (!previewInputs) {
      return buildDiscussionScenarioEvaluation({ policySnapshot });
    }
    return buildDiscussionScenarioEvaluation({
      policySnapshot,
      termQuote: previewInputs.termQuote,
      investmentHorizonYears: previewInputs.investmentHorizonYears,
      riskProfile: previewInputs.riskProfile || "NOT_COMPLETED"
    });
  }, [seed, policySnapshot]);

  return (
    <article className="epr executive-dashboard">
      {/* Priority 1 — Executive Summary Hero */}
      <section className="executive-card executive-hero epr-hero" aria-labelledby="epr-hero-title">
        <p className="executive-hero__title" id="epr-hero-title">
          Executive Policy Review
        </p>
        <h2 className="epr-hero__headline">{executiveSummary.headline}</h2>
        <p className="epr-hero__summary">{executiveSummary.overallSummary || executiveSummary.bullets?.[0]}</p>

        <div className="epr-hero__grid">
          <HeroMetricCard label="Policy Status" value={policyStatus} />
          <HeroMetricCard label="Carrier" value={policySnapshot.carrier} />
          <HeroMetricCard label="Product" value={policySnapshot.productType} />
          <HeroMetricCard label="Issue Age" value={policySnapshot.issueAge} />
          <HeroMetricCard label="Risk Class" value={policySnapshot.riskClassification} />
          <HeroMetricCard label="Face Amount" value={money(policySnapshot.faceAmount)} />
          <HeroMetricCard
            label="Premium"
            value={`${money(policySnapshot.premium.amount)} / ${policySnapshot.premium.frequency}`}
          />
        </div>

        <div className="epr-hero__brief">
          <h3 className="executive-section-label">Overall review summary</h3>
          <ul className="epr-hero__bullets">
            {(executiveSummary.bullets || []).map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* Priority 2 — Financial KPI Cards */}
      <section aria-labelledby="epr-kpi-label">
        <h3 className="executive-section-label" id="epr-kpi-label">
          Financial snapshot
        </h3>
        <div className="epr-kpi-grid">
          <KpiCard label="Premium (annual)" value={money(financialSnapshot.annualPremium)} />
          <KpiCard label="Total COI" value={money(financialSnapshot.totalCoi)} />
          <KpiCard
            label="Total Internal Charges"
            value={money(financialSnapshot.totalInternalCharges)}
          />
          <KpiCard label="Cash Value @65" value={money(financialSnapshot.cashValueAtAge65)} />
          <KpiCard label="Cash Value @80" value={money(financialSnapshot.cashValueAtAge80)} />
          <KpiCard
            label="Break-even"
            value={
              financialSnapshot.breakEvenYear != null
                ? `Year ${financialSnapshot.breakEvenYear}`
                : "—"
            }
          />
          <KpiCard
            label="Guaranteed Duration"
            value={yearsLabel(policySnapshot.guaranteedDuration)}
          />
          <KpiCard
            label="Illustrated Duration"
            value={yearsLabel(policySnapshot.illustratedDuration)}
          />
        </div>
      </section>

      {/* Priority 5 milestone KPIs (ages) — always visible */}
      <section aria-labelledby="epr-age-kpi-label">
        <h3 className="executive-section-label" id="epr-age-kpi-label">
          Cash value milestones
        </h3>
        <div className="epr-kpi-grid epr-kpi-grid--four">
          <KpiCard label="Age 65" value={money(financialSnapshot.cashValueAtAge65)} />
          <KpiCard label="Age 70" value={money(financialSnapshot.cashValueAtAge70)} />
          <KpiCard label="Age 80" value={money(financialSnapshot.cashValueAtAge80)} />
          <KpiCard label="Age 90" value={money(financialSnapshot.cashValueAtAge90)} />
        </div>
      </section>

      {/* Priority 4 — Charts from annual values */}
      <section aria-labelledby="epr-charts-label">
        <h3 className="executive-section-label" id="epr-charts-label">
          Illustrated trajectories
        </h3>
        <div className="epr-chart-grid">
          <div className="executive-card epr-chart-card">
            <PolicyReviewChart
              title="Cash Value Growth"
              series={annualValues}
              valueKey="cashValue"
              color="#111827"
            />
          </div>
          <div className="executive-card epr-chart-card">
            <PolicyReviewChart
              title="COI Growth"
              series={annualValues}
              valueKey="costOfInsurance"
              color="#b45309"
            />
          </div>
          <div className="executive-card epr-chart-card">
            <PolicyReviewChart
              title="Death Benefit"
              series={annualValues}
              valueKey="deathBenefit"
              color="#1d4ed8"
            />
          </div>
          <div className="executive-card epr-chart-card">
            <PolicyReviewChart
              title="Premium Timeline"
              series={annualValues}
              valueKey="annualPremium"
              color="#0f766e"
            />
          </div>
        </div>
      </section>

      {/* Priority 3 — Finding Cards */}
      <section aria-labelledby="epr-findings-label">
        <h3 className="executive-section-label" id="epr-findings-label">
          Findings
        </h3>
        <div className="epr-finding-grid">
          {findingCards.map((finding) => (
            <FindingCard key={`${finding.ruleId}-${finding.title}`} finding={finding} />
          ))}
        </div>
      </section>

      {/* Priority 6 — Recommendation Action Cards */}
      <section aria-labelledby="epr-actions-label">
        <h3 className="executive-section-label" id="epr-actions-label">
          Recommended actions
        </h3>
        <p className="epr-placeholder-note">Placeholder actions — non-functional in preview.</p>
        <ActionCardGrid
          primaryAction={{
            ...actionCards[0],
            disabled: true
          }}
          secondaryActions={actionCards.slice(1).map((card) => ({
            ...card,
            disabled: true
          }))}
        />
        {recommendations?.length ? (
          <p className="epr-action-footnote">
            Derived recommendations: {recommendations.join(" · ")}
          </p>
        ) : null}
      </section>

      {/* Priority 7 — Advisor Discussion Guide */}
      <section className="executive-card epr-discussion" aria-labelledby="epr-discussion-label">
        <h3 className="executive-section-label" id="epr-discussion-label">
          Advisor discussion guide
        </h3>
        <div className="epr-discussion__grid">
          <div>
            <h4>Questions to ask</h4>
            <ul>
              {(discussion.questionsToAsk || []).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h4>Topics to discuss</h4>
            <ul>
              {(discussion.topicsToDiscuss || []).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h4>Potential follow-up items</h4>
            <ul>
              {(discussion.followUpItems || []).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Priority 5 — Full annual values table (expandable) */}
      <CollapsibleExecutiveSection
        label="Annual Values"
        summaryCount={annualValues?.length || 0}
        summaryLabel="years"
        defaultExpanded={false}
      >
        <div className="executive-table-wrap">
          <table className="executive-table">
            <thead>
              <tr>
                <th>Year</th>
                <th>Age</th>
                <th>Premium</th>
                <th>COI</th>
                <th>Cash Value</th>
                <th>CSV</th>
                <th>Death Benefit</th>
              </tr>
            </thead>
            <tbody>
              {(annualValues || []).map((row) => (
                <tr key={row.policyYear}>
                  <td>{row.policyYear}</td>
                  <td>{row.insuredAge}</td>
                  <td>{money(row.annualPremium)}</td>
                  <td>{money(row.costOfInsurance)}</td>
                  <td>{money(row.cashValue)}</td>
                  <td>{money(row.cashSurrenderValue)}</td>
                  <td>{money(row.deathBenefit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CollapsibleExecutiveSection>

      {/* Priority 8 — Executive Conclusion */}
      <section className="executive-card epr-conclusion" aria-labelledby="epr-conclusion-label">
        <h3 className="executive-section-label" id="epr-conclusion-label">
          Executive conclusion
        </h3>
        <div className="epr-conclusion__grid">
          <div>
            <h4>Key findings</h4>
            <ul>
              {(closing.keyFindings || []).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h4>Overall policy characteristics</h4>
            <ul>
              {(closing.characteristics || []).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="epr-conclusion__next">
          <h4>Suggested next step</h4>
          <p>{closing.suggestedNextStep}</p>
        </div>
        <p className="epr-conclusion__disclaimer">
          Educational policy mechanics summary only. Not personalized advice. No client identity is
          stored in this review surface.
        </p>
      </section>

      {/* PREVIEW demonstration only — labeled; live FI is API-backed */}
      <div className="epr-fi-demo-banner" role="status">
        <strong>Demonstration data</strong>
        <span>
          Internal preview fixture. Not a persisted Financial Intelligence evaluation. Live
          workflow: Policy Intelligence → Create Discussion Scenario → API.
        </span>
      </div>
      <DiscussionScenariosSection evaluation={fiEvaluation} source="preview-demo" />
    </article>
  );
}
