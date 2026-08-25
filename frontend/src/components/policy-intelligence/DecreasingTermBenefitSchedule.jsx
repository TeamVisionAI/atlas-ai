import { formatUsd, TABLE_UNAVAILABLE } from "./classifiedValueDisplay";
import "./DecreasingTermBenefitSchedule.css";

function money(value) {
  return formatUsd(value) || TABLE_UNAVAILABLE;
}

/**
 * Lightweight decreasing-term death-benefit schedule table + sparkline.
 * Exact schedule rows only — never interpolates.
 */
export default function DecreasingTermBenefitSchedule({
  schedule = [],
  initialDeathBenefit = null,
  expirationDate = null,
  productType = null
}) {
  const rows = Array.isArray(schedule)
    ? schedule.filter((row) => row && row.year != null && row.deathBenefit != null)
    : [];

  if (!rows.length) {
    return null;
  }

  const maxBenefit = Math.max(...rows.map((row) => Number(row.deathBenefit) || 0), 1);
  const highlightYears = new Set([0, 10, 20, 30, 40, 44, 45]);
  const chartPoints = rows
    .map((row, index) => {
      const x = rows.length === 1 ? 0 : (index / (rows.length - 1)) * 100;
      const y = 100 - ((Number(row.deathBenefit) || 0) / maxBenefit) * 100;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <section
      className="pi-decreasing-term"
      data-testid="pi-decreasing-term-schedule"
      data-product-type={productType || ""}
    >
      <header className="pi-decreasing-term__header">
        <h4>Decreasing Term — Death Benefit Schedule</h4>
        <p>
          Benefit declines by policy year. This is not a level face amount guaranteed for the full
          term.
        </p>
      </header>

      <dl className="pi-decreasing-term__summary">
        <div>
          <dt>Initial Death Benefit</dt>
          <dd data-testid="pi-decreasing-initial-db">
            {money(initialDeathBenefit ?? rows[0]?.deathBenefit)}
          </dd>
        </div>
        <div>
          <dt>Policy type</dt>
          <dd data-testid="pi-decreasing-type-label">Decreasing Term</dd>
        </div>
        {expirationDate ? (
          <div>
            <dt>Expiration</dt>
            <dd data-testid="pi-decreasing-expiration">{expirationDate}</dd>
          </div>
        ) : null}
      </dl>

      <div className="pi-decreasing-term__chart" aria-hidden="true">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img">
          <polyline
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
            points={chartPoints}
          />
        </svg>
        <div className="pi-decreasing-term__chart-label">Death benefit by policy year</div>
      </div>

      <div className="pi-decreasing-term__table-wrap">
        <table className="pi-decreasing-term__table">
          <thead>
            <tr>
              <th scope="col">Policy year</th>
              <th scope="col">Death benefit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const highlight = highlightYears.has(Number(row.year));
              const expired = Number(row.deathBenefit) === 0;
              return (
                <tr
                  key={row.year}
                  className={highlight ? "pi-decreasing-term__row--highlight" : undefined}
                  data-year={row.year}
                  data-testid={highlight ? `pi-db-year-${row.year}` : undefined}
                >
                  <td>{row.year}</td>
                  <td>{expired ? "Expired ($0)" : money(row.deathBenefit)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
