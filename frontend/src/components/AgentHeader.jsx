import { getTimeGreeting } from "../engines/contextEngine";

const metricStyle = {
  textAlign: "center",
  minWidth: 72
};

export default function AgentHeader({
  agentName = "Agent",
  metrics,
  activeMetric,
  onMetricClick
}) {
  const greeting = getTimeGreeting();

  return (
    <header
      style={{
        background: "white",
        padding: "20px 30px",
        borderBottom: "1px solid #E5E7EB",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 20,
        flexWrap: "wrap"
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            background: "#1E3A8A",
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: 18,
            flexShrink: 0
          }}
          aria-hidden="true"
        >
          {agentName.charAt(0).toUpperCase()}
        </div>

        <div>
          <div style={{ color: "#64748B", fontSize: 13 }}>ATLAS AI</div>
          <h1 style={{ margin: 0, fontSize: 24 }}>
            {greeting}, {agentName}
          </h1>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 24,
          alignItems: "center",
          flexWrap: "wrap"
        }}
      >
        <Metric
          label="Interviews"
          value={metrics?.interviews ?? 0}
          active={activeMetric === "interviews"}
          onClick={() => onMetricClick?.("interviews")}
        />
        <Metric
          label="Follow Ups"
          value={metrics?.followUps ?? 0}
          active={activeMetric === "followUps"}
          onClick={() => onMetricClick?.("followUps")}
        />
        <Metric
          label="Tasks"
          value={metrics?.tasks ?? 0}
          active={activeMetric === "tasks"}
          onClick={() => onMetricClick?.("tasks")}
        />

        <div style={{ color: "#64748B", fontSize: 14 }}>🟢 Atlas Active</div>
      </div>
    </header>
  );
}

function Metric({ label, value, onClick, active }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...metricStyle,
        border: active ? "1px solid #1E3A8A" : "1px solid transparent",
        borderRadius: 10,
        padding: "8px 10px",
        background: active ? "#EFF6FF" : "transparent",
        cursor: "pointer"
      }}
    >
      <div style={{ fontSize: 24, fontWeight: 700, color: "#1E3A8A" }}>{value}</div>
      <div style={{ fontSize: 12, color: "#64748B" }}>{label}</div>
    </button>
  );
}
