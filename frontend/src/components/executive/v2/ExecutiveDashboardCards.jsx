function Skeleton({ className = "", style }) {
  return <div className={`executive-v2__skeleton ${className}`.trim()} style={style} aria-hidden="true" />;
}

export function ExecutiveCard({
  title,
  action,
  children,
  className = "",
  loading = false,
  footer = null
}) {
  return (
    <section className={`executive-v2__card ${className}`.trim()}>
      <header className="executive-v2__card-header">
        <h2 className="executive-v2__card-title">{title}</h2>
        {action || null}
      </header>
      <div className="executive-v2__card-body">
        {loading ? <Skeleton className="executive-v2__skeleton--block" /> : children}
      </div>
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

export function KpiRow({ cards = [] }) {
  if (!cards.length) {
    return <KpiSkeletonRow />;
  }

  return (
    <div className="executive-v2__kpi-row">
      {cards.map((card) => (
        <article
          key={card.key}
          className="executive-v2__kpi"
          data-accent={KPI_ACCENTS[card.key] || "blue"}
        >
          <div className="executive-v2__kpi-icon" data-icon={card.icon} aria-hidden="true" />
          <div className="executive-v2__kpi-label">{card.label}</div>
          <div className="executive-v2__kpi-value">{card.value}</div>
          {card.comparison ? (
            <div
              className={`executive-v2__kpi-delta executive-v2__kpi-delta--${card.comparison.direction}`}
            >
              {card.comparison.direction === "flat"
                ? "—"
                : `${card.comparison.direction === "up" ? "▲" : "▼"} ${card.comparison.value}`}
            </div>
          ) : (
            <div className="executive-v2__kpi-delta executive-v2__kpi-delta--flat">—</div>
          )}
        </article>
      ))}
    </div>
  );
}

export { Skeleton };
