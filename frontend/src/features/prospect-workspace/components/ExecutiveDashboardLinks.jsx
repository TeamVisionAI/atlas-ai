import { memo } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../../../i18n/LanguageContext";
import { appPath } from "../../../config/appRoutes";

function buildExecutiveLink(focus, prospectCoreId) {
  const params = new URLSearchParams({ from: "workspace", focus });

  if (prospectCoreId) {
    params.set("prospectId", prospectCoreId);
  }

  return `${appPath()}?${params.toString()}`;
}

const LINKS = [
  { key: "conversion", labelKey: "workspaceExecutiveConversion", hintKey: "workspaceExecutiveConversionHint" },
  { key: "funnel", labelKey: "workspaceExecutiveFunnel", hintKey: "workspaceExecutiveFunnelHint" },
  { key: "trends", labelKey: "workspaceExecutiveTrends", hintKey: "workspaceExecutiveTrendsHint" },
  { key: "kpis", labelKey: "workspaceExecutiveKpis", hintKey: "workspaceExecutiveKpisHint" }
];

function ExecutiveDashboardLinks({ prospectCoreId }) {
  const { translate } = useLanguage();

  return (
    <section
      className="prospect-workspace-panel prospect-workspace-panel--executive"
      aria-label={translate("workspaceSectionExecutiveDashboard")}
    >
      <h2 className="workspace-eyebrow">{translate("workspaceSectionExecutiveDashboard")}</h2>
      <p className="prospect-workspace-panel__intro">{translate("workspaceExecutiveIntro")}</p>
      <ul className="prospect-workspace-links prospect-workspace-links--cards">
        {LINKS.map((link) => (
          <li key={link.key}>
            <Link
              to={buildExecutiveLink(link.key, prospectCoreId)}
              className="prospect-workspace-links__item prospect-workspace-links__item--card"
            >
              <span className="prospect-workspace-links__title">{translate(link.labelKey)}</span>
              <span className="prospect-workspace-links__hint">{translate(link.hintKey)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default memo(ExecutiveDashboardLinks);
