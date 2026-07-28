import ExecutiveDashboard from "./ExecutiveDashboard";
import { useLanguage } from "../i18n/LanguageContext";
import "./WorkspaceDashboard.css";

export default function TeamDashboard() {
  const { translate } = useLanguage();

  return (
    <div className="workspace-dashboard workspace-dashboard--team">
      <header className="workspace-dashboard__header workspace-dashboard__header--inline">
        <div>
          <p className="workspace-dashboard__eyebrow">{translate("workspaceLabelManagement")}</p>
          <h1>{translate("teamDashboardTitle")}</h1>
          <p className="workspace-dashboard__intro">{translate("teamDashboardIntro")}</p>
        </div>
      </header>
      <ExecutiveDashboard />
    </div>
  );
}
