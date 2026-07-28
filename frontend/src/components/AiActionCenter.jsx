import { useLanguage } from "../i18n/LanguageContext";

const cardStyle = {
  background: "#111827",
  border: "1px solid #374151",
  borderRadius: 12,
  padding: "16px 20px",
  color: "#fff"
};

const overrideButtonStyle = {
  border: "1px solid #374151",
  background: "#1F2937",
  color: "#E5E7EB",
  borderRadius: 8,
  padding: "8px 12px",
  fontSize: 12,
  cursor: "pointer"
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

function formatWorkAuthorization(value, translate) {
  if (value === true) {
    return translate("missionControlAiWorkAuthorizationYes");
  }

  if (value === false) {
    return translate("missionControlAiWorkAuthorizationNo");
  }

  return translate("missionControlAiWorkAuthorizationUnknown");
}

function riskColor(level) {
  if (level === "Low") {
    return "#86EFAC";
  }

  if (level === "Medium") {
    return "#FCD34D";
  }

  return "#FCA5A5";
}

export default function AiActionCenter({
  actionCenter,
  onExecuteAction,
  onHumanOverride
}) {
  const { translate } = useLanguage();

  if (!actionCenter) {
    return null;
  }

  const confidencePercent =
    actionCenter.confidencePercent ??
    Math.round((actionCenter.confidence || 0) * 100);
  const overrides = actionCenter.humanOverrides || {};

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
      <ActionRow
        label={translate("missionControlAiQualified")}
        value={
          actionCenter.qualified === true
            ? translate("missionControlAiQualifiedYes")
            : actionCenter.qualified === false
              ? translate("missionControlAiQualifiedNo")
              : "—"
        }
      />
      <ActionRow
        label={translate("missionControlAiInterviewScheduled")}
        value={
          actionCenter.interviewScheduled === true
            ? translate("missionControlAiInterviewScheduledYes")
            : actionCenter.interviewScheduled === false
              ? translate("missionControlAiInterviewScheduledNo")
              : "—"
        }
      />
      <ActionRow
        label={translate("missionControlAiWorkAuthorization")}
        value={formatWorkAuthorization(actionCenter.workAuthorization, translate)}
      />
      <ActionRow
        label={translate("missionControlAiLanguage")}
        value={actionCenter.language || "—"}
      />
      <ActionRow
        label={translate("missionControlAiRiskLevel")}
        value={
          actionCenter.riskLevel ? (
            <span style={{ color: riskColor(actionCenter.riskLevel) }}>
              {actionCenter.riskLevel}
            </span>
          ) : (
            "—"
          )
        }
      />

      {onHumanOverride ? (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            marginTop: 16,
            paddingTop: 12,
            borderTop: "1px solid #1F2937"
          }}
        >
          {overrides.approve !== false ? (
            <button
              type="button"
              style={overrideButtonStyle}
              onClick={() => onHumanOverride("approve")}
            >
              {translate("missionControlAiOverrideApprove")}
            </button>
          ) : null}
          {overrides.edit ? (
            <button
              type="button"
              style={overrideButtonStyle}
              onClick={() => onHumanOverride("edit")}
            >
              {translate("missionControlAiOverrideEdit")}
            </button>
          ) : null}
          {overrides.retry ? (
            <button
              type="button"
              style={overrideButtonStyle}
              onClick={() => onHumanOverride("retry")}
            >
              {translate("missionControlAiOverrideRetry")}
            </button>
          ) : null}
          {overrides.escalate ? (
            <button
              type="button"
              style={overrideButtonStyle}
              onClick={() => onHumanOverride("escalate")}
            >
              {translate("missionControlAiOverrideEscalate")}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
