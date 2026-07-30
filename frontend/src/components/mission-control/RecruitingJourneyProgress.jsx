import { useLanguage } from "../../i18n/LanguageContext";
import "./RecruitingJourneyProgress.css";

const STEP_LABEL_KEYS = {
  new_lead: "missionControlFunnelNewLead",
  contacted: "missionControlFunnelContacted",
  qualified: "missionControlFunnelQualified",
  interview_scheduled: "missionControlFunnelInterviewScheduled"
};

export default function RecruitingJourneyProgress({ recruitingStatus }) {
  const { translate } = useLanguage();
  const steps = recruitingStatus?.steps || [];

  if (!steps.length) {
    return null;
  }

  return (
    <ol
      className="mc-journey"
      aria-label={translate("missionControlRecruitingStatus")}
    >
      {steps.map((step, index) => (
        <li key={step.key} className={`mc-journey__step mc-journey__step--${step.state}`}>
          <span className="mc-journey__marker" aria-hidden="true">
            {step.state === "complete" ? "✓" : index + 1}
          </span>
          <span className="mc-journey__label">
            {translate(STEP_LABEL_KEYS[step.key] || step.key)}
          </span>
          {index < steps.length - 1 ? (
            <span className="mc-journey__connector" aria-hidden="true" />
          ) : null}
        </li>
      ))}
    </ol>
  );
}
