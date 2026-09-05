import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "../i18n/LanguageContext";
import StatusBadge from "../components/ui/StatusBadge";
import ControlPlaneEmptyState from "../components/layout/ControlPlaneEmptyState";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { isGlobalSuperAdminControlPlane } from "../security/isGlobalSuperAdminControlPlane";
import { getTiktokLiveEngagements } from "../services/tiktokLiveEngagementsService";
import "./TiktokLiveEngagementsPage.css";

const POLL_MS = 15000;

function formatTimestamp(value, language) {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleString(language === "es" ? "es-US" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

export default function TiktokLiveEngagementsPage() {
  const { translate, language } = useLanguage();
  const { user, supportMode } = useWorkspace();
  const controlPlane = isGlobalSuperAdminControlPlane(user, supportMode);
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadEngagements = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
    }
    try {
      const next = await getTiktokLiveEngagements();
      setPayload(next);
      setError("");
    } catch {
      setError(translate("tiktokLiveError"));
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [translate]);

  useEffect(() => {
    if (controlPlane) {
      setLoading(false);
      return undefined;
    }
    loadEngagements();
    const refresh = () => {
      if (document.visibilityState !== "visible") {
        return;
      }
      loadEngagements({ silent: true }).catch(() => {});
    };
    const intervalId = window.setInterval(refresh, POLL_MS);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refresh);
    };
  }, [controlPlane, loadEngagements]);

  if (controlPlane) {
    return <ControlPlaneEmptyState translate={translate} />;
  }

  const summary = payload?.summary || {
    total: 0,
    iul: 0,
    recruiting: 0,
    lastReceivedAt: null
  };
  const items = payload?.items || [];

  return (
    <div className="tiktok-live-page">
      <header className="tiktok-live-page__header">
        <div>
          <h1 className="tiktok-live-page__title">{translate("tiktokLiveTitle")}</h1>
          <p className="tiktok-live-page__subtitle">{translate("tiktokLiveSubtitle")}</p>
          <p className="tiktok-live-page__hint">{translate("tiktokLiveRefreshHint")}</p>
        </div>
      </header>

      <section className="tiktok-live-page__kpis" aria-label={translate("tiktokLiveTitle")}>
        <div className="tiktok-live-page__kpi">
          <span>{translate("tiktokLiveTotal")}</span>
          <strong>{summary.total || 0}</strong>
        </div>
        <div className="tiktok-live-page__kpi">
          <span>{translate("tiktokLiveIul")}</span>
          <strong>{summary.iul || 0}</strong>
        </div>
        <div className="tiktok-live-page__kpi">
          <span>{translate("tiktokLiveRecruiting")}</span>
          <strong>{summary.recruiting || 0}</strong>
        </div>
        <div className="tiktok-live-page__kpi">
          <span>{translate("tiktokLiveLatest")}</span>
          <strong>{formatTimestamp(summary.lastReceivedAt, language)}</strong>
        </div>
      </section>

      {error ? <p className="tiktok-live-page__error">{error}</p> : null}
      {loading ? <p className="tiktok-live-page__status">{translate("tiktokLiveLoading")}</p> : null}

      {!loading && !items.length ? (
        <p className="tiktok-live-page__status">{translate("tiktokLiveEmpty")}</p>
      ) : null}

      {!loading && items.length ? (
        <div className="tiktok-live-page__table-wrap">
          <table className="tiktok-live-page__table">
            <thead>
              <tr>
                <th>{translate("tiktokLiveUsername")}</th>
                <th>{translate("tiktokLiveCommand")}</th>
                <th>{translate("tiktokLiveCampaign")}</th>
                <th>{translate("tiktokLiveFunnel")}</th>
                <th>{translate("tiktokLiveTimestamp")}</th>
                <th>{translate("tiktokLiveStatus")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id || `${row.username}-${row.receivedAt}`}>
                  <td>{row.username || "—"}</td>
                  <td>{row.command || "—"}</td>
                  <td>{row.campaign || "—"}</td>
                  <td>{row.funnel || "—"}</td>
                  <td>{formatTimestamp(row.receivedAt, language)}</td>
                  <td>
                    <StatusBadge variant="success">
                      {translate("tiktokLiveStatusCaptured")}
                    </StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
