import "./ExecutiveSection.css";

export default function ExecutiveSection({ label, children, className = "" }) {
  return (
    <section className={`executive-section ${className}`.trim()}>
      {label ? <h3 className="executive-section__label">{label}</h3> : null}
      <div className="executive-section__content">{children}</div>
    </section>
  );
}
