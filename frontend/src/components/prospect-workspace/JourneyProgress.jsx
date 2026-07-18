import { useLanguage } from "../../i18n/LanguageContext";
import { getJourneyStepLabelKey } from "../../engines/prospectWorkspaceViewModel";

export default function JourneyProgress({ journey }) {
  const { translate } = useLanguage();

  if (!journey?.steps?.length) {
    return null;
  }

  return (
    <section className="journey-progress" aria-label={translate("workspaceSectionJourney")}>
      <h2 className="workspace-eyebrow">{translate("workspaceSectionJourney")}</h2>
      <ol className="journey-progress__track">
        {journey.steps.map((step, index) => (
          <li
            key={step.key}
            className={`journey-progress__step journey-progress__step--${step.state}`}
          >
            <div className="journey-progress__node" aria-hidden="true">
              {step.state === "complete" ? "✓" : index + 1}
            </div>
            <span className="journey-progress__label">
              {translate(getJourneyStepLabelKey(step.key))}
            </span>
            {index < journey.steps.length - 1 ? (
              <span className="journey-progress__connector" aria-hidden="true" />
            ) : null}
          </li>
        ))}
      </ol>
      {journey.terminalState ? (
        <div className="journey-progress__terminal">
          {translate("workspaceJourneyTerminal", { state: journey.terminalState })}
        </div>
      ) : null}
    </section>
  );
}
