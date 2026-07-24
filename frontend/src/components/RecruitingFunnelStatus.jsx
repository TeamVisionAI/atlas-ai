import { useLanguage } from "../i18n/LanguageContext";

const cardStyle = {
  background: "#111827",
  border: "1px solid #374151",
  borderRadius: 12,
  padding: "16px 20px",
  color: "#fff"
};

const STEP_LABEL_KEYS = {
  new_lead: "missionControlFunnelNewLead",
  contacted: "missionControlFunnelContacted",
  qualified: "missionControlFunnelQualified",
  interview_scheduled: "missionControlFunnelInterviewScheduled"
};

export default function RecruitingFunnelStatus({ recruitingStatus }) {
  const { translate } = useLanguage();

  if (!recruitingStatus?.steps?.length) {
    return null;
  }

  return (
    <div style={cardStyle}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 8
        }}
      >
        {recruitingStatus.steps.map((step, index) => (
          <div
            key={step.key}
            style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                minWidth: 88
              }}
            >
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 700,
                  background:
                    step.state === "complete"
                      ? "#166534"
                      : step.state === "current"
                        ? "#1D4ED8"
                        : "#1F2937",
                  color: step.state === "upcoming" ? "#64748B" : "#fff",
                  border: "1px solid #374151"
                }}
              >
                {step.state === "complete" ? "✓" : index + 1}
              </span>
              <span
                style={{
                  fontSize: 12,
                  textAlign: "center",
                  color: step.state === "current" ? "#93C5FD" : "#94A3B8",
                  fontWeight: step.state === "current" ? 700 : 500
                }}
              >
                {translate(STEP_LABEL_KEYS[step.key] || step.key)}
              </span>
            </div>
            {index < recruitingStatus.steps.length - 1 ? (
              <span style={{ color: "#475569", fontSize: 16, paddingBottom: 18 }}>↓</span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
