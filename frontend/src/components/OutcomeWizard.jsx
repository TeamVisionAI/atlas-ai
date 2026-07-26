import { useState, useEffect } from "react";

const fieldStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #374151",
  background: "#1F2937",
  color: "#fff",
  marginBottom: 12,
  boxSizing: "border-box"
};

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

function FollowUpRecommendation({ recommendation }) {
  if (!recommendation) {
    return null;
  }

  return (
    <div
      style={{
        marginBottom: 16,
        padding: 12,
        borderRadius: 8,
        background: "#0F172A",
        border: "1px solid #334155",
        color: "#CBD5E1",
        fontSize: 13,
        lineHeight: 1.5
      }}
    >
      <strong style={{ color: "#E2E8F0" }}>Atlas Recommendation</strong>
      {recommendation.workflowLabel ? (
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
  onBack
}) {
  const [form, setForm] = useState(() => buildInitialForm(outcomeConfig));

  const title = outcomeConfig?.label || outcome;

  useEffect(() => {
    setForm(buildInitialForm(outcomeConfig));
  }, [outcome, outcomeConfig]);

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function renderField(field) {
    const commonProps = {
      value: form[field.key] || "",
      onChange: (event) => updateField(field.key, event.target.value),
      style: field.type === "textarea" ? { ...fieldStyle, resize: "vertical" } : fieldStyle
    };

    if (field.type === "textarea") {
      return (
        <label key={field.key} style={{ display: "block", marginBottom: 12 }}>
          <span style={{ display: "block", marginBottom: 6, fontSize: 13, color: "#94A3B8" }}>
            {field.label}
          </span>
          <textarea rows={3} {...commonProps} />
        </label>
      );
    }

    if (field.type === "select") {
      return (
        <label key={field.key} style={{ display: "block", marginBottom: 12 }}>
          <span style={{ display: "block", marginBottom: 6, fontSize: 13, color: "#94A3B8" }}>
            {field.label}
          </span>
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
      <label key={field.key} style={{ display: "block", marginBottom: 12 }}>
        <span style={{ display: "block", marginBottom: 6, fontSize: 13, color: "#94A3B8" }}>
          {field.label}
        </span>
        <input type={field.type || "text"} {...commonProps} />
      </label>
    );
  }

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      {prospectName ? (
        <p style={{ color: "#94A3B8", marginTop: 0 }}>
          Record the interview outcome for {prospectName}.
        </p>
      ) : null}

      <FollowUpRecommendation recommendation={outcomeConfig?.followUpRecommendation} />

      {(outcomeConfig?.fields || []).map((field) => renderField(field))}

      <ActionRow
        onBack={onBack}
        onSave={() => onComplete(form)}
        saveLabel={`Save ${title}`}
      />
    </div>
  );
}

function ActionRow({ onBack, onSave, saveLabel }) {
  return (
    <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
      <button
        type="button"
        onClick={onBack}
        style={{
          flex: 1,
          padding: "12px 14px",
          borderRadius: 8,
          border: "1px solid #374151",
          background: "transparent",
          color: "#94A3B8",
          cursor: "pointer"
        }}
      >
        Back
      </button>
      <button
        type="button"
        onClick={onSave}
        style={{
          flex: 1,
          padding: "12px 14px",
          borderRadius: 8,
          border: "none",
          background: "#1E3A8A",
          color: "#fff",
          cursor: "pointer",
          fontWeight: 600
        }}
      >
        {saveLabel}
      </button>
    </div>
  );
}
