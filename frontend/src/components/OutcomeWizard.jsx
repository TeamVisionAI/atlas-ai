import { useState, useEffect } from "react";
import MissionSemanticSection from "./mission-control/MissionSemanticSection";

function defaultFollowUpDate(days = 7) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function buildInitialForm(outcomeConfig) {
  const initial = {};

  for (const field of outcomeConfig?.fields || []) {
    if (field.type === "date" && field.defaultDays !== undefined) {
      initial[field.key] = defaultFollowUpDate(field.defaultDays);
    } else if (field.defaultValue) {
      initial[field.key] = field.defaultValue;
    } else {
      initial[field.key] = "";
    }
  }

  return initial;
}

function FollowUpRecommendation({ recommendation, hideTechnicalDetails = false }) {
  if (!recommendation) {
    return null;
  }

  const hasVisibleContent =
    recommendation.recommendedFollowUpDate ||
    recommendation.reminderSchedule ||
    recommendation.preferredChannel ||
    recommendation.suggestedScript;

  if (hideTechnicalDetails && !hasVisibleContent) {
    return null;
  }

  return (
    <div className="outcome-wizard__recommendation">
      <strong>Atlas Recommendation</strong>
      {!hideTechnicalDetails && recommendation.workflowLabel ? (
        <p style={{ margin: "8px 0 4px" }}>Workflow: {recommendation.workflowLabel}</p>
      ) : null}
      {recommendation.recommendedFollowUpDate ? (
        <p style={{ margin: "4px 0" }}>
          Follow-up date: {recommendation.recommendedFollowUpDate}
        </p>
      ) : null}
      {recommendation.reminderSchedule ? (
        <p style={{ margin: "4px 0" }}>Reminder: {recommendation.reminderSchedule}</p>
      ) : null}
      {recommendation.preferredChannel ? (
        <p style={{ margin: "4px 0" }}>Channel: {recommendation.preferredChannel}</p>
      ) : null}
      {recommendation.suggestedScript ? (
        <p style={{ margin: "8px 0 0", fontStyle: "italic" }}>
          “{recommendation.suggestedScript}”
        </p>
      ) : null}
    </div>
  );
}

export default function OutcomeWizard({
  outcome,
  outcomeConfig,
  prospectName,
  onComplete,
  onBack,
  hideTechnicalDetails = false,
  useSemanticSections = false
}) {
  const [form, setForm] = useState(() => buildInitialForm(outcomeConfig));

  const title = outcomeConfig?.label || outcome;

  useEffect(() => {
    setForm(buildInitialForm(outcomeConfig));
  }, [outcome]);

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function renderField(field) {
    const commonProps = {
      value: form[field.key] || "",
      onChange: (event) => updateField(field.key, event.target.value)
    };

    if (field.type === "textarea") {
      return (
        <label key={field.key} className="outcome-wizard__field">
          <span className="outcome-wizard__field-label">{field.label}</span>
          <textarea rows={3} {...commonProps} />
        </label>
      );
    }

    if (field.type === "select") {
      return (
        <label key={field.key} className="outcome-wizard__field">
          <span className="outcome-wizard__field-label">{field.label}</span>
          <select {...commonProps}>
            {(field.options || []).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      );
    }

    return (
      <label key={field.key} className="outcome-wizard__field">
        <span className="outcome-wizard__field-label">{field.label}</span>
        <input type={field.type || "text"} {...commonProps} />
      </label>
    );
  }

  const fields = outcomeConfig?.fields || [];
  const detailFields = fields.filter((field) => field.type !== "textarea");
  const noteFields = fields.filter((field) => field.type === "textarea");

  const wizardBody = (
    <>
      <h3 className="outcome-wizard__title">{title}</h3>
      {prospectName ? (
        <p className="outcome-wizard__intro">
          What happened during the interview with {prospectName}?
        </p>
      ) : (
        <p className="outcome-wizard__intro">What happened during the interview?</p>
      )}

      <FollowUpRecommendation
        recommendation={outcomeConfig?.followUpRecommendation}
        hideTechnicalDetails={hideTechnicalDetails}
      />

      {detailFields.map((field) => renderField(field))}

      {noteFields.map((field) =>
        useSemanticSections ? (
          <MissionSemanticSection key={field.key} variant="notes">
            {renderField(field)}
          </MissionSemanticSection>
        ) : (
          renderField(field)
        )
      )}

      <ActionRow
        onBack={onBack}
        onSave={() => onComplete(form)}
        saveLabel={`Save ${title}`}
      />
    </>
  );

  if (useSemanticSections) {
    return <div className="outcome-wizard outcome-wizard--semantic">{wizardBody}</div>;
  }

  return (
    <div className="outcome-wizard">
      {wizardBody}
    </div>
  );
}

function ActionRow({ onBack, onSave, saveLabel }) {
  return (
    <div className="outcome-wizard__actions">
      <button type="button" className="outcome-wizard__back" onClick={onBack}>
        Back
      </button>
      <button type="button" className="outcome-wizard__save" onClick={onSave}>
        {saveLabel}
      </button>
    </div>
  );
}
