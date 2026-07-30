import { Link } from "react-router-dom";
import { useLanguage } from "../../i18n/LanguageContext";
import { appPath } from "../../config/appRoutes";
import { buildProspectCenterPath } from "../../utils/prospectRoutes";
import "./MissionControlDashboard.css";

const CARD_CONFIG = [
  {
    id: "appointments",
    metricKey: "interviews",
    labelKey: "missionControlDashboardAppointments",
    to: () => appPath("appointments")
  },
  {
    id: "followUps",
    metricKey: "followUps",
    labelKey: "missionControlDashboardFollowUps",
    to: () => appPath("follow-ups")
  },
  {
    id: "tasks",
    metricKey: "tasks",
    labelKey: "missionControlDashboardTasks",
    panelType: "tasks"
  },
  {
    id: "prospectsAction",
    metricKey: "prospectsAction",
    labelKey: "missionControlDashboardProspectsAction",
    to: ({ executiveFilter }) => buildProspectCenterPath({ filter: executiveFilter || undefined })
  }
];

export default function MissionControlDashboard({
  metrics,
  executiveFilter,
  onOpenMetricPanel
}) {
  const { translate } = useLanguage();

  return (
    <section className="mc-dashboard" aria-label={translate("missionControlDashboardLabel")}>
      <div className="mc-dashboard__grid">
        {CARD_CONFIG.map((card) => {
          const value = metrics?.[card.metricKey] ?? 0;
          const label = translate(card.labelKey);

          if (card.panelType) {
            return (
              <button
                key={card.id}
                type="button"
                className="mc-dashboard__card"
                onClick={() => onOpenMetricPanel?.(card.panelType)}
              >
                <span className="mc-dashboard__value">{value}</span>
                <span className="mc-dashboard__label">{label}</span>
              </button>
            );
          }

          const href = card.to({ executiveFilter });

          return (
            <Link key={card.id} to={href} className="mc-dashboard__card">
              <span className="mc-dashboard__value">{value}</span>
              <span className="mc-dashboard__label">{label}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
