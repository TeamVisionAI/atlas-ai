import { Navigate } from "react-router-dom";
import {
  isInternalPreviewEnabled,
  POLICY_INTELLIGENCE_PREVIEW_PATH
} from "../config/internalPreview";
import { POLICY_INTELLIGENCE_PREVIEW_SEED } from "../data/policyIntelligencePreviewSeed";
import ExecutivePolicyReview from "../components/policy-intelligence/ExecutivePolicyReview";
import "./PolicyIntelligencePreviewPage.css";

/**
 * Development-only Policy Intelligence Executive Review preview (Sprint 6 PX).
 * Not in sidebar. Not in META_REVIEW_ALLOWED_ROUTE_KEYS. Unavailable in production.
 */
export default function PolicyIntelligencePreviewPage() {
  if (!isInternalPreviewEnabled()) {
    return <Navigate to="/" replace />;
  }

  const seed = POLICY_INTELLIGENCE_PREVIEW_SEED;

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
          Premium advisor presentation surface with seeded anonymous F&amp;G-style sample data. No
          PII. Architecture frozen — presentation only.
        </p>
      </header>

      <ExecutivePolicyReview seed={seed} />
    </div>
  );
}
