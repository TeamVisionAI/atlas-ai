import { Link } from "react-router-dom";
import { useLanguage } from "../../../i18n/LanguageContext";
import { appPath } from "../../../config/appRoutes";
import { buildProspectCenterPath } from "../../../utils/prospectRoutes";

export default function ProspectWorkspaceHeader({ phone, onOpenMissionControl }) {
  const { translate } = useLanguage();

  return (
    <header className="prospect-workspace__toolbar">
      <Link to={appPath()} className="prospect-workspace__back">
        ← {translate("workspaceBack")}
      </Link>
      <span className="prospect-workspace__title">{translate("workspaceTitle")}</span>
      <Link to={buildProspectCenterPath()} className="prospect-workspace__mission-link">
        {translate("navProspectCenter")}
      </Link>
      <button
        type="button"
        className="prospect-workspace__mission-link"
        onClick={() => onOpenMissionControl(phone)}
      >
        {translate("executiveOpenMissionControl")}
      </button>
    </header>
  );
}
