import { useMemo, useState } from "react";
import OutcomeWizard from "./OutcomeWizard";
import { saveInterviewOutcome } from "../services/missionControlService";
import { useLanguage } from "../i18n/LanguageContext";

const panelStyle = {
  background: "#111827",
  border: "1px solid #374151",
  borderRadius: 12,
  padding: 24,
  color: "#fff"
};

const buttonStyle = {
  width: "100%",
  textAlign: "left",
  padding: "14px 16px",
  marginBottom: 10,
  borderRadius: 8,
  border: "1px solid #374151",
  background: "#1F2937",
  color: "#fff",
  cursor: "pointer",
  fontSize: 15
};

const categoryTitleStyle = {
  margin: "16px 0 8px",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#94A3B8"
};

const metaStyle = {
  display: "flex",
  gap: 16,
  flexWrap: "wrap",
  marginBottom: 16,
  fontSize: 13,
  color: "#94A3B8"
};

function findOutcomeConfig(categories, outcomeId) {
  for (const category of categories || []) {
    const match = category.outcomes?.find((outcome) => outcome.id === outcomeId);

    if (match) {
      return match;
    }
  }

  return null;
}

/**
 * Inline Workflow Gate panel — grouped interview outcomes from server config.
 */
export default function WorkflowGatePanel({
  gate,
  workflow,
  prospectName,
  phone,
  onComplete
}) {
  const { translate } = useLanguage();
  const [selectedOutcome, setSelectedOutcome] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const categories = gate?.outcomeCategories || [];
  const selectedOutcomeConfig = useMemo(
    () => findOutcomeConfig(categories, selectedOutcome),
    [categories, selectedOutcome]
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
    <div style={panelStyle}>
      <h3 style={{ marginTop: 0, marginBottom: 8 }}>
        {gate?.title || translate("workflowGateTitle")}
      </h3>
      <p style={{ color: "#94A3B8", marginTop: 0, lineHeight: 1.6 }}>
        {gate?.message || translate("workflowGateMessage")}
      </p>

      {workflow ? (
        <div style={metaStyle}>
          <span>
            {translate("workflowGateMilestone")}{" "}
            <strong style={{ color: "#E2E8F0" }}>
              {formatCanonicalMilestone(workflow.canonicalMilestone)}
            </strong>
          </span>
          <span>
            {translate("workflowGateOwner")}{" "}
            <strong style={{ color: "#E2E8F0" }}>
              {formatOwnership(workflow.workflowOwnership, translate)}
            </strong>
          </span>
        </div>
      ) : null}

      {loading ? (
        <p style={{ color: "#94A3B8", margin: "12px 0" }}>{translate("workflowGateSaving")}</p>
      ) : null}

      {error ? (
        <p style={{ color: "#FCA5A5", margin: "12px 0", fontSize: 14 }}>{error}</p>
      ) : null}

      {success ? (
        <p style={{ color: "#86EFAC", margin: "12px 0", fontSize: 14 }}>{success}</p>
      ) : null}

      {!selectedOutcome ? (
        categories.map((category) => (
          <div key={category.id}>
            <h4 style={categoryTitleStyle}>{category.label}</h4>
            {category.outcomes.map((outcome) => (
              <button
                key={outcome.id}
                type="button"
                style={{
                  ...buttonStyle,
                  opacity: loading ? 0.6 : 1,
                  pointerEvents: loading ? "none" : "auto"
                }}
                disabled={loading}
                onClick={() => setSelectedOutcome(outcome.id)}
              >
                {outcome.label}
              </button>
            ))}
          </div>
        ))
      ) : (
        <OutcomeWizard
          outcome={selectedOutcome}
          outcomeConfig={selectedOutcomeConfig}
          prospectName={prospectName}
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

function formatCanonicalMilestone(value) {
  if (!value) {
    return "—";
  }

  return String(value)
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

function formatOwnership(value, translate) {
  if (!value) {
    return "—";
  }

  if (value === "WAITING_EVENT") {
    return translate("workflowGateOwnershipWaiting");
  }

  return String(value)
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}
