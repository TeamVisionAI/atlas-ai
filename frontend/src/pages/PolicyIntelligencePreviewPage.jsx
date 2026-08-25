import { Navigate } from "react-router-dom";
import {
  isInternalPreviewEnabled,
  POLICY_INTELLIGENCE_PREVIEW_PATH
} from "../config/internalPreview";
import { POLICY_INTELLIGENCE_PREVIEW_SEED } from "../data/policyIntelligencePreviewSeed";
import { POLICY_INTELLIGENCE_DECREASING_TERM_PREVIEW_SEED } from "../data/policyIntelligenceDecreasingTermPreviewSeed";
import ExecutivePolicyReview from "../components/policy-intelligence/ExecutivePolicyReview";
import ClientPolicyReport from "../components/policy-intelligence/ClientPolicyReport";
import "./PolicyIntelligencePreviewPage.css";

function buildDecreasingTermClientReport(seed) {
  const snapshot = seed.policySnapshot || {};
  return {
    layer: "client_policy_report",
    reviewTitle: seed.meta?.fixtureId || "Decreasing Term review",
    adapter: { key: null, supported: true, message: null },
    annualValuesAvailable: true,
    annualValuesUnavailableMessage: null,
    snapshot: {
      carrier: snapshot.carrier,
      product: snapshot.product,
      productType: snapshot.productType,
      formVersion: snapshot.formVersion,
      issueAge: snapshot.issueAge,
      gender: snapshot.gender,
      underwritingClass: snapshot.riskClassification,
      tobaccoStatus: snapshot.tobaccoStatus,
      premiumAmount: snapshot.premium?.amount,
      premiumFrequency: snapshot.premium?.frequency,
      premiumCurrency: "USD",
      annualPremiumIfPaidAnnually: snapshot.annualPremiumIfPaidAnnually,
      annualizedCurrentMode: snapshot.annualizedCurrentMode,
      faceAmount: snapshot.faceAmount,
      initialDeathBenefit: snapshot.initialDeathBenefit,
      deathBenefit: snapshot.initialDeathBenefit,
      deathBenefitOption: snapshot.deathBenefitOption,
      cashValue: snapshot.cashValue,
      effectiveDate: snapshot.effectiveDate,
      expirationDate: snapshot.expirationDate,
      coverageExpiresAtAge: snapshot.coverageExpiresAtAge,
      deathBenefitSchedule: snapshot.deathBenefitSchedule,
      benefitDeclinesOverTime: true
    },
    illustrationSource: {
      label: "Policy Schedule",
      pages: []
    },
    economics: {
      livingBenefitCards: seed.livingBenefitCards || []
    },
    invented: false,
    interpolated: false
  };
}

/**
 * Development-only Policy Intelligence Executive Review preview (Sprint 6 PX).
 * Not in sidebar. Not in META_REVIEW_ALLOWED_ROUTE_KEYS. Unavailable in production.
 */
export default function PolicyIntelligencePreviewPage() {
  if (!isInternalPreviewEnabled()) {
    return <Navigate to="/" replace />;
  }

  const seed = POLICY_INTELLIGENCE_PREVIEW_SEED;
  const decreasingSeed = POLICY_INTELLIGENCE_DECREASING_TERM_PREVIEW_SEED;
  const decreasingReport = buildDecreasingTermClientReport(decreasingSeed);

  return (
    <div className="pi-preview">
      <div className="pi-preview__banner" role="status">
        <strong>Internal development preview — demonstration data</strong>
        <span>
          Sprint 6 Executive Review PX · Sample dollars are fixtures only · Not production FI ·
          Meta Review unchanged · <code>{POLICY_INTELLIGENCE_PREVIEW_PATH}</code>
        </span>
      </div>

      <header className="pi-preview__header">
        <p className="pi-preview__eyebrow">Atlas Policy Intelligence</p>
        <h1>Executive Policy Review</h1>
        <p>
          Premium advisor presentation surface with seeded sample data. Decreasing Term test case
          included below.
        </p>
      </header>

      <ExecutivePolicyReview seed={seed} />

      <header className="pi-preview__header" style={{ marginTop: "2.5rem" }}>
        <p className="pi-preview__eyebrow">Decreasing Term test case</p>
        <h1>Leidy Scull Tamayo — Occidental</h1>
        <p>
          Exact declining death-benefit schedule. Not level term. Facts-only observations (no
          replacement recommendation).
        </p>
      </header>

      <ExecutivePolicyReview seed={decreasingSeed} />

      <div style={{ marginTop: "2rem" }} data-testid="pi-decreasing-term-client-report">
        <ClientPolicyReport report={decreasingReport} />
      </div>
    </div>
  );
}
