import { formatUsd } from "./classifiedValueDisplay";
import { VALUE_CLASSIFICATIONS } from "./classifiedValueDisplay";

export const POLICY_VALUE_SERIES = [
  { key: "accountValue", label: "Accumulated Value", color: "#0b1f3a", dash: null },
  { key: "cashSurrenderValue", label: "Cash Surrender Value", color: "#c9a227", dash: "7 5" },
  { key: "deathBenefit", label: "Death Benefit", color: "#2f6b8f", dash: null }
];

export const PREMIUM_COST_SERIES = [
  { key: "premium", label: "Annual Premium", color: "#0b1f3a", dash: null },
  { key: "totalKnownPolicyCosts", label: "Known policy costs", color: "#b8860b", dash: "6 4" }
];

function knownValue(classified) {
  if (!classified || typeof classified !== "object") {
    return null;
  }
  if (
    classified.classification === VALUE_CLASSIFICATIONS.NOT_AVAILABLE ||
    classified.classification === VALUE_CLASSIFICATIONS.CARRIER_CALCULATION_REQUIRED
  ) {
    return null;
  }
  if (classified.value == null || classified.value === "") {
    return null;
  }
  const number = Number(classified.value);
  return Number.isFinite(number) ? number : null;
}

function compactMoney(value) {
  const abs = Math.abs(value);
  if (abs >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  }
  if (abs >= 10000) {
    return `$${Math.round(value / 1000)}k`;
  }
  if (value === 0) {
    return "$0";
  }
  return formatUsd(value);
}

function endpointRows(plotted) {
  if (!plotted.length) {
    return [];
  }
  if (plotted.length === 1) {
    return [plotted[0]];
  }
  return [plotted[0], plotted[plotted.length - 1]];
}

export default function PolicyValuesCheckpointChart({
  checkpoints = [],
  sourceLine = null,
  series = POLICY_VALUE_SERIES,
  title = "Policy values over time",
  requireAllSeries = false,
  testId = "pi-values-chart"
}) {
  const rows = (checkpoints || []).filter((row) => row.usedYear != null);
  const plotted = rows.map((row) => {
    const point = {
      year: Number(row.usedYear),
      age: row.attainedAge
    };
    for (const item of series) {
      point[item.key] = knownValue(row[item.key]);
    }
    return point;
  });

  const years = plotted.map((row) => row.year);
  const knownCounts = series.map(
    (item) => plotted.filter((row) => row[item.key] != null).length
  );
  const hasEnough = requireAllSeries
    ? knownCounts.every((count) => count >= 2)
    : knownCounts.some((count) => count >= 2);

  if (!hasEnough) {
    return null;
  }

  const width = 760;
  const height = 318;
  const padding = { top: 28, right: 28, bottom: 44, left: 68 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);
  const yearSpan = maxYear - minYear || 1;
  const values = plotted.flatMap((row) =>
    series.map((item) => row[item.key]).filter((value) => value != null)
  );
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;

  const xFor = (year) => padding.left + ((year - minYear) / yearSpan) * innerW;
  const yFor = (value) => padding.top + innerH - ((value - minVal) / range) * innerH;

  function seriesPath(key) {
    const points = plotted
      .filter((row) => row[key] != null)
      .map((row) => `${xFor(row.year).toFixed(1)},${yFor(row[key]).toFixed(1)}`);
    if (points.length < 2) {
      return "";
    }
    return `M${points.join(" L")}`;
  }

  const yTicks = [minVal, minVal + range / 3, minVal + (2 * range) / 3, maxVal];
  const summaries = endpointRows(plotted);

  return (
    <figure className="pi-values-chart" data-testid={testId}>
      {title ? <h4 className="pi-values-chart__title">{title}</h4> : null}
      <div className="pi-values-summary" data-testid={`${testId}-summary`}>
        {summaries.map((row) => (
          <div
            key={`summary-${row.year}`}
            className="pi-values-summary__card"
            data-testid={`${testId}-summary-${row.year}`}
          >
            <p className="pi-values-summary__year">
              {`Year ${row.year}${row.age != null ? ` · Age ${row.age}` : ""}`}
            </p>
            {series.map((item) =>
              row[item.key] != null ? (
                <p key={item.key} className="pi-values-summary__metric">
                  <span className="pi-values-summary__swatch" style={{ background: item.color }} />
                  <span>{item.label}</span>
                  <strong data-testid={`${testId}-summary-${row.year}-${item.key}`}>
                    {formatUsd(row[item.key])}
                  </strong>
                </p>
              ) : null
            )}
          </div>
        ))}
      </div>
      <svg
        className="pi-values-chart__svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={title}
      >
        {yTicks.map((tick) => (
          <g key={`y-${tick}`}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={yFor(tick)}
              y2={yFor(tick)}
              stroke="#d7dee8"
              strokeWidth="1"
            />
            <text
              x={padding.left - 8}
              y={yFor(tick) + 4}
              textAnchor="end"
              className="pi-values-chart__tick"
            >
              {compactMoney(tick)}
            </text>
          </g>
        ))}
        {plotted.map((row) => (
          <text
            key={`x-${row.year}`}
            x={xFor(row.year)}
            y={height - 16}
            textAnchor="middle"
            className="pi-values-chart__tick"
          >
            {row.year === minYear || row.year === maxYear
              ? `Yr ${row.year}${row.age != null ? ` · ${row.age}` : ""}`
              : `${row.year}`}
          </text>
        ))}
        <text
          x={(padding.left + width - padding.right) / 2}
          y={height - 2}
          textAnchor="middle"
          className="pi-values-chart__axis-label"
        >
          Policy year
        </text>
        {series.map((item) => {
          const d = seriesPath(item.key);
          return d ? (
            <path
              key={item.key}
              d={d}
              fill="none"
              stroke={item.color}
              strokeWidth="3.2"
              strokeDasharray={item.dash || undefined}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null;
        })}
        {series.flatMap((item) =>
          plotted
            .filter((row) => row[item.key] != null)
            .map((row) => (
              <circle
                key={`${item.key}-${row.year}`}
                cx={xFor(row.year)}
                cy={yFor(row[item.key])}
                r="4.4"
                fill="#ffffff"
                stroke={item.color}
                strokeWidth="2.4"
                data-series={item.key}
                data-year={row.year}
                data-value={row[item.key]}
              >
                <title>
                  {`${item.label} · Year ${row.year}${row.age != null ? ` · Age ${row.age}` : ""} · ${formatUsd(row[item.key])}`}
                </title>
              </circle>
            ))
        )}
        {series.flatMap((item, seriesIndex) => {
          const points = plotted.filter((row) => row[item.key] != null);
          const anchors = endpointRows(points);
          return anchors.map((row, index) => {
            const isLast = index === anchors.length - 1 && anchors.length > 1;
            const x = xFor(row.year);
            const y = yFor(row[item.key]);
            const dy = seriesIndex === 1 ? 16 : seriesIndex === 2 ? -18 : -8;
            return (
              <text
                key={`callout-${item.key}-${row.year}`}
                x={x + (isLast ? -8 : 8)}
                y={y + dy}
                textAnchor={isLast ? "end" : "start"}
                className="pi-values-chart__callout"
                fill={item.color}
              >
                {compactMoney(row[item.key])}
              </text>
            );
          });
        })}
      </svg>
      <ul className="pi-values-chart__legend" data-testid={`${testId}-legend`}>
        {series.map((item) => (
          <li key={item.key}>
            <span
              className={`pi-values-chart__swatch${item.dash ? " pi-values-chart__swatch--dashed" : ""}`}
              style={{ background: item.dash ? "transparent" : item.color, borderColor: item.color }}
            />
            {item.label}
          </li>
        ))}
      </ul>
      {sourceLine ? (
        <figcaption className="pi-source-line" data-testid={`${testId}-source`}>
          {sourceLine}
        </figcaption>
      ) : null}
    </figure>
  );
}

export { knownValue as knownCheckpointValue };
