import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getDashboard } from "../services/api";
import { useLanguage } from "../i18n/LanguageContext";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { isGlobalSuperAdminControlPlane } from "../security/isGlobalSuperAdminControlPlane";
import ControlPlaneEmptyState from "../components/layout/ControlPlaneEmptyState";
import { appPath } from "../config/appRoutes";
import { buildProspectWorkspacePath } from "../utils/prospectRoutes";
import { buildProspectMilestoneLabel } from "../engines/prospectCenterViewModel";
import { buildFollowUpDueDate } from "../engines/followUpsViewModel";
import "./WorkspaceDashboard.css";

export default function MyDashboard() {
  const { translate, language } = useLanguage();
  const locale = language === "es" ? "es-US" : "en-US";
  const { user, supportMode } = useWorkspace();
  const controlPlane = isGlobalSuperAdminControlPlane(user, supportMode);
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    if (controlPlane) {
      setDashboard(null);
      setError("");
      setLoading(false);
      return undefined;
    }

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
  }, [controlPlane, translate, supportMode?.active, supportMode?.organizationId]);

  const prospects = dashboard?.prospects || [];
  const activeProspects = useMemo(
    () => prospects.filter((prospect) => prospect.current_step !== "CONFIRMED"),
    [prospects]
  );

  const workflowByPhone = useMemo(() => {
    const queue = dashboard?.prioritizedWorkflowQueue || [];
    return new Map(queue.map((entry) => [entry.phone, entry]));
  }, [dashboard?.prioritizedWorkflowQueue]);

  if (controlPlane) {
    return (
      <div className="workspace-dashboard">
        <ControlPlaneEmptyState translate={translate} />
      </div>
    );
  }

  return (
    <div className="workspace-dashboard">
      <header className="workspace-dashboard__header">
        <div>
          <p className="workspace-dashboard__eyebrow">{translate("workspaceLabelRepresentative")}</p>
          <h1>{translate("myDashboardTitle")}</h1>
          <p className="workspace-dashboard__intro">{translate("myDashboardIntro")}</p>
        </div>
        <div className="workspace-dashboard__actions">
          <Link className="workspace-dashboard__button" to={appPath("today")}>
            {translate("myDashboardOpenToday")}
            {dashboard?.followUpsOverdue ? ` · ${dashboard.followUpsOverdue}` : ""}
          </Link>
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
            <article className="workspace-dashboard__metric">
              <span>{translate("myDashboardMetricFollowUpsOverdue")}</span>
              <strong>{dashboard?.followUpsOverdue ?? 0}</strong>
            </article>
            <article className="workspace-dashboard__metric">
              <span>{translate("myDashboardMetricClients")}</span>
              <strong>{dashboard?.myClientsCount ?? 0}</strong>
            </article>
            <article className="workspace-dashboard__metric">
              <span>{translate("myDashboardMetricClientFollowUps")}</span>
              <strong>{dashboard?.clientFollowUpsDue ?? 0}</strong>
            </article>
          </section>

          <section className="workspace-dashboard__panel">
            <div className="workspace-dashboard__panel-head">
              <h2>{translate("myDashboardNextFollowUps")}</h2>
              <Link to={appPath("follow-ups")}>{translate("myDashboardOpenFollowUps")}</Link>
            </div>
            {(dashboard?.nextFollowUps || []).length === 0 ? (
              <p>{translate("followUpsEmpty")}</p>
            ) : (
              <ul className="workspace-dashboard__list">
                {(dashboard?.nextFollowUps || []).map((item) => (
                  <li key={item.id || `${item.phone}:${item.dueDate}`}>
                    <div>
                      <strong>{item.name || item.title}</strong>
                      <span>
                        {buildFollowUpDueDate(item.dueDate || item.followUpDate, item.dueTime || item.followUpTime, locale) ||
                          translate("followUpsDueNotSet")}
                      </span>
                    </div>
                    <Link to={appPath("follow-ups")}>{translate("myDashboardOpenFollowUps")}</Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="workspace-dashboard__panel">
            <div className="workspace-dashboard__panel-head">
              <h2>{translate("clientsTitle")}</h2>
              <Link to={appPath("clients")}>{translate("clientsOpen")}</Link>
            </div>
            <p>
              {translate("myDashboardClientsSummary")
                .replace("{count}", String(dashboard?.myClientsCount ?? 0))
                .replace("{due}", String(dashboard?.clientFollowUpsDue ?? 0))}
            </p>
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
                      <span>
                        {buildProspectMilestoneLabel(
                          {
                            canonicalMilestone: workflowByPhone.get(prospect.phone)
                              ?.canonicalMilestone
                          },
                          translate
                        )}
                      </span>
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
