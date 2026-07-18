import { useLanguage } from "../i18n/LanguageContext";

export default function WorkflowCompleteBanner({
  titleKey = "missionControlWorkflowComplete",
  message,
  onNextPriority,
  hasNextPriority
}) {
  const { translate } = useLanguage();

  return (
    <div
      style={{
        background: "#ECFDF5",
        border: "1px solid #A7F3D0",
        borderRadius: 12,
        padding: "18px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap"
      }}
    >
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#065F46", marginBottom: 4 }}>
          ✅ {translate(titleKey)}
        </div>
        <div style={{ fontSize: 14, color: "#047857" }}>
          {message || translate("missionControlReadyNext")}
        </div>
      </div>

      <button
        type="button"
        onClick={onNextPriority}
        disabled={!hasNextPriority}
        style={{
          padding: "12px 20px",
          borderRadius: 8,
          border: "none",
          background: hasNextPriority ? "#1E3A8A" : "#CBD5E1",
          color: "white",
          cursor: hasNextPriority ? "pointer" : "not-allowed",
          fontWeight: 700,
          fontSize: 14,
          whiteSpace: "nowrap"
        }}
      >
        {translate("missionControlNextPriority")}
      </button>
    </div>
  );
}
