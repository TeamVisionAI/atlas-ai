import { useNavigate } from "react-router-dom";
import { useLanguage } from "../../i18n/LanguageContext";
import { appPath } from "../../config/appRoutes";
import { resolveRecommendationStepKey } from "../../config/quickCaptureRecommendations";

export default function QuickCaptureSuccess({
  prospect,
  recommendedAction,
  estimatedMinutes,
  onCaptureAnother
}) {
  const { translate } = useLanguage();
  const navigate = useNavigate();

  const displayName =
    prospect?.name ||
    [prospect?.first_name, prospect?.last_name].filter(Boolean).join(" ").trim() ||
    translate("quickCaptureSuccessUnknownProspect");

  const stepKey = resolveRecommendationStepKey(recommendedAction);
  const minutes = estimatedMinutes || 2;

  function goToMissionControl() {
    if (!prospect?.phone) {
      return;
    }

    const params = new URLSearchParams({ phone: prospect.phone });
    navigate(`${appPath("mission-control")}?${params.toString()}`);
  }

  return (
    <div className="quick-capture-success">
      <div className="quick-capture-success__icon" aria-hidden="true">
        ✅
      </div>

      <h1 className="quick-capture-success__title">{translate("quickCaptureSuccessTitle")}</h1>
      <p className="quick-capture-success__message">
        {translate("quickCaptureSuccessMessage", { name: displayName })}
      </p>

      <section className="quick-capture-recommendation" aria-labelledby="quick-capture-recommendation-title">
        <h2 id="quick-capture-recommendation-title" className="quick-capture-recommendation__title">
          {translate("quickCaptureRecommendationTitle")}
        </h2>
        <p className="quick-capture-recommendation__intro">
          {translate("quickCaptureRecommendationIntro")}
        </p>
        <p className="quick-capture-recommendation__step">{translate(stepKey)}</p>
        <p className="quick-capture-recommendation__time">
          {translate("quickCaptureRecommendationEstimatedTime")}{" "}
          {translate("quickCaptureRecommendationMinutes", { minutes })}
        </p>
      </section>

      <div className="quick-capture-success__actions">
        <button type="button" className="quick-capture-success__primary" onClick={goToMissionControl}>
          {translate("quickCaptureGoMissionControl")}
        </button>
        <button type="button" className="quick-capture-success__secondary" onClick={onCaptureAnother}>
          {translate("quickCaptureCaptureAnother")}
        </button>
      </div>
    </div>
  );
}
