function Skeleton({ className = "", style }) {
  return <div className={`executive-v2__skeleton ${className}`.trim()} style={style} aria-hidden="true" />;
}

export function SectionUnavailable({
  message,
  onRetry = null,
  retryLabel = "Retry"
}) {
  return (
    <div className="executive-v2__section-unavailable" role="status">
      <p>{message}</p>
      {typeof onRetry === "function" ? (
        <button type="button" className="executive-v2__button executive-v2__button--secondary" onClick={onRetry}>
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}

export function ExecutiveCard({
  title,
  action,
  children,
  className = "",
  loading = false,
  unavailable = false,
  unavailableMessage = "",
  onRetry = null,
  retryLabel = "Retry",
  footer = null
}) {
  let body = children;

  if (loading) {
    body = <Skeleton className="executive-v2__skeleton--block" />;
  } else if (unavailable) {
    body = (
      <SectionUnavailable
        message={unavailableMessage}
        onRetry={onRetry}
        retryLabel={retryLabel}
      />
    );
  }

  return (
    <section className={`executive-v2__card ${className}`.trim()}>
      <header className="executive-v2__card-header">
        <h2 className="executive-v2__card-title">{title}</h2>
        {action || null}
      </header>
      <div className="executive-v2__card-body">{body}</div>
      {footer ? <footer className="executive-v2__card-footer">{footer}</footer> : null}
    </section>
  );
}

export function KpiSkeletonRow() {
  return (
    <div className="executive-v2__kpi-row" aria-busy="true">
      {Array.from({ length: 6 }).map((_, index) => (
        <Skeleton key={index} className="executive-v2__skeleton--kpi" />
      ))}
    </div>
  );
}

const KPI_ACCENTS = {
  newProspects: "blue",
  qualified: "green",
  appointments: "purple",
  confirmed: "teal",
  completed: "amber",
  recruited: "navy"
};

export function KpiRow({
  cards = [],
  unavailable = false,
  unavailableMessage = "",
  onRetry = null,
  retryLabel = "Retry"
}) {
  if (!cards.length) {
    if (unavailable) {
      return (
        <div className="executive-v2__kpi-row executive-v2__kpi-row--unavailable">
          <SectionUnavailable
            message={unavailableMessage}
            onRetry={onRetry}
            retryLabel={retryLabel}
          />
        </div>
      );
    }
    return null;
  }

  return (
    <div className="executive-v2__kpi-row">
      {cards.map((card) => (
        <article
          key={card.key}
          className="executive-v2__kpi"
          data-accent={KPI_ACCENTS[card.key] || "blue"}
        >
          <div className="executive-v2__kpi-head">
            <div className="executive-v2__kpi-icon" data-icon={card.icon} aria-hidden="true" />
            <div className="executive-v2__kpi-label">{card.label}</div>
          </div>
          <div className="executive-v2__kpi-value">{card.value}</div>
          {card.comparison ? (
            <div
              className={`executive-v2__kpi-delta executive-v2__kpi-delta--${card.comparison.direction}`}
            >
              {card.comparison.direction === "flat"
                ? "—"
                : `${card.comparison.direction === "up" ? "+" : "-"}${card.comparison.value}`}
            </div>
          ) : (
            <div className="executive-v2__kpi-delta executive-v2__kpi-delta--flat">—</div>
          )}
          {card.periodLabel ? (
            <div className="executive-v2__kpi-period">{card.periodLabel}</div>
          ) : null}
        </article>
      ))}
    </div>
  );
}

export { Skeleton };
