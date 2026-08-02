import { META_REVIEW_APP_VERSION, META_REVIEW_COPY } from "./metaReviewCopy";
import { formatMetaReviewVersionLabel } from "./metaReviewFormatters";
import "./metaReviewDesign.css";
import "./MetaReviewSettingsFooter.css";

export default function MetaReviewSettingsFooter() {
  const copy = META_REVIEW_COPY;

  const items = [
    { label: copy.settingsWorkspace, value: copy.settingsWorkspaceValue },
    { label: copy.settingsEnvironment, value: copy.settingsEnvironmentValue },
    { label: copy.settingsVersion, value: formatMetaReviewVersionLabel(META_REVIEW_APP_VERSION) }
  ];

  return (
    <footer className="meta-review-settings-footer" aria-label="Workspace information">
      <div className="meta-review-settings-footer__grid">
        {items.map((item) => (
          <div key={item.label} className="meta-review-metric">
            <span className="meta-review-metric__label">{item.label}</span>
            <p className="meta-review-metric__value">{item.value}</p>
          </div>
        ))}
      </div>
    </footer>
  );
}
