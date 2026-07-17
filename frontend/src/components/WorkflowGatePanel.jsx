import { useState } from "react";
import { INTERVIEW_OUTCOMES } from "../types/outcomes";
import OutcomeWizard from "./OutcomeWizard";
import { mapGateOutcomeToAdvance } from "../utils/workflowGateAdvance";
import { advanceMissionControlWorkflow } from "../services/missionControlService";

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

const metaStyle = {
  display: "flex",
  gap: 16,
  flexWrap: "wrap",
  marginBottom: 16,
  fontSize: 13,
  color: "#94A3B8"
};

/**
 * Inline Workflow Gate panel (Sprint 8A.6) — replaces empty Next Actions when gate is active.
 */
export default function WorkflowGatePanel({
  gate,
  workflow,
  prospectName,
  phone,
  onComplete
}) {
  const [selectedOutcome, setSelectedOutcome] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  async function handleOutcomeComplete(localState) {
    if (!phone || !selectedOutcome) {
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const payload = mapGateOutcomeToAdvance(selectedOutcome, localState);
      const result = await advanceMissionControlWorkflow(phone, payload);

      if (!result.success) {
        throw new Error(result.message || "Unable to save interview outcome.");
      }

      setSuccess("Outcome saved. Workflow updated.");
      await onComplete?.(localState, result);
    } catch (err) {
      console.error(err);
      setError(err.message || "Something went wrong saving the outcome.");
    } finally {
      setLoading(false);
    }
  }

  const outcomes =
    gate?.outcomes ||
    Object.values(INTERVIEW_OUTCOMES).map((outcome) => ({ id: outcome, label: outcome }));

  return (
    <div style={panelStyle}>
      <h3 style={{ marginTop: 0, marginBottom: 8 }}>
        {gate?.title || "Interview Outcome Required"}
      </h3>
      <p style={{ color: "#94A3B8", marginTop: 0, lineHeight: 1.6 }}>
        {gate?.message ||
          "This interview has already occurred. Record the result so Atlas can continue the workflow."}
      </p>

      {workflow ? (
        <div style={metaStyle}>
          <span>
            Milestone:{" "}
            <strong style={{ color: "#E2E8F0" }}>
              {formatCanonicalMilestone(workflow.canonicalMilestone)}
            </strong>
          </span>
          <span>
            Owner:{" "}
            <strong style={{ color: "#E2E8F0" }}>
              {formatOwnership(workflow.workflowOwnership)}
            </strong>
          </span>
        </div>
      ) : null}

      {loading ? (
        <p style={{ color: "#94A3B8", margin: "12px 0" }}>Saving outcome…</p>
      ) : null}

      {error ? (
        <p style={{ color: "#FCA5A5", margin: "12px 0", fontSize: 14 }}>{error}</p>
      ) : null}

      {success ? (
        <p style={{ color: "#86EFAC", margin: "12px 0", fontSize: 14 }}>{success}</p>
      ) : null}

      {!selectedOutcome ? (
        outcomes.map((outcome) => (
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
        ))
      ) : (
        <OutcomeWizard
          outcome={selectedOutcome}
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

function formatOwnership(value) {
  if (!value) {
    return "—";
  }

  if (value === "WAITING_EVENT") {
    return "Waiting Event";
  }

  return String(value)
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}
