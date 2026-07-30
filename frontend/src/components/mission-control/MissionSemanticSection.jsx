import "./missionSemanticSections.css";

export default function MissionSemanticSection({
  variant,
  title,
  description,
  children,
  className = "",
  ...props
}) {
  const variantClass = variant ? ` mission-semantic-section--${variant}` : "";

  return (
    <section
      className={`mission-semantic-section${variantClass}${className ? ` ${className}` : ""}`}
      {...props}
    >
      {title ? <h3 className="mission-semantic-section__title">{title}</h3> : null}
      {description ? <p className="mission-semantic-section__description">{description}</p> : null}
      {children}
    </section>
  );
}
