/**
 * Lightweight SVG chart — plots existing annual-values series only (no new calculations).
 */

function buildPath(points, width, height, padding) {
  if (!points.length) {
    return "";
  }

  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;

  return points
    .map((point, index) => {
      const x = padding + (points.length === 1 ? innerW / 2 : (index / (points.length - 1)) * innerW);
      const y = padding + innerH - ((point.value - min) / range) * innerH;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function buildArea(points, width, height, padding) {
  const line = buildPath(points, width, height, padding);
  if (!line) {
    return "";
  }
  const lastX = width - padding;
  const firstX = padding;
  const baseY = height - padding;
  return `${line} L${lastX},${baseY} L${firstX},${baseY} Z`;
}

export default function PolicyReviewChart({
  title,
  series = [],
  valueKey,
  color = "#111827",
  height = 180
}) {
  const width = 560;
  const padding = 18;
  const points = (series || [])
    .map((row) => ({
      label: row.policyYear,
      value: Number(row[valueKey])
    }))
    .filter((point) => Number.isFinite(point.value));

  const path = buildPath(points, width, height, padding);
  const area = buildArea(points, width, height, padding);
  const last = points[points.length - 1];
  const first = points[0];

  return (
    <div className="epr-chart">
      <div className="epr-chart__head">
        <h4>{title}</h4>
        {last ? (
          <span className="epr-chart__meta">
            Yr {first?.label}–{last.label}
          </span>
        ) : null}
      </div>
      {points.length < 2 ? (
        <p className="epr-chart__empty">Insufficient series data</p>
      ) : (
        <svg
          className="epr-chart__svg"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={title}
        >
          <path d={area} fill={color} opacity="0.08" />
          <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      )}
    </div>
  );
}
