import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getDashboard } from "../services/api";
import { getExecutiveDashboard } from "../services/executiveDashboardService";
import { fetchOrganizationBranding } from "../services/organizationBrandingService";
import { buildTeamDashboardViewModel } from "../engines/teamDashboardViewModel";
import { getDisplayTitleLabelKey } from "../config/workspaceExperience";
import { useLanguage } from "../i18n/LanguageContext";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { isGlobalSuperAdminControlPlane } from "../security/isGlobalSuperAdminControlPlane";
import ControlPlaneEmptyState from "../components/layout/ControlPlaneEmptyState";
import { formatAtlasDateTime } from "../utils/dateFormatter";
import "./TeamDashboard.css";

function TeamDashboardSkeleton() {
  return (
    <div className="team-dash team-dash--loading" aria-busy="true">
      <div className="team-dash__skeleton team-dash__skeleton--header" />
      <div className="team-dash__kpi-row">
        {[1, 2, 3, 4].map((key) => (
          <div key={key} className="team-dash__skeleton team-dash__skeleton--kpi" />
        ))}
      </div>
      <div className="team-dash__skeleton team-dash__skeleton--panel" />
      <div className="team-dash__skeleton team-dash__skeleton--panel" />
    </div>
  );
}

function KpiCard({ item, translate }) {
  return (
    <Link className="team-dash__kpi" to={item.to}>
      <strong className="team-dash__kpi-value">{item.count}</strong>
      <span className="team-dash__kpi-label">{translate(item.labelKey)}</span>
    </Link>
  );
}

function PriorityRow({ item, translate, onNavigate }) {
  return (
    <li className="team-dash__priority">
      <div className="team-dash__priority-main">
        <strong>{item.name}</strong>
        <span>{item.actionLabel}</span>
      </div>
      <div className="team-dash__priority-actions">
        <button type="button" className="team-dash__btn team-dash__btn--ghost" onClick={() => onNavigate(item.openPath)}>
          {translate("teamDashActionOpen")}
        </button>
        {item.callHref ? (
          <a className="team-dash__btn team-dash__btn--ghost" href={item.callHref}>
            {translate("teamDashActionCall")}
          </a>
        ) : null}
        <button
          type="button"
          className="team-dash__btn team-dash__btn--ghost"
          onClick={() => onNavigate(item.messagePath)}
        >
          {translate("teamDashActionMessage")}
        </button>
        <button
          type="button"
          className="team-dash__btn team-dash__btn--primary"
          onClick={() => onNavigate(item.schedulePath)}
        >
          {translate("teamDashActionSchedule")}
        </button>
      </div>
    </li>
  );
}

export default function TeamDashboard() {
  const navigate = useNavigate();
  const { translate } = useLanguage();
  const { user, supportMode } = useWorkspace();
  const [executive, setExecutive] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [organizationName, setOrganizationName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const controlPlane = isGlobalSuperAdminControlPlane(user, supportMode);

  useEffect(() => {
    let cancelled = false;

    if (controlPlane) {
      setExecutive(null);
      setDashboard(null);
      setOrganizationName("");
      setError(null);
      setLoading(false);
      return undefined;
    }

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [executivePayload, dashboardPayload, branding] = await Promise.all([
          getExecutiveDashboard(),
          getDashboard(),
          fetchOrganizationBranding()
        ]);

        if (!cancelled) {
          setExecutive(executivePayload);
          setDashboard(dashboardPayload);
          setOrganizationName(branding?.name || "");
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError("teamDashLoadError");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [controlPlane, supportMode?.active, supportMode?.organizationId]);

  const viewModel = useMemo(() => {
    if (!executive || !dashboard || !user) {
      return null;
    }

    return buildTeamDashboardViewModel(executive, dashboard, user, translate);
  }, [executive, dashboard, user, translate]);

  const rankLabel = user ? translate(getDisplayTitleLabelKey(user)) : "";
  const orgLabel = organizationName || translate("teamDashOrganizationFallback");

  if (controlPlane) {
    return (
      <div className="team-dash">
        <ControlPlaneEmptyState translate={translate} />
      </div>
    );
  }

  if (loading) {
    return <TeamDashboardSkeleton />;
  }

  if (error) {
    return (
      <div className="team-dash">
        <p className="team-dash__error">{translate(error)}</p>
      </div>
    );
  }

  if (!viewModel) {
    return (
      <div className="team-dash">
        <p className="team-dash__empty">{translate("teamDashEmpty")}</p>
      </div>
    );
  }

  return (
    <div className="team-dash">
      <header className="team-dash__header">
        <h1 className="team-dash__title">
          {translate(viewModel.greetingKey, { name: viewModel.firstName || translate("teamDashFallbackName") })}
        </h1>
        <p className="team-dash__subtitle">
          {rankLabel}
          {rankLabel && orgLabel ? " · " : ""}
          {orgLabel}
        </p>
      </header>

      <section className="team-dash__kpi-row" aria-label={translate("teamDashKpiSectionLabel")}>
        {viewModel.kpis.map((item) => (
          <KpiCard key={item.key} item={item} translate={translate} />
        ))}
      </section>

      <section className="team-dash__panel team-dash__panel--priorities">
        <div className="team-dash__panel-head">
          <h2>{translate("teamDashPrioritiesTitle")}</h2>
        </div>
        {viewModel.priorities.length ? (
          <ul className="team-dash__priority-list">
            {viewModel.priorities.map((item) => (
              <PriorityRow
                key={item.phone}
                item={item}
                translate={translate}
                onNavigate={(path) => navigate(path)}
              />
            ))}
          </ul>
        ) : (
          <p className="team-dash__caught-up">{translate("teamDashPrioritiesEmpty")}</p>
        )}
      </section>

      <div className="team-dash__grid team-dash__grid--two">
        <section className="team-dash__panel">
          <div className="team-dash__panel-head">
            <h2>{translate("teamDashPipelineTitle")}</h2>
          </div>
          <div className="team-dash__pipeline">
            {viewModel.pipeline.map((stage, index) => (
              <div key={stage.key} className="team-dash__pipeline-stage-wrap">
                {index > 0 ? <span className="team-dash__pipeline-arrow" aria-hidden="true">→</span> : null}
                <Link className="team-dash__pipeline-stage" to={stage.to}>
                  <strong>{stage.count}</strong>
                  <span>{translate(stage.labelKey)}</span>
                </Link>
              </div>
            ))}
          </div>
        </section>

        <section className="team-dash__panel">
          <div className="team-dash__panel-head">
            <h2>{translate(viewModel.appointments.titleKey)}</h2>
          </div>
          <ul className="team-dash__metric-list">
            {viewModel.appointments.rows.map((row) => (
              <li key={row.key}>
                <Link to={row.to}>
                  <span>{translate(row.labelKey)}</span>
                  <strong>{row.count}</strong>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="team-dash__grid team-dash__grid--two">
        <section className="team-dash__panel">
          <div className="team-dash__panel-head">
            <h2>{translate("teamDashRecruitingTitle")}</h2>
          </div>
          <ul className="team-dash__metric-list team-dash__metric-list--compact">
            <li>
              <span>{translate("teamDashRecruitingInterviewsToday")}</span>
              <strong>{viewModel.recruiting.interviewsToday}</strong>
            </li>
            <li>
              <span>{translate("teamDashRecruitingInterviewsWeek")}</span>
              <strong>{viewModel.recruiting.interviewsWeek}</strong>
            </li>
            <li>
              <span>{translate("teamDashRecruitingRecruited")}</span>
              <strong>{viewModel.recruiting.recruited}</strong>
            </li>
            <li>
              <span>{translate("teamDashRecruitingLicensing")}</span>
              <strong>{viewModel.recruiting.licensing}</strong>
            </li>
            <li>
              <span>{translate("teamDashRecruitingOrientation")}</span>
              <strong>{viewModel.recruiting.orientation}</strong>
            </li>
          </ul>
        </section>

        <section className="team-dash__panel">
          <div className="team-dash__panel-head">
            <h2>{translate("teamDashProductionTitle")}</h2>
          </div>
          {viewModel.production.available ? (
            <ul className="team-dash__metric-list team-dash__metric-list--compact">
              <li>
                <span>{translate("teamDashProductionAppointments")}</span>
                <strong>{viewModel.production.clientAppointments}</strong>
              </li>
              <li>
                <span>{translate("teamDashProductionWeekInterviews")}</span>
                <strong>{viewModel.production.weekInterviews}</strong>
              </li>
              {viewModel.production.noteKey ? (
                <li className="team-dash__note">
                  <span>{translate(viewModel.production.noteKey)}</span>
                </li>
              ) : null}
            </ul>
          ) : (
            <p className="team-dash__coming-soon">
              {translate(viewModel.production.noteKey || "teamDashProductionComingSoon")}
            </p>
          )}
        </section>
      </div>

      {viewModel.recommendation ? (
        <section className="team-dash__panel team-dash__panel--recommendation">
          <p className="team-dash__recommend-eyebrow">{translate("teamDashRecommendTitle")}</p>
          <h2 className="team-dash__recommend-headline">{viewModel.recommendation.headline}</h2>
          <p className="team-dash__recommend-detail">{viewModel.recommendation.detail}</p>
          <div className="team-dash__recommend-actions">
            {viewModel.recommendation.callHref ? (
              <a className="team-dash__btn team-dash__btn--primary" href={viewModel.recommendation.callHref}>
                {translate("teamDashActionCall")}
              </a>
            ) : null}
            <button
              type="button"
              className="team-dash__btn team-dash__btn--secondary"
              onClick={() => navigate(viewModel.recommendation.openPath)}
            >
              {translate("teamDashActionOpenProspect")}
            </button>
          </div>
        </section>
      ) : null}

      <section className="team-dash__panel team-dash__panel--activity">
        <div className="team-dash__panel-head">
          <h2>{translate("teamDashActivityTitle")}</h2>
        </div>
        {viewModel.activity.length ? (
          <ul className="team-dash__activity-list">
            {viewModel.activity.map((entry) => (
              <li key={entry.id || `${entry.phone}-${entry.timestamp}`}>
                <div className="team-dash__activity-summary">{entry.summary}</div>
                <div className="team-dash__activity-meta">
                  {entry.phone} · {formatAtlasDateTime(new Date(entry.timestamp))}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="team-dash__empty-inline">{translate("teamDashActivityEmpty")}</p>
        )}
      </section>
    </div>
  );
}
