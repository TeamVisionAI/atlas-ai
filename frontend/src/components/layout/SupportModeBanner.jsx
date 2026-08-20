import {
  isSupportModeBannerVisible,
  supportModeBannerLabel
} from "../../security/platformAccess";
import "./SupportModeBanner.css";

export default function SupportModeBanner({ supportMode, onExit, exiting = false, translate }) {
  if (!isSupportModeBannerVisible(supportMode)) {
    return null;
  }

  return (
    <div className="support-mode-banner" role="status" data-testid="support-mode-banner">
      <strong className="support-mode-banner__label">{supportModeBannerLabel(supportMode)}</strong>
      <span className="support-mode-banner__hint">
        {translate("supportModeBannerHint")}
      </span>
      <button
        type="button"
        className="support-mode-banner__exit"
        onClick={onExit}
        disabled={exiting}
      >
        {translate("supportModeExit")}
      </button>
    </div>
  );
}
