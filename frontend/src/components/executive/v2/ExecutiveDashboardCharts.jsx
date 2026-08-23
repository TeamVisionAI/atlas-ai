export function ConversationDonut({ segments = [], total = 0 }) {
  const safeTotal = Math.max(
    total,
    segments.reduce((sum, segment) => sum + segment.value, 0)
  );

  if (!safeTotal) {
    return (
      <div className="executive-v2__donut executive-v2__donut--empty" aria-hidden="true">
        <span>—</span>
      </div>
    );
  }

  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="executive-v2__donut-wrap">
      <svg viewBox="0 0 120 120" className="executive-v2__donut" role="img" aria-label="Conversation ownership">
        <circle cx="60" cy="60" r={radius} className="executive-v2__donut-track" />
        {segments.map((segment) => {
          if (!segment.value) {
            return null;
          }

          const length = (segment.value / safeTotal) * circumference;
          const circle = (
            <circle
              key={segment.key}
              cx="60"
              cy="60"
              r={radius}
              className="executive-v2__donut-segment"
              stroke={segment.color}
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={-offset}
            />
          );
          offset += length;
          return circle;
        })}
        <text x="60" y="58" textAnchor="middle" className="executive-v2__donut-total">
          {safeTotal}
        </text>
      </svg>
      <ul className="executive-v2__donut-legend">
        {segments.map((segment) => (
          <li key={segment.key}>
            <span className="executive-v2__legend-swatch" style={{ background: segment.color }} />
            <span>{segment.label}</span>
            <strong>{segment.value}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AppointmentTrendChart({ series = [] }) {
  if (!series.length) {
    return <div className="executive-v2__chart-empty">—</div>;
  }

  const width = 560;
  const height = 180;
  const padding = { top: 16, right: 12, bottom: 28, left: 12 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(
    1,
    ...series.flatMap((day) => [day.scheduled, day.confirmed, day.completed])
  );

  function y(value) {
    return padding.top + innerHeight - (value / maxValue) * innerHeight;
  }

  function x(index) {
    if (series.length === 1) {
      return padding.left + innerWidth / 2;
    }
    return padding.left + (index / (series.length - 1)) * innerWidth;
  }

  function lineFor(key) {
    return series
      .map((day, index) => `${index === 0 ? "M" : "L"}${x(index)},${y(day[key] || 0)}`)
      .join(" ");
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="executive-v2__line-chart" role="img">
      {[0, 0.5, 1].map((ratio) => {
        const yPos = padding.top + innerHeight * (1 - ratio);
        return (
          <line
            key={ratio}
            x1={padding.left}
            x2={width - padding.right}
            y1={yPos}
            y2={yPos}
            className="executive-v2__chart-grid"
          />
        );
      })}
      <path d={lineFor("scheduled")} className="executive-v2__chart-line executive-v2__chart-line--scheduled" />
      <path d={lineFor("confirmed")} className="executive-v2__chart-line executive-v2__chart-line--confirmed" />
      <path d={lineFor("completed")} className="executive-v2__chart-line executive-v2__chart-line--completed" />
      {series.map((day, index) => (
        <text
          key={day.date || index}
          x={x(index)}
          y={height - 8}
          textAnchor="middle"
          className="executive-v2__chart-label"
        >
          {formatShortDay(day.label || day.date)}
        </text>
      ))}
    </svg>
  );
}

function formatShortDay(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value).slice(5, 10);
  }

  return date.toLocaleDateString(undefined, { weekday: "short" });
}
