export default function ConfigurationSection({ title, description, children, className = "" }) {
  return (
    <section className={`configuration-card${className ? ` ${className}` : ""}`}>
      {title ? <h2 className="configuration-card__title">{title}</h2> : null}
      {description ? <p className="configuration-card__description">{description}</p> : null}
      {children}
    </section>
  );
}
