import "./ExecutivePanel.css";

export default function ExecutivePanel({ children, elevated = false, className = "" }) {
  return (
    <div className={`executive-panel ${elevated ? "executive-panel--elevated" : ""} ${className}`.trim()}>
      {children}
    </div>
  );
}
