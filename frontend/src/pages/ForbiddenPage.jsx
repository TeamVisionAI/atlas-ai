import { Link } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { appPath } from "../config/appRoutes";
import "./ForbiddenPage.css";

export default function ForbiddenPage({ routeKey = "" }) {
  const { translate } = useLanguage();
  const { landingPath } = useWorkspace();

  return (
    <div className="forbidden-page">
      <div className="forbidden-page__card">
        <p className="forbidden-page__code">403</p>
        <h1>{translate("forbiddenTitle")}</h1>
        <p>{translate("forbiddenDescription")}</p>
        {routeKey ? (
          <p className="forbidden-page__meta">
            {translate("forbiddenRouteLabel")}: <code>{routeKey}</code>
          </p>
        ) : null}
        <Link className="forbidden-page__action" to={landingPath || appPath()}>
          {translate("forbiddenBackToWorkspace")}
        </Link>
      </div>
    </div>
  );
}
