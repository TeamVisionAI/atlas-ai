import "./ActionCard.css";

export default function ActionCard({
  icon,
  title,
  subtitle,
  variant = "default",
  featured = false,
  disabled = false,
  onClick,
  className = ""
}) {
  const variantClass =
    variant === "primary"
      ? "action-card--primary"
      : variant === "accent"
        ? "action-card--accent"
        : "";

  return (
    <button
      type="button"
      className={`action-card ${variantClass} ${featured ? "action-card--featured" : ""} ${className}`.trim()}
      onClick={onClick}
      disabled={disabled}
    >
      <span className="action-card__icon" aria-hidden="true">
        {icon}
      </span>
      <span>
        <span className="action-card__title">{title}</span>
        {subtitle ? <span className="action-card__subtitle">{subtitle}</span> : null}
      </span>
    </button>
  );
}
