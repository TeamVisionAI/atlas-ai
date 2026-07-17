import { useState } from "react";
import OutcomeWizard from "./OutcomeWizard";

const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.72)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  zIndex: 1000
};

const modalStyle = {
  background: "#111827",
  border: "1px solid #374151",
  borderRadius: 12,
  color: "#fff",
  width: "100%",
  maxWidth: 520,
  maxHeight: "90vh",
  overflowY: "auto",
  padding: 24
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

/** @deprecated Sprint 8A.6 — prefer inline WorkflowGatePanel in Next Actions section. */
export function WorkflowGateModal({ prospectName, onComplete, outcomes = [] }) {
  const [selectedOutcome, setSelectedOutcome] = useState(null);
  const options =
    outcomes.length > 0
      ? outcomes
      : [
          "Recruited",
          "No Show",
          "Needs More Time",
          "Not Interested",
          "Rescheduled"
        ].map((label) => ({ id: label, label }));

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true" aria-labelledby="workflow-gate-title">
      <div style={modalStyle}>
        {!selectedOutcome ? (
          <>
            <h2 id="workflow-gate-title" style={{ marginTop: 0 }}>
              What happened?
            </h2>
            <p style={{ color: "#94A3B8", marginTop: 0 }}>
              Interview time has passed for {prospectName || "this prospect"}. Record the outcome
              before continuing.
            </p>

            {options.map((outcome) => (
              <button
                key={outcome.id}
                type="button"
                style={buttonStyle}
                onClick={() => setSelectedOutcome(outcome.id)}
              >
                {outcome.label}
              </button>
            ))}
          </>
        ) : (
          <OutcomeWizard
            outcome={selectedOutcome}
            prospectName={prospectName}
            onBack={() => setSelectedOutcome(null)}
            onComplete={onComplete}
          />
        )}
      </div>
    </div>
  );
}
