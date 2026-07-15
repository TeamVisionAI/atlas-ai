export default function PipelineCard({ prospect }) {
    const steps = [
      "NEW",
      "QUALIFIED",
      "SCHEDULED",
      "CONFIRMED",
      "INTERVIEWED",
      "LICENSED"
    ];
  
    return (
      <div
        style={{
          background: "white",
          borderRadius: 14,
          padding: 24,
          boxShadow: "0 4px 12px rgba(0,0,0,.08)"
        }}
      >
        <h2 style={{ marginTop: 0 }}>📈 Recruiting Pipeline</h2>
  
        {steps.map((step) => (
          <div
            key={step}
            style={{
              padding: "10px 16px",
              marginBottom: 10,
              borderRadius: 8,
              background:
                prospect.current_step === step
                  ? "#2563EB"
                  : "#F3F4F6",
              color:
                prospect.current_step === step
                  ? "white"
                  : "#374151",
              fontWeight:
                prospect.current_step === step
                  ? "bold"
                  : "normal"
            }}
          >
            {step}
          </div>
        ))}
      </div>
    );
  }