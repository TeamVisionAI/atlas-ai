import { useLanguage } from "../../i18n/LanguageContext";

const STEPS = [
  { key: "scheduled", labelKey: "executivePipelineScheduled" },
  { key: "confirmed", labelKey: "executivePipelineConfirmed" },
  { key: "completed", labelKey: "executivePipelineCompleted" },
  { key: "outcomeRecorded", labelKey: "executivePipelineOutcomeRecorded" },
  { key: "recruit", labelKey: "executivePipelineRecruit" },
  { key: "orientation", labelKey: "executivePipelineOrientation" }
];

export default function InterviewPipeline({ pipeline }) {
  const { translate } = useLanguage();

  return (
    <section>
      <h2 className="executive-section-label">{translate("executiveInterviewPipeline")}</h2>
      <div className="executive-card executive-pipeline">
        {STEPS.map((step, index) => (
          <div key={step.key} className="executive-pipeline__step">
            <div className="executive-pipeline__label">{translate(step.labelKey)}</div>
            <div className="executive-pipeline__count">{pipeline[step.key] ?? 0}</div>
            {index < STEPS.length - 1 ? (
              <div className="executive-pipeline__arrow" aria-hidden="true">
                ↓
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
