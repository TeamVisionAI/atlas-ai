import { useId, useState } from "react";

/**
 * Collapsible workspace section with one-line summary when collapsed.
 * Sprint 10.2 UX rule: leaders can scan without opening every section.
 */
export default function WorkspaceSection({
  title,
  summary,
  children,
  defaultExpanded = false,
  collapsible = true,
  className = ""
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const contentId = useId();
  const isOpen = collapsible ? expanded : true;

  return (
    <section className={`workspace-section ${className}`.trim()}>
      {collapsible ? (
        <button
          type="button"
          className="workspace-section__toggle"
          aria-expanded={isOpen}
          aria-controls={contentId}
          onClick={() => setExpanded((current) => !current)}
        >
          <span className="workspace-section__heading">
            <span className="workspace-section__title">{title}</span>
            {!isOpen && summary ? (
              <span className="workspace-section__summary">{summary}</span>
            ) : null}
          </span>
          <span className="workspace-section__chevron" aria-hidden="true">
            {isOpen ? "▲" : "▼"}
          </span>
        </button>
      ) : (
        <div className="workspace-section__header">
          <h3 className="workspace-section__title">{title}</h3>
        </div>
      )}

      {isOpen ? (
        <div id={contentId} className="workspace-section__body">
          {children}
        </div>
      ) : null}
    </section>
  );
}
