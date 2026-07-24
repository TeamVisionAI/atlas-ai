import { useLanguage } from "../i18n/LanguageContext";

const cardStyle = {
  background: "#111827",
  border: "1px solid #374151",
  borderRadius: 12,
  padding: "16px 20px",
  color: "#fff"
};

function ActionRow({ label, value, accent = false }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "140px 1fr",
        gap: 12,
        padding: "10px 0",
        borderBottom: "1px solid #1F2937"
      }}
    >
      <span style={{ color: "#94A3B8", fontSize: 13, fontWeight: 600 }}>{label}</span>
      <span
        style={{
          color: accent ? "#93C5FD" : "#E5E7EB",
          fontSize: 14,
          lineHeight: 1.5
        }}
      >
        {value}
      </span>
    </div>
  );
}

export default function AiActionCenter({ actionCenter, onExecuteAction }) {
  const { translate } = useLanguage();

  if (!actionCenter) {
    return null;
  }

  const confidencePercent = Math.round((actionCenter.confidence || 0) * 100);

  return (
    <div style={cardStyle}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 8
        }}
      >
        <h4 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
          {translate("missionControlAiActionCenterTitle")}
        </h4>
        {actionCenter.actionId && onExecuteAction ? (
          <button
            type="button"
            onClick={() => onExecuteAction(actionCenter.actionId)}
            style={{
              border: "1px solid #374151",
              background: "#172554",
              color: "#93C5FD",
              borderRadius: 999,
              padding: "6px 12px",
              fontSize: 12,
              cursor: "pointer"
            }}
          >
            {translate("missionControlAiActionCenterRun")}
          </button>
        ) : null}
      </div>

      <ActionRow
        label={translate("missionControlAiActionCenterPriority")}
        value={actionCenter.priority || "—"}
      />
      <ActionRow
        label={translate("missionControlAiActionCenterNextAction")}
        value={actionCenter.nextBestAction || "—"}
        accent
      />
      <ActionRow
        label={translate("missionControlAiActionCenterReason")}
        value={actionCenter.reason || "—"}
      />
      <ActionRow
        label={translate("missionControlAiActionCenterConfidence")}
        value={`${confidencePercent}%`}
      />
    </div>
  );
}
