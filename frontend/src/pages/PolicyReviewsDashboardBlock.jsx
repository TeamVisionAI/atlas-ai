/**
 * BR-189 — Policy Reviews dashboard section. Not a standalone page.
 * Drill-down stays on /app/policy-reviews pipeline filters.
 */

import EmptyState from "../components/ui/EmptyState";
import StatusBadge from "../components/ui/StatusBadge";
import {
  POLICY_REVIEW_ATTRIBUTION_GROUPS,
  POLICY_REVIEW_DASHBOARD_KPIS,
  POLICY_REVIEW_NEEDS_ACTION,
  attributionRowFilters,
  buildPolicyReviewStageLabel,
  formatPolicyReviewConversion,
  formatPolicyReviewMoney,
  kpiStageFilter
} from "../engines/policyReviewViewModel";

const EMPHASIS_KPI_KEYS = new Set(["placed", "annualizedPremium", "estimatedCommission"]);
const PIPELINE_KPI_KEYS = new Set([
  "newReviewLeads",
  "qualified",
  "appointmentsBooked",
  "reviewsCompleted",
  "replacementOpportunities",
  "applicationsSubmitted"
]);

const ATTRIBUTION_COLUMNS = [
  ["reviewLeads", "policyReviewMetricNewLeads", false],
  ["qualifiedReviews", "policyReviewMetricQualified", false],
  ["appointmentsBooked", "policyReviewMetricAppointments", false],
  ["reviewsCompleted", "policyReviewMetricReviewsCompleted", false],
  ["replacementOpportunities", "policyReviewMetricReplacement", false],
  ["applicationsSubmitted", "policyReviewMetricApplications", false],
  ["placedPolicies", "policyReviewMetricPlaced", false],
  ["monthlyPremium", "policyReviewMetricMonthly", true],
  ["annualizedPremium", "policyReviewMetricAnnualized", true],
  ["estimatedCommission", "policyReviewMetricCommission", true]
];

export default function PolicyReviewsDashboardBlock({
  dashboard,
  loading,
  locale,
  groupBy,
  translate,
  onDrilldown
}) {
  const kpis = dashboard?.kpis;
  const funnel = dashboard?.funnel || [];
  const groups = dashboard?.attribution?.groups || [];
  const needsAction = dashboard?.needsAction || [];
  const empty = !loading && Number(kpis?.newReviewLeads || 0) === 0;
  const funnelBase = Number(funnel[0]?.count) || 0;
  const pipelineKpis = POLICY_REVIEW_DASHBOARD_KPIS.filter(([key]) => PIPELINE_KPI_KEYS.has(key));
  const outcomeKpis = POLICY_REVIEW_DASHBOARD_KPIS.filter(([key]) => !PIPELINE_KPI_KEYS.has(key));

  function renderKpiCard([key, labelKey, money]) {
    const emphasized = EMPHASIS_KPI_KEYS.has(key);
    return (
      <button
        key={key}
        type="button"
        role="listitem"
        className={`policy-review-kpi${emphasized ? " policy-review-kpi--emphasis" : ""}`}
        onClick={() => onDrilldown({ stage: kpiStageFilter(key) })}
      >
        <span>{translate(labelKey)}</span>
        <strong>
          {money ? formatPolicyReviewMoney(kpis?.[key], locale) : kpis?.[key] || 0}
        </strong>
      </button>
    );
  }

  return (
    <section className="policy-review-dashboard" aria-label={translate("policyReviewDashboardTitle")}>
      <div className="policy-review-kpi-groups">
        <div className="policy-review-kpi-group" role="list" aria-label={translate("policyReviewKpiGroupPipeline")}>
          <p className="policy-review-kpi-group__label">{translate("policyReviewKpiGroupPipeline")}</p>
          <div className="policy-review-kpi-grid policy-review-kpi-grid--pipeline">
            {pipelineKpis.map(renderKpiCard)}
          </div>
        </div>
        <div className="policy-review-kpi-group" role="list" aria-label={translate("policyReviewKpiGroupRevenue")}>
          <p className="policy-review-kpi-group__label">{translate("policyReviewKpiGroupRevenue")}</p>
          <div className="policy-review-kpi-grid policy-review-kpi-grid--revenue">
            {outcomeKpis.map(renderKpiCard)}
          </div>
        </div>
      </div>

      {empty ? (
        <EmptyState title={translate("policyReviewDashboardTitle")} body={translate("policyReviewDashboardEmpty")} />
      ) : null}

      <div className="policy-review-dashboard__panels">
        <section className="clients-card" aria-label={translate("policyReviewFunnelTitle")}>
          <h2>{translate("policyReviewFunnelTitle")}</h2>
          <ol className="policy-review-funnel">
            {funnel.map((step) => {
              const count = Number(step.count) || 0;
              const fill = funnelBase > 0 ? Math.max(0, Math.min(100, Math.round((count / funnelBase) * 100))) : 0;
              const conversion =
                step.conversionFromPrevious == null
                  ? translate("policyReviewFunnelStart")
                  : formatPolicyReviewConversion(step.conversionFromPrevious);
              return (
                <li key={step.stage}>
                  <button type="button" onClick={() => onDrilldown({ stage: step.stage })}>
                    <span className="policy-review-funnel__meta">
                      <span className="policy-review-funnel__name">
                        {buildPolicyReviewStageLabel(step.stage, translate)}
                      </span>
                      <strong className="policy-review-funnel__count">{count}</strong>
                      <em className="policy-review-funnel__conversion">{conversion}</em>
                    </span>
                    <span className="policy-review-funnel__track" aria-hidden="true">
                      <span className="policy-review-funnel__bar" style={{ width: `${fill}%` }} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="clients-card" aria-label={translate("policyReviewNeedsActionTitle")}>
          <h2>{translate("policyReviewNeedsActionTitle")}</h2>
          <ul className="policy-review-needs">
            {needsAction.map((row) => {
              const label = POLICY_REVIEW_NEEDS_ACTION.find(([key]) => key === row.key)?.[1];
              const count = Number(row.count) || 0;
              return (
                <li key={row.key}>
                  <button type="button" onClick={() => onDrilldown({ stage: row.stage || "" })}>
                    <span>{translate(label || row.key)}</span>
                    <StatusBadge variant={count > 0 ? "info" : "neutral"}>{count}</StatusBadge>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <section className="clients-card" aria-label={translate("policyReviewAttributionTitle")}>
        <div className="policy-review-attribution-head">
          <h2>{translate("policyReviewAttributionTitle")}</h2>
          <label className="clients-page__search-label">
            {translate("policyReviewGroupBy")}
            <select
              value={groupBy}
              onChange={(event) => onDrilldown({ groupBy: event.target.value }, { stayOnDashboard: true })}
            >
              {POLICY_REVIEW_ATTRIBUTION_GROUPS.map(([value, labelKey]) => (
                <option key={value} value={value}>
                  {translate(labelKey)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {groups.length ? (
          <div className="policy-review-attribution-table-wrap">
            <table className="policy-review-attribution-table">
              <thead>
                <tr>
                  <th>{translate("policyReviewAttributionGroup")}</th>
                  {ATTRIBUTION_COLUMNS.map(([key, labelKey]) => (
                    <th key={key}>{translate(labelKey)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <tr key={`${group.groupBy}:${group.key}`}>
                    <td>
                      <button
                        type="button"
                        onClick={() => onDrilldown(attributionRowFilters(group.groupBy || groupBy, group.key))}
                      >
                        {group.label || group.key}
                      </button>
                    </td>
                    {ATTRIBUTION_COLUMNS.map(([key, , money]) => (
                      <td key={key}>
                        {money
                          ? formatPolicyReviewMoney(group[key], locale)
                          : group[key] || 0}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="clients-page__status">{translate("policyReviewAttributionEmpty")}</p>
        )}
      </section>
    </section>
  );
}
