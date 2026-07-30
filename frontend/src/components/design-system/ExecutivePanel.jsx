import "./ExecutivePanel.css";

export default function ExecutivePanel({ children, elevated = false, className = "", id }) {
  return (
    <div
      id={id}
      className={`executive-panel ${elevated ? "executive-panel--elevated" : ""} ${className}`.trim()}
    >
      {children}
    </div>
  );
}
