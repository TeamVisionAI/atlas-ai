export default function ConfigurationSection({ title, children, className = "" }) {
  return (
    <section className={`configuration-card${className ? ` ${className}` : ""}`}>
      {title ? <h2 className="configuration-card__title">{title}</h2> : null}
      {children}
    </section>
  );
}
