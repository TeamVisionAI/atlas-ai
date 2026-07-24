import "../../styles/atlas-ui.css";

const VARIANTS = new Set(["neutral", "success", "warning", "danger", "info"]);

export default function StatusBadge({ children, variant = "neutral" }) {
  const tone = VARIANTS.has(variant) ? variant : "neutral";

  return <span className={`atlas-ui-badge atlas-ui-badge--${tone}`}>{children}</span>;
}
