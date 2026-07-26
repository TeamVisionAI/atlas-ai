import "./ExecutiveBadge.css";

const VARIANTS = {
  Critical: "critical",
  High: "high",
  Medium: "medium",
  Low: "low"
};

export default function ExecutiveBadge({ label, priority = "Medium" }) {
  const variant = VARIANTS[priority] || "medium";

  return <span className={`executive-badge executive-badge--${variant}`}>{label}</span>;
}
