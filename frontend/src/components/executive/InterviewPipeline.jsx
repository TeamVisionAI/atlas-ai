const STEPS = [
  { key: "scheduled", label: "Scheduled" },
  { key: "confirmed", label: "Confirmed" },
  { key: "completed", label: "Completed" },
  { key: "outcomeRecorded", label: "Outcome Recorded" },
  { key: "recruit", label: "Recruit" },
  { key: "orientation", label: "Orientation" }
];

export default function InterviewPipeline({ pipeline }) {
  return (
    <section>
      <h2 className="executive-section-label">Interview Pipeline</h2>
      <div className="executive-card executive-pipeline">
        {STEPS.map((step, index) => (
          <div key={step.key} className="executive-pipeline__step">
            <div className="executive-pipeline__label">{step.label}</div>
            <div className="executive-pipeline__count">{pipeline[step.key] ?? 0}</div>
            {index < STEPS.length - 1 ? (
              <div className="executive-pipeline__arrow" aria-hidden="true">
                ↓
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
