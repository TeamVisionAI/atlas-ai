import { useState } from "react";
import { INTERVIEW_OUTCOMES } from "../types/outcomes";
import { applyOutcome } from "../engines/workflowEngine";

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

export default function OutcomeWizard({ outcome, prospectName, onComplete, onBack }) {
  const [form, setForm] = useState({});

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleSave(extra = {}) {
    onComplete(applyOutcome(outcome, { ...form, ...extra }));
  }

  if (outcome === INTERVIEW_OUTCOMES.RECRUITED) {
    return (
      <div>
        <h3 style={{ marginTop: 0 }}>Orientation Details</h3>
        <p style={{ color: "#94A3B8", marginTop: 0 }}>
          {prospectName} was recruited. Schedule orientation now.
        </p>

        <label style={{ display: "block", marginBottom: 6, fontSize: 13, color: "#94A3B8" }}>
          Orientation Date
        </label>
        <input
          type="date"
          value={form.orientationDate || ""}
          onChange={(event) => updateField("orientationDate", event.target.value)}
          style={fieldStyle}
        />

        <label style={{ display: "block", marginBottom: 6, fontSize: 13, color: "#94A3B8" }}>
          Orientation Time
        </label>
        <input
          type="time"
          value={form.orientationTime || ""}
          onChange={(event) => updateField("orientationTime", event.target.value)}
          style={fieldStyle}
        />

        <ActionRow onBack={onBack} onSave={() => handleSave()} saveLabel="Save" />
      </div>
    );
  }

  if (outcome === INTERVIEW_OUTCOMES.NO_SHOW) {
    return (
      <div>
        <h3 style={{ marginTop: 0 }}>No Show Follow Up</h3>
        <p style={{ color: "#94A3B8" }}>Choose the next step for this prospect.</p>

        <button type="button" style={buttonStyle} onClick={() => handleSave()}>
          Send Missed Appointment
        </button>
        <button
          type="button"
          style={buttonStyle}
          onClick={() => handleSave({ redirect: "reschedule" })}
        >
          Reschedule
        </button>
        <button type="button" style={{ ...buttonStyle, marginBottom: 0 }} onClick={onBack}>
          Back
        </button>
      </div>
    );
  }

  if (outcome === INTERVIEW_OUTCOMES.RESCHEDULED) {
    return (
      <div>
        <h3 style={{ marginTop: 0 }}>Reschedule Interview</h3>

        <label style={{ display: "block", marginBottom: 6, fontSize: 13, color: "#94A3B8" }}>
          Date
        </label>
        <input
          type="date"
          value={form.rescheduleDate || ""}
          onChange={(event) => updateField("rescheduleDate", event.target.value)}
          style={fieldStyle}
        />

        <label style={{ display: "block", marginBottom: 6, fontSize: 13, color: "#94A3B8" }}>
          Time
        </label>
        <input
          type="time"
          value={form.rescheduleTime || ""}
          onChange={(event) => updateField("rescheduleTime", event.target.value)}
          style={fieldStyle}
        />

        <label style={{ display: "block", marginBottom: 6, fontSize: 13, color: "#94A3B8" }}>
          Interview Type
        </label>
        <select
          value={form.rescheduleInterviewType || "Zoom"}
          onChange={(event) => updateField("rescheduleInterviewType", event.target.value)}
          style={fieldStyle}
        >
          <option value="Zoom">Zoom</option>
          <option value="Office">Office</option>
        </select>

        <ActionRow onBack={onBack} onSave={() => handleSave()} saveLabel="Save" />
      </div>
    );
  }

  if (outcome === INTERVIEW_OUTCOMES.NEEDS_MORE_TIME) {
    return (
      <div>
        <h3 style={{ marginTop: 0 }}>Follow Up</h3>

        <label style={{ display: "block", marginBottom: 6, fontSize: 13, color: "#94A3B8" }}>
          Follow Up Date
        </label>
        <input
          type="date"
          value={form.followUpDate || ""}
          onChange={(event) => updateField("followUpDate", event.target.value)}
          style={fieldStyle}
        />

        <label style={{ display: "block", marginBottom: 6, fontSize: 13, color: "#94A3B8" }}>
          Follow Up Time
        </label>
        <input
          type="time"
          value={form.followUpTime || ""}
          onChange={(event) => updateField("followUpTime", event.target.value)}
          style={fieldStyle}
        />

        <ActionRow onBack={onBack} onSave={() => handleSave()} saveLabel="Save" />
      </div>
    );
  }

  if (outcome === INTERVIEW_OUTCOMES.NOT_INTERESTED) {
    return (
      <div>
        <h3 style={{ marginTop: 0 }}>Not Interested</h3>

        <label style={{ display: "block", marginBottom: 6, fontSize: 13, color: "#94A3B8" }}>
          Reason
        </label>
        <textarea
          value={form.notInterestedReason || ""}
          onChange={(event) => updateField("notInterestedReason", event.target.value)}
          rows={3}
          style={{ ...fieldStyle, resize: "vertical" }}
        />

        <label style={{ display: "block", marginBottom: 6, fontSize: 13, color: "#94A3B8" }}>
          Optional Future Reminder
        </label>
        <input
          type="date"
          value={form.futureReminder || ""}
          onChange={(event) => updateField("futureReminder", event.target.value)}
          style={fieldStyle}
        />

        <ActionRow onBack={onBack} onSave={() => handleSave()} saveLabel="Save" />
      </div>
    );
  }

  return null;
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

export function WorkflowGateModal({
  prospectName,
  onComplete
}) {
  const [selectedOutcome, setSelectedOutcome] = useState(null);

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

            {Object.values(INTERVIEW_OUTCOMES).map((outcome) => (
              <button
                key={outcome}
                type="button"
                style={buttonStyle}
                onClick={() => setSelectedOutcome(outcome)}
              >
                {outcome}
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
