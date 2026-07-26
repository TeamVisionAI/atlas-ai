import KnownInformationSection from "./mission-control/KnownInformationSection";
import WorkflowRequirementsSection from "./mission-control/WorkflowRequirementsSection";
import RequiredInformationPanel from "./mission-control/RequiredInformationPanel";
import ConversationOutcomeSection from "./mission-control/ConversationOutcomeSection";

export default function ConversationOutcomePanel({
  phone,
  conversationOutcome,
  disabled = false,
  onSaved
}) {
  if (!conversationOutcome) {
    return null;
  }

  const requiredInputs = conversationOutcome.requiredInputs || [];
  const workflowRequirements = conversationOutcome.workflowRequirements || [];
  const hasRequiredInputs = requiredInputs.length > 0;
  const hasKnownInformation = (conversationOutcome.knownInformation || []).length > 0;
  const hasWorkflowRequirements = workflowRequirements.length > 0;

  return (
    <div className="conversation-outcome-stack">
      {hasKnownInformation ? (
        <section className="conversation-outcome">
          <KnownInformationSection items={conversationOutcome.knownInformation} />
        </section>
      ) : null}

      <RequiredInformationPanel
        phone={phone}
        requiredInputs={requiredInputs}
        conversationOutcome={conversationOutcome}
        disabled={disabled}
        onSaved={onSaved}
      />

      {hasWorkflowRequirements ? (
        <section className="conversation-outcome">
          <WorkflowRequirementsSection requirements={workflowRequirements} />
        </section>
      ) : null}

      {!hasRequiredInputs ? (
        <ConversationOutcomeSection
          phone={phone}
          conversationOutcome={conversationOutcome}
          disabled={disabled}
          onSaved={onSaved}
        />
      ) : null}
    </div>
  );
}
