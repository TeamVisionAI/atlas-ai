import SlideOverPanel from "./SlideOverPanel";
import {
  METRIC_PANEL_TYPES,
  buildMetricPanelData,
  getMetricPanelTitle
} from "../engines/metricsEngine";

const rowStyle = {
  padding: "16px 24px",
  borderBottom: "1px solid #E5E7EB"
};

const openButtonStyle = {
  marginTop: 12,
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid #1E3A8A",
  background: "white",
  color: "#1E3A8A",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600
};

export default function AgentMetricPanel({ type, queue, onClose, onOpenWorkspace }) {
  const title = getMetricPanelTitle(type);
  const items = buildMetricPanelData(type, queue);

  return (
    <SlideOverPanel open={Boolean(type)} title={title} onClose={onClose}>
      {!items.length ? (
        <p style={{ padding: "16px 24px", color: "#64748B", margin: 0 }}>
          No items for today.
        </p>
      ) : null}

      {type === METRIC_PANEL_TYPES.INTERVIEWS
        ? items.map((item) => (
            <div key={`${item.phone}-${item.time}`} style={rowStyle}>
              <strong>{item.name}</strong>
              <div style={{ color: "#64748B", fontSize: 14, marginTop: 6 }}>
                {item.time} · {item.interviewType} · {item.status}
              </div>
              <button
                type="button"
                style={openButtonStyle}
                onClick={() => onOpenWorkspace(item.phone)}
              >
                Open Workspace
              </button>
            </div>
          ))
        : null}

      {type === METRIC_PANEL_TYPES.FOLLOW_UPS
        ? items.map((item) => (
            <div key={`${item.phone}-${item.dueTime}`} style={rowStyle}>
              <strong>{item.name}</strong>
              <div style={{ color: "#64748B", fontSize: 14, marginTop: 6 }}>
                {item.dueTime} · {item.status}
              </div>
              <button
                type="button"
                style={openButtonStyle}
                onClick={() => onOpenWorkspace(item.phone)}
              >
                Open Workspace
              </button>
            </div>
          ))
        : null}

      {type === METRIC_PANEL_TYPES.TASKS
        ? items.map((item) => (
            <div key={`${item.phone}-${item.task}`} style={rowStyle}>
              <strong>{item.task}</strong>
              <div style={{ color: "#64748B", fontSize: 14, marginTop: 6 }}>
                {item.name}
              </div>
              <button
                type="button"
                style={openButtonStyle}
                onClick={() => onOpenWorkspace(item.phone)}
              >
                Open Workspace
              </button>
            </div>
          ))
        : null}
    </SlideOverPanel>
  );
}
