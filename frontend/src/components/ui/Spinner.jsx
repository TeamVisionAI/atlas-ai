import "../../styles/atlas-ui.css";

export default function Spinner({ inline = false, label }) {
  return (
    <span
      className={`atlas-ui-spinner ${inline ? "atlas-ui-spinner--inline" : ""}`.trim()}
      role="status"
      aria-label={label || "Loading"}
    />
  );
}
