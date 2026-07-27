import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  OpsEmptyState,
  OpsErrorState,
  OpsLoadingState,
  OpsPlatformCard,
  OpsReadinessWidget,
  OpsRecentActivityList,
  OpsRunningTasks,
  OpsStatusBadge,
  formatDuration,
  useRunningTasks
} from "../../components/operations/OpsShared";
import { operationsCenterPath } from "../../config/operationsCenterNav";
import {
  fetchOperationsDashboard,
  fetchSmokeTests,
  replayAllProjections,
  runCompleteValidation,
  runSmokeTest,
  simulateFacebookLead
} from "../../services/operationsCenterService";

function MetricCard({ label, value, suffix = "" }) {
  return (
    <article className="ops-metric-card">
      <p className="ops-muted">{label}</p>
      <strong>
        {value}
        {suffix}
      </strong>
    </article>
  );
}

function ActivityStat({ label, value }) {
  return (
    <div className="ops-activity-stat">
      <span className="ops-muted">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ValidationReportPanel({ report, t }) {
  if (!report) {
    return null;
  }

  const failed = report.overall !== "PASS";

  return (
    <section className="ops-panel ops-validation-report" aria-labelledby="ops-validation-report">
      <div className="ops-section__subhead">
        <h3 id="ops-validation-report">{t.opsValidationReportTitle}</h3>
        <OpsStatusBadge status={failed ? "failure" : "healthy"} label={report.overall} />
      </div>

      <div className="ops-inline-meta">
        <span>
          {t.opsValidationDuration}: {report.durationSeconds}s
        </span>
        <span>
          {t.opsValidationStepsPassed}: {report.stepsPassed}
        </span>
        <span>
          {t.opsValidationStepsFailed}: {report.stepsFailed}
        </span>
      </div>

      <div className="ops-validation-lines">
        {(report.displayLines || []).map((line) => (
          <p key={line} className="ops-validation-line">
            {line}
          </p>
        ))}
      </div>

      <p className="ops-validation-overall">
        {t.opsValidationOverall}: {report.passRate === 100 ? "100% PASS" : "FAILED"}
      </p>

      {report.remainingIssues?.length ? (
        <article className="ops-validation-failures">
          <h4>{t.opsValidationRemainingIssues}</h4>
          <ul>
            {report.remainingIssues.map((issue) => (
              <li key={`${issue.section}-${issue.step}`}>
                <strong>
                  [{issue.section}] {issue.step}
                </strong>
                {issue.reason ? (
                  <p>
                    {t.opsValidationFailedReason}: {issue.reason}
                  </p>
                ) : null}
                {issue.location ? (
                  <p>
                    {t.opsValidationFailedLocation}: {issue.location}
                  </p>
                ) : null}
                {issue.suggestedFix ? (
                  <p>
                    {t.opsValidationSuggestedFix}: {issue.suggestedFix}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </article>
      ) : null}

      {report.regressionRisks?.length ? (
        <article>
          <h4>{t.opsValidationRegressionRisks}</h4>
          <ul>
            {report.regressionRisks.map((risk) => (
              <li key={risk}>{risk}</li>
            ))}
          </ul>
        </article>
      ) : null}

      {report.recommendations?.length ? (
        <article>
          <h4>{t.opsValidationRecommendations}</h4>
          <ul>
            {report.recommendations.map((rec) => (
              <li key={rec}>{rec}</li>
            ))}
          </ul>
        </article>
      ) : null}
    </section>
  );
}

export default function OpsDashboard({ t }) {
  const [dashboard, setDashboard] = useState(null);
  const [validationReport, setValidationReport] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const { tasks, runTask } = useRunningTasks();

  const load = useCallback(async () => {
    setError(null);

    try {
      const data = await fetchOperationsDashboard();
      setDashboard(data);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 15000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function handleRunCompleteValidation() {
    setValidationReport(null);

    try {
      const report = await runTask("complete-validation", t.opsQuickRunCompleteValidation, () =>
        runCompleteValidation()
      );
      setValidationReport(report);
      await load();
    } catch (validationError) {
      setError(validationError.message);
    }
  }

  async function handleRunSmokeTests() {
    await runTask("smoke-all", t.opsQuickRunSmokeTests, async () => {
      const { tests } = await fetchSmokeTests();
      const results = [];

      for (const test of tests || []) {
        results.push(await runSmokeTest(test.id));
      }

      await load();
      return { success: true, result: "PASS", results };
    });
  }

  return (
    <section className="ops-section ops-dashboard" aria-labelledby="ops-dashboard-title">
      <header className="ops-section__header">
        <div>
          <p className="ops-section__eyebrow">{t.opsSectionInternal}</p>
          <h2 id="ops-dashboard-title">{t.opsNavDashboard}</h2>
          <p className="ops-muted">{t.opsDashboardSubtitle}</p>
        </div>
        <button type="button" className="ops-button ops-button--secondary" onClick={load}>
          {t.opsRefresh}
        </button>
      </header>

      <OpsRunningTasks tasks={tasks} t={t} />

      {loading && !dashboard ? <OpsLoadingState label={t.loading} /> : null}
      {error ? <OpsErrorState message={error} /> : null}

      {dashboard ? (
        <>
          <section className="ops-dashboard__section" aria-labelledby="ops-platform-status">
            <div className="ops-section__subhead">
              <h3 id="ops-platform-status">{t.opsPlatformStatus}</h3>
              <p className="ops-muted">
                {t.opsResponseTime}: {dashboard.responseTimeMs}ms
              </p>
            </div>
            <div className="ops-card-grid">
              {(dashboard.platformStatus || []).map((card) => (
                <OpsPlatformCard key={card.id} card={card} t={t} />
              ))}
            </div>
          </section>

          <div className="ops-dashboard__grid">
            <section className="ops-panel" aria-labelledby="ops-today-activity">
              <h3 id="ops-today-activity">{t.opsTodaysActivity}</h3>
              <div className="ops-activity-grid">
                <ActivityStat label={t.opsActivityFacebookLeads} value={dashboard.todaysActivity?.facebookLeads ?? 0} />
                <ActivityStat label={t.opsActivityWebsiteLeads} value={dashboard.todaysActivity?.websiteLeads ?? 0} />
                <ActivityStat
                  label={t.opsActivityWhatsAppConversations}
                  value={dashboard.todaysActivity?.whatsappConversations ?? 0}
                />
                <ActivityStat
                  label={t.opsActivityInterviewsScheduled}
                  value={dashboard.todaysActivity?.interviewsScheduled ?? 0}
                />
                <ActivityStat
                  label={t.opsActivityBusinessEvents}
                  value={dashboard.todaysActivity?.businessEventsProcessed ?? 0}
                />
                <ActivityStat
                  label={t.opsActivityProjectionReplays}
                  value={dashboard.todaysActivity?.projectionReplays ?? 0}
                />
                <ActivityStat label={t.opsActivityErrors} value={dashboard.todaysActivity?.errors ?? 0} />
              </div>
            </section>

            <OpsReadinessWidget readiness={dashboard.productionReadiness} t={t} />
          </div>

          <section className="ops-dashboard__section" aria-labelledby="ops-metrics">
            <h3 id="ops-metrics">{t.opsMetricsTitle}</h3>
            <div className="ops-metric-grid">
              <MetricCard
                label={t.opsMetricWorkflowDuration}
                value={formatDuration(dashboard.metrics?.averageWorkflowDurationMs)}
              />
              <MetricCard
                label={t.opsMetricSuccessRate}
                value={dashboard.metrics?.successRate ?? 0}
                suffix="%"
              />
              <MetricCard label={t.opsMetricFailedWorkflows} value={dashboard.metrics?.failedWorkflows ?? 0} />
              <MetricCard
                label={t.opsMetricQualificationTime}
                value={formatDuration(dashboard.metrics?.averageQualificationTimeMs)}
              />
              <MetricCard
                label={t.opsMetricSchedulingTime}
                value={formatDuration(dashboard.metrics?.averageInterviewSchedulingTimeMs)}
              />
            </div>
          </section>

          <div className="ops-dashboard__grid">
            <section className="ops-panel" aria-labelledby="ops-recent-activity">
              <div className="ops-section__subhead">
                <h3 id="ops-recent-activity">{t.opsRecentActivity}</h3>
                <Link className="ops-text-link" to={operationsCenterPath("live-activity")}>
                  {t.opsViewAllActivity}
                </Link>
              </div>
              <OpsRecentActivityList items={dashboard.recentActivity} emptyLabel={t.opsRecentActivityEmpty} />
            </section>

            <section className="ops-panel" aria-labelledby="ops-quick-actions">
              <h3 id="ops-quick-actions">{t.opsQuickActions}</h3>
              <div className="ops-quick-actions">
                <button type="button" className="ops-button" onClick={handleRunCompleteValidation}>
                  {t.opsQuickRunCompleteValidation}
                </button>
                <button type="button" className="ops-button ops-button--secondary" onClick={handleRunSmokeTests}>
                  {t.opsQuickRunSmokeTests}
                </button>
                <button
                  type="button"
                  className="ops-button ops-button--secondary"
                  onClick={() =>
                    runTask("facebook-lead", t.opsQuickCreateFacebookLead, () => simulateFacebookLead())
                  }
                >
                  {t.opsQuickCreateFacebookLead}
                </button>
                <button
                  type="button"
                  className="ops-button ops-button--secondary"
                  onClick={() =>
                    runTask("replay-all", t.opsQuickReplayProjections, () => replayAllProjections())
                  }
                >
                  {t.opsQuickReplayProjections}
                </button>
                <Link className="ops-button ops-button--secondary" to={operationsCenterPath("workflow-simulator")}>
                  {t.opsQuickOpenWorkflow}
                </Link>
                <Link className="ops-button ops-button--secondary" to={operationsCenterPath("business-events")}>
                  {t.opsQuickViewBusinessEvents}
                </Link>
              </div>
            </section>
          </div>

          <ValidationReportPanel report={validationReport} t={t} />
        </>
      ) : null}

      {!loading && !dashboard && !error ? (
        <OpsEmptyState title={t.opsDashboardEmptyTitle} description={t.opsDashboardEmptyDescription} />
      ) : null}
    </section>
  );
}
