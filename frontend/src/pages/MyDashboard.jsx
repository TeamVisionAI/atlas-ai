import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getDashboard } from "../services/api";
import { useLanguage } from "../i18n/LanguageContext";
import { appPath } from "../config/appRoutes";
import { buildProspectWorkspacePath } from "../utils/prospectRoutes";
import "./WorkspaceDashboard.css";

export default function MyDashboard() {
  const { translate } = useLanguage();
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const payload = await getDashboard();
        if (!cancelled) {
          setDashboard(payload);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || translate("myDashboardLoadError"));
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
  }, [translate]);

  const prospects = dashboard?.prospects || [];
  const activeProspects = useMemo(
    () => prospects.filter((prospect) => prospect.current_step !== "CONFIRMED"),
    [prospects]
  );

  return (
    <div className="workspace-dashboard">
      <header className="workspace-dashboard__header">
        <div>
          <p className="workspace-dashboard__eyebrow">{translate("workspaceLabelRepresentative")}</p>
          <h1>{translate("myDashboardTitle")}</h1>
          <p className="workspace-dashboard__intro">{translate("myDashboardIntro")}</p>
        </div>
        <div className="workspace-dashboard__actions">
          <Link className="workspace-dashboard__button" to={appPath("quick-capture")}>
            {translate("navQuickCapture")}
          </Link>
          <Link className="workspace-dashboard__button workspace-dashboard__button--secondary" to={appPath("prospect-center")}>
            {translate("navMyProspects")}
          </Link>
        </div>
      </header>

      {loading ? <p>{translate("myDashboardLoading")}</p> : null}
      {error ? <p className="workspace-dashboard__error">{error}</p> : null}

      {!loading && !error ? (
        <>
          <section className="workspace-dashboard__metrics" aria-label={translate("myDashboardMetricsLabel")}>
            <article className="workspace-dashboard__metric">
              <span>{translate("myDashboardMetricActive")}</span>
              <strong>{activeProspects.length}</strong>
            </article>
            <article className="workspace-dashboard__metric">
              <span>{translate("myDashboardMetricTotal")}</span>
              <strong>{prospects.length}</strong>
            </article>
            <article className="workspace-dashboard__metric">
              <span>{translate("myDashboardMetricFollowUps")}</span>
              <strong>{dashboard?.followUpsDue ?? 0}</strong>
            </article>
          </section>

          <section className="workspace-dashboard__panel">
            <div className="workspace-dashboard__panel-head">
              <h2>{translate("myDashboardPriorityProspects")}</h2>
            </div>
            {activeProspects.length === 0 ? (
              <p>{translate("myDashboardNoProspects")}</p>
            ) : (
              <ul className="workspace-dashboard__list">
                {activeProspects.slice(0, 8).map((prospect) => (
                  <li key={prospect.phone || prospect.id}>
                    <div>
                      <strong>{prospect.name || prospect.phone}</strong>
                      <span>{prospect.current_step || translate("myDashboardUnknownStep")}</span>
                    </div>
                    {prospect.phone ? (
                      <Link to={buildProspectWorkspacePath({ phone: prospect.phone })}>
                        {translate("myDashboardOpenProspect")}
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
