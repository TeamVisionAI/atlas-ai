import { formatAtlasDateTime } from "../../utils/dateFormatter";
import { useLanguage } from "../../i18n/LanguageContext";

export default function ActivityTimeline({ activity }) {
  const { translate } = useLanguage();

  return (
    <section>
      <h2 className="executive-section-label">{translate("executiveRecentActivity")}</h2>
      <div className="executive-card executive-timeline">
        {activity.length ? (
          activity.map((entry) => (
            <div
              key={entry.id || `${entry.phone}-${entry.timestamp}`}
              className="executive-timeline__item"
            >
              <div className="executive-timeline__dot" />
              <div>
                <div className="executive-timeline__summary">{entry.summary}</div>
                <div className="executive-timeline__meta">
                  {entry.phone} · {formatAtlasDateTime(new Date(entry.timestamp))}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div style={{ padding: 20, color: "#64748B", fontSize: 14 }}>
            {translate("executiveActivityEmpty")}
          </div>
        )}
      </div>
    </section>
  );
}
