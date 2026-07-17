import { useState } from "react";
import { INTERVIEW_OUTCOMES } from "../types/outcomes";
import { applyOutcome } from "../engines/workflowEngine";

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
          {prospectName} was recruited. Schedule orientation now (optional).
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

        <ActionRow onBack={onBack} onSave={() => handleSave()} saveLabel="Save Recruited" />
      </div>
    );
  }

  if (outcome === INTERVIEW_OUTCOMES.NO_SHOW) {
    const defaultDate = defaultFollowUpDate();

    return (
      <div>
        <h3 style={{ marginTop: 0 }}>No Show Follow Up</h3>
        <p style={{ color: "#94A3B8" }}>Set when to follow up with this prospect.</p>

        <label style={{ display: "block", marginBottom: 6, fontSize: 13, color: "#94A3B8" }}>
          Follow Up Date
        </label>
        <input
          type="date"
          value={form.followUpDate || defaultDate}
          onChange={(event) => updateField("followUpDate", event.target.value)}
          style={fieldStyle}
        />

        <ActionRow
          onBack={onBack}
          onSave={() => handleSave({ followUpDate: form.followUpDate || defaultDate })}
          saveLabel="Save No Show"
        />
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

        <ActionRow onBack={onBack} onSave={() => handleSave()} saveLabel="Save Reschedule" />
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

        <ActionRow onBack={onBack} onSave={() => handleSave()} saveLabel="Save Follow Up" />
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

        <ActionRow onBack={onBack} onSave={() => handleSave()} saveLabel="Save Closed" />
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

function defaultFollowUpDate() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().slice(0, 10);
}
