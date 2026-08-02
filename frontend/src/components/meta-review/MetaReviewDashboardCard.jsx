import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { appPath } from "../../config/appRoutes";
import { fetchWhatsAppConfiguration } from "../../services/configurationService";
import { META_REVIEW_COPY } from "./metaReviewCopy";
import {
  formatMetaReviewConnectionStatus,
  formatMetaReviewSyncTime
} from "./metaReviewFormatters";
import "./metaReviewDesign.css";
import "./MetaReviewDashboardCard.css";

function countMessagesToday(activity = []) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return activity.filter((item) => {
    if (!item?.timestamp) {
      return false;
    }

    const at = new Date(item.timestamp).getTime();
    if (Number.isNaN(at) || at < start.getTime() || at >= end.getTime()) {
      return false;
    }

    const haystack = `${item.summary || ""} ${item.eventType || ""}`.toLowerCase();
    return haystack.includes("message") || haystack.includes("whatsapp") || haystack.includes("reminder");
  }).length;
}

export default function MetaReviewDashboardCard({ activity = [] }) {
  const copy = META_REVIEW_COPY;
  const [whatsapp, setWhatsapp] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetchWhatsAppConfiguration()
      .then((payload) => {
        if (!cancelled) {
          setWhatsapp(payload);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setWhatsapp(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const metrics = useMemo(() => {
    const connected = Boolean(whatsapp?.connected);
    const messagesToday = countMessagesToday(activity);
    const syncTime = formatMetaReviewSyncTime(whatsapp?.lastSync || whatsapp?.connectedAt);

    let connectedValue = "…";
    let messagesValue = "…";
    let syncValue = "…";

    if (!loading) {
      connectedValue = formatMetaReviewConnectionStatus(connected);
      messagesValue = messagesToday > 0 ? String(messagesToday) : copy.messagesTodayEmpty;
      syncValue = syncTime || copy.lastSyncEmpty;
    }

    return [
      { label: copy.metricConnected, value: connectedValue, empty: !loading && !connected },
      { label: copy.metricMessagesToday, value: messagesValue, empty: !loading && messagesToday === 0 },
      { label: copy.metricLastSync, value: syncValue, empty: !loading && !syncTime }
    ];
  }, [activity, copy, loading, whatsapp]);

  return (
    <section className="meta-review-surface meta-review-dashboard-card" aria-labelledby="meta-review-dashboard-card-title">
      <div className="meta-review-dashboard-card__header">
        <div>
          <h2 id="meta-review-dashboard-card-title" className="meta-review-dashboard-card__title">
            {copy.dashboardCardTitle}
          </h2>
          <p className="meta-review-dashboard-card__intro">{copy.dashboardCardIntro}</p>
        </div>
        <Link className="meta-review-link" to={appPath("settings/whatsapp")}>
          {copy.openWhatsAppIntegration}
        </Link>
      </div>

      <div className="meta-review-metric-grid">
        {metrics.map((metric) => (
          <article key={metric.label} className="meta-review-metric">
            <span className="meta-review-metric__label">{metric.label}</span>
            <p
              className={`meta-review-metric__value${metric.empty ? " meta-review-field__value--empty" : ""}`}
            >
              {metric.value}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
