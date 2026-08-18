import { useMemo, useState } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import { comparePolicyReview, comparePolicyReviewStress } from "../../services/policyIntelligenceService";

function formatMetricValue(value, unit) {
  if (value === null || value === undefined) {
    return "—";
  }
  if (typeof value !== "number") {
    return String(value);
  }
  if (unit === "currency") {
    return value.toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0
    });
  }
  if (unit === "year" || unit === "years") {
    return String(value);
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatPercent(value) {
  if (value === null || value === undefined) {
    return "—";
  }
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

/**
 * Comparison Workspace — Scenario A vs B, metrics, timeline (Sprint 5 / BR-061).
 */
export default function ComparisonWorkspace({
  reviews,
  selectedReviewId,
  onSelectReview,
  busy,
  setBusy,
  setError,
  setNotice
}) {
  const { translate } = useLanguage();
  const [scenarioBMode, setScenarioBMode] = useState("stress_rate");
  const [reviewIdB, setReviewIdB] = useState("");
  const [fromRate, setFromRate] = useState("7");
  const [toRate, setToRate] = useState("5");
  const [fundingRatio, setFundingRatio] = useState("50");
  const [result, setResult] = useState(null);

  const scenarioLabels = useMemo(() => {
    const map = {};
    for (const scenario of result?.scenarios || []) {
      map[scenario.key] = scenario.label;
    }
    return map;
  }, [result]);

  async function handleCompare(event) {
    event.preventDefault();
    if (!selectedReviewId) {
      setError(translate("policyIntelligenceComparisonNeedReview"));
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");

    try {
      let payload;

      if (scenarioBMode === "stress_rate") {
        payload = await comparePolicyReviewStress(selectedReviewId, {
          kind: "illustrated_rate",
          fromRate: Number(fromRate) / 100,
          toRate: Number(toRate) / 100
        });
      } else if (scenarioBMode === "stress_funding") {
        payload = await comparePolicyReviewStress(selectedReviewId, {
          kind: "minimum_funding",
          fundingRatio: Number(fundingRatio) / 100
        });
      } else {
        if (!reviewIdB || reviewIdB === selectedReviewId) {
          throw new Error(translate("policyIntelligenceComparisonNeedScenarioB"));
        }
        payload = await comparePolicyReview(selectedReviewId, {
          reviewIdB,
          comparisonType: "side_by_side"
        });
      }

      setResult(payload);
      setNotice(translate("policyIntelligenceComparisonReady"));
    } catch (compareError) {
      setResult(null);
      if (compareError.code === "ILLUSTRATED_RATE_STRESS_NOT_COMPUTABLE") {
        setError(translate("policyIntelligenceComparisonStressNotComputable"));
      } else {
        setError(compareError.message || translate("policyIntelligenceErrorGeneric"));
      }
    } finally {
      setBusy(false);
    }
  }

  const comparison = result?.comparison || null;
  const timelinePreview = (comparison?.timelineComparison || []).filter(
    (_row, index, all) => index < 12 || index >= all.length - 3 || index % 5 === 0
  );

  return (
    <div className="comparison-workspace">
      <section className="workspace-dashboard__panel" aria-labelledby="pi-comparison-setup">
        <div className="workspace-dashboard__panel-head">
          <h2 id="pi-comparison-setup">{translate("policyIntelligenceComparisonSetupTitle")}</h2>
        </div>
        <p className="policy-intelligence__empty-copy">
          {translate("policyIntelligenceComparisonHelp")}
        </p>

        <form className="policy-intelligence__form comparison-workspace__form" onSubmit={handleCompare}>
          <label className="policy-intelligence__select-label">
            <span>{translate("policyIntelligenceComparisonScenarioA")}</span>
            <select
              value={selectedReviewId}
              onChange={(event) => onSelectReview(event.target.value)}
              disabled={busy || reviews.length === 0}
            >
              {reviews.length === 0 ? (
                <option value="">{translate("policyIntelligenceComparisonNoReviews")}</option>
              ) : (
                reviews.map((review) => (
                  <option key={review.id} value={review.id}>
                    {review.title}
                  </option>
                ))
              )}
            </select>
          </label>

          <label className="policy-intelligence__select-label">
            <span>{translate("policyIntelligenceComparisonScenarioB")}</span>
            <select
              value={scenarioBMode}
              onChange={(event) => setScenarioBMode(event.target.value)}
              disabled={busy}
            >
              <option value="stress_rate">
                {translate("policyIntelligenceComparisonStressRate")}
              </option>
              <option value="stress_funding">
                {translate("policyIntelligenceComparisonStressFunding")}
              </option>
              <option value="other_review">
                {translate("policyIntelligenceComparisonOtherReview")}
              </option>
            </select>
          </label>

          {scenarioBMode === "stress_rate" ? (
            <div className="comparison-workspace__rate-row">
              <label>
                <span>{translate("policyIntelligenceComparisonFromRate")}</span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={fromRate}
                  onChange={(event) => setFromRate(event.target.value)}
                  disabled={busy}
                />
              </label>
              <label>
                <span>{translate("policyIntelligenceComparisonToRate")}</span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={toRate}
                  onChange={(event) => setToRate(event.target.value)}
                  disabled={busy}
                />
              </label>
            </div>
          ) : null}

          {scenarioBMode === "stress_funding" ? (
            <label>
              <span>{translate("policyIntelligenceComparisonFundingRatio")}</span>
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={fundingRatio}
                onChange={(event) => setFundingRatio(event.target.value)}
                disabled={busy}
              />
            </label>
          ) : null}

          {scenarioBMode === "other_review" ? (
            <label className="policy-intelligence__select-label">
              <span>{translate("policyIntelligenceComparisonSelectReviewB")}</span>
              <select
                value={reviewIdB}
                onChange={(event) => setReviewIdB(event.target.value)}
                disabled={busy}
              >
                <option value="">{translate("policyIntelligenceComparisonSelectReviewBPlaceholder")}</option>
                {reviews
                  .filter((review) => review.id !== selectedReviewId)
                  .map((review) => (
                    <option key={review.id} value={review.id}>
                      {review.title}
                    </option>
                  ))}
              </select>
            </label>
          ) : null}

          <button type="submit" disabled={busy || !selectedReviewId}>
            {translate("policyIntelligenceComparisonRun")}
          </button>
        </form>
      </section>

      {comparison ? (
        <>
          <section className="workspace-dashboard__panel" aria-labelledby="pi-comparison-metrics">
            <div className="workspace-dashboard__panel-head">
              <h2 id="pi-comparison-metrics">{translate("policyIntelligenceComparisonMetricsTitle")}</h2>
            </div>
            <p className="policy-intelligence__meta">
              {scenarioLabels.scenario_a || "Scenario A"}
              {" vs "}
              {result.scenarios?.[1]?.label || "Scenario B"}
              {" · "}
              {comparison.comparisonTypeLabel}
            </p>
            <div className="comparison-workspace__table-wrap">
              <table className="comparison-workspace__table">
                <thead>
                  <tr>
                    <th>{translate("policyIntelligenceComparisonMetric")}</th>
                    <th>{result.scenarios?.[0]?.label || "A"}</th>
                    <th>{result.scenarios?.[1]?.label || "B"}</th>
                    <th>{translate("policyIntelligenceComparisonDifference")}</th>
                    <th>{translate("policyIntelligenceComparisonPctDiff")}</th>
                    <th>{translate("policyIntelligenceComparisonWinner")}</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.metrics.map((row) => (
                    <tr key={row.metric}>
                      <td>{row.label}</td>
                      <td>{formatMetricValue(row.scenarioA, row.unit)}</td>
                      <td>{formatMetricValue(row.scenarioB, row.unit)}</td>
                      <td>{formatMetricValue(row.difference, row.unit)}</td>
                      <td>{formatPercent(row.percentageDifference)}</td>
                      <td>
                        {row.winner
                          ? scenarioLabels[row.winner] || row.winner
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="workspace-dashboard__panel" aria-labelledby="pi-comparison-timeline">
            <div className="workspace-dashboard__panel-head">
              <h2 id="pi-comparison-timeline">{translate("policyIntelligenceComparisonTimelineTitle")}</h2>
            </div>
            <div className="comparison-workspace__table-wrap">
              <table className="comparison-workspace__table comparison-workspace__table--compact">
                <thead>
                  <tr>
                    <th>{translate("policyIntelligenceComparisonYear")}</th>
                    <th>{translate("policyIntelligenceComparisonAge")}</th>
                    <th>
                      {(result.scenarios?.[0]?.label || "A") + " CV"}
                    </th>
                    <th>
                      {(result.scenarios?.[1]?.label || "B") + " CV"}
                    </th>
                    <th>
                      {(result.scenarios?.[0]?.label || "A") + " DB"}
                    </th>
                    <th>
                      {(result.scenarios?.[1]?.label || "B") + " DB"}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {timelinePreview.map((row) => {
                    const keys = Object.keys(row.scenarios || {});
                    const a = row.scenarios[keys[0]] || {};
                    const b = row.scenarios[keys[1]] || {};
                    return (
                      <tr key={row.policyYear}>
                        <td>{row.policyYear}</td>
                        <td>{row.insuredAge ?? "—"}</td>
                        <td>{formatMetricValue(a.cashValue, "currency")}</td>
                        <td>{formatMetricValue(b.cashValue, "currency")}</td>
                        <td>{formatMetricValue(a.deathBenefit, "currency")}</td>
                        <td>{formatMetricValue(b.deathBenefit, "currency")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
