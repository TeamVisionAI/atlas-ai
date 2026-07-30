import { useMemo, useState } from "react";
import OutcomeWizard from "./OutcomeWizard";
import { saveInterviewOutcome } from "../services/missionControlService";
import { useLanguage } from "../i18n/LanguageContext";
import "./WorkflowGatePanel.css";

function findOutcomeConfig(outcomes, outcomeId) {
  return outcomes?.find((outcome) => outcome.id === outcomeId) || null;
}

function flattenOutcomes(categories) {
  const seen = new Set();
  const outcomes = [];

  for (const category of categories || []) {
    for (const outcome of category.outcomes || []) {
      if (seen.has(outcome.id)) {
        continue;
      }

      seen.add(outcome.id);
      outcomes.push(outcome);
    }
  }

  return outcomes;
}

/**
 * Inline interview outcome panel — recruiter-facing options only.
 */
export default function WorkflowGatePanel({
  gate,
  prospectName,
  phone,
  onComplete
}) {
  const { translate } = useLanguage();
  const [selectedOutcome, setSelectedOutcome] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const outcomes = useMemo(
    () => flattenOutcomes(gate?.outcomeCategories),
    [gate?.outcomeCategories]
  );

  const selectedOutcomeConfig = useMemo(
    () => findOutcomeConfig(outcomes, selectedOutcome),
    [outcomes, selectedOutcome]
  );

  async function handleOutcomeComplete(formState) {
    if (!phone || !selectedOutcome) {
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await saveInterviewOutcome(phone, {
        outcome: selectedOutcome,
        fields: formState,
        followUpRecommendation: selectedOutcomeConfig?.followUpRecommendation,
        interactionNotes: formState.notes || undefined
      });

      if (!result.success) {
        throw new Error(result.message || translate("workflowGateSaveError"));
      }

      setSuccess(translate("workflowGateSaveSuccess"));
      await onComplete?.(formState, result);
    } catch (err) {
      console.error(err);
      setError(err.message || translate("workflowGateSaveUnexpected"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="workflow-gate-panel" id="workflow-outcome-gate">
      <h3 className="workflow-gate-panel__title">
        {gate?.title || translate("workflowGateTitle")}
      </h3>
      <p className="workflow-gate-panel__message">
        {gate?.message || translate("workflowGateMessage")}
      </p>

      {loading ? (
        <p className="workflow-gate-panel__status">{translate("workflowGateSaving")}</p>
      ) : null}

      {error ? (
        <p className="workflow-gate-panel__error" role="alert">
          {error}
        </p>
      ) : null}

      {success ? (
        <p className="workflow-gate-panel__success" role="status">
          {success}
        </p>
      ) : null}

      {!selectedOutcome ? (
        <div className="workflow-gate-panel__options" role="list">
          {outcomes.map((outcome) => (
            <button
              key={outcome.id}
              type="button"
              className="workflow-gate-panel__option"
              disabled={loading}
              onClick={() => setSelectedOutcome(outcome.id)}
            >
              {outcome.label}
            </button>
          ))}
        </div>
      ) : (
        <OutcomeWizard
          outcome={selectedOutcome}
          outcomeConfig={selectedOutcomeConfig}
          prospectName={prospectName}
          hideTechnicalDetails
          onBack={() => {
            setSelectedOutcome(null);
            setError(null);
          }}
          onComplete={handleOutcomeComplete}
        />
      )}
    </div>
  );
}
