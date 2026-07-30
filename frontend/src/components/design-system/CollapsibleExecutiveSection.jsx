import { useId, useState } from "react";
import "./CollapsibleExecutiveSection.css";

export default function CollapsibleExecutiveSection({
  label,
  summaryCount,
  summaryLabel,
  defaultExpanded = false,
  className = "",
  children
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const panelId = useId();
  const summaryText =
    summaryCount != null && summaryCount !== ""
      ? summaryLabel
        ? `${label} (${summaryCount} ${summaryLabel})`
        : `${label} (${summaryCount})`
      : label;

  return (
    <section className={`collapsible-executive-section ${className}`.trim()}>
      <button
        type="button"
        className="collapsible-executive-section__toggle"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="collapsible-executive-section__label">{summaryText}</span>
        <span className="collapsible-executive-section__hint" aria-hidden="true">
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {expanded ? (
        <div id={panelId} className="collapsible-executive-section__content">
          {children}
        </div>
      ) : null}
    </section>
  );
}
