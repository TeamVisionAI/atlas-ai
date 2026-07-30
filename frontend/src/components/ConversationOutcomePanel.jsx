import KnownInformationSection from "./mission-control/KnownInformationSection";
import WorkflowRequirementsSection from "./mission-control/WorkflowRequirementsSection";
import QualificationForm from "./mission-control/QualificationForm";
import ConversationOutcomeSection from "./mission-control/ConversationOutcomeSection";
import { useLanguage } from "../i18n/LanguageContext";

export default function ConversationOutcomePanel({
  phone,
  conversationOutcome,
  disabled = false,
  onSaved,
  showKnownInformation = true
}) {
  const { translate } = useLanguage();

  if (!conversationOutcome) {
    return null;
  }

  const requiredInputs = conversationOutcome.requiredInputs || [];
  const workflowRequirements = conversationOutcome.workflowRequirements || [];
  const hasRequiredInputs = requiredInputs.length > 0;
  const canRecordOutcome = conversationOutcome.canRecordOutcome !== false;
  const hasKnownInformation = (conversationOutcome.knownInformation || []).length > 0;
  const hasWorkflowRequirements = workflowRequirements.length > 0;

  return (
    <div className="conversation-outcome-stack">
      {showKnownInformation && hasKnownInformation ? (
        <section className="conversation-outcome">
          <KnownInformationSection items={conversationOutcome.knownInformation} />
        </section>
      ) : null}

      <QualificationForm
        phone={phone}
        conversationOutcome={conversationOutcome}
        disabled={disabled}
        onSaved={onSaved}
      />

      {hasWorkflowRequirements ? (
        <section className="conversation-outcome">
          <WorkflowRequirementsSection requirements={workflowRequirements} />
        </section>
      ) : null}

      {!hasRequiredInputs && canRecordOutcome ? (
        <ConversationOutcomeSection
          phone={phone}
          conversationOutcome={conversationOutcome}
          disabled={disabled}
          onSaved={onSaved}
        />
      ) : null}

      {!hasRequiredInputs && conversationOutcome.recordedOutcome ? (
        <section className="conversation-outcome conversation-outcome--recorded">
          <h3 className="conversation-outcome__title">{translate("conversationOutcomeTitle")}</h3>
          <p className="conversation-outcome__recorded">
            {translate("conversationOutcomeRecorded", {
              outcome: conversationOutcome.recordedOutcome.label
            })}
          </p>
        </section>
      ) : null}
    </div>
  );
}
