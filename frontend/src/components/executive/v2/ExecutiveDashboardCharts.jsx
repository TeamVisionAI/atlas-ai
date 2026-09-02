export function ConversationDonut({ segments = [], total = 0 }) {
  const safeTotal = Math.max(
    total,
    segments.reduce((sum, segment) => sum + segment.value, 0)
  );

  if (!safeTotal) {
    return (
      <div className="executive-v2__donut-empty" aria-hidden="true">
        <span>—</span>
      </div>
    );
  }

  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="executive-v2__donut-wrap">
      <div className="executive-v2__donut-chart">
        <svg viewBox="0 0 200 200" className="executive-v2__donut" role="img" aria-label="Conversation ownership">
          <circle cx="100" cy="100" r={radius} className="executive-v2__donut-track" />
          {segments.map((segment) => {
            if (!segment.value) {
              return null;
            }

            const length = (segment.value / safeTotal) * circumference;
            const circle = (
              <circle
                key={segment.key}
                cx="100"
                cy="100"
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
        </svg>
        <div className="executive-v2__donut-center">
          <strong>{safeTotal}</strong>
        </div>
      </div>
      <ul className="executive-v2__donut-legend">
        {segments.map((segment) => (
          <li key={segment.key}>
            <span className="executive-v2__legend-swatch" style={{ background: segment.color }} />
            <span className="executive-v2__donut-legend-label">{segment.label}</span>
            <strong className="executive-v2__donut-legend-count">{segment.value}</strong>
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

  const width = 640;
  const height = 260;
  const padding = { top: 20, right: 16, bottom: 36, left: 16 };
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

  const gridRatios = [0, 0.25, 0.5, 0.75, 1];
  const lineKeys = ["scheduled", "confirmed", "completed"];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="executive-v2__line-chart" role="img">
      {gridRatios.map((ratio) => {
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
      {lineKeys.map((key) => (
        <path
          key={key}
          d={lineFor(key)}
          className={`executive-v2__chart-line executive-v2__chart-line--${key}`}
        />
      ))}
      {lineKeys.map((key) =>
        series.map((day, index) => (
          <circle
            key={`${key}-${day.date || index}`}
            cx={x(index)}
            cy={y(day[key] || 0)}
            r="4"
            className={`executive-v2__chart-dot executive-v2__chart-dot--${key}`}
          />
        ))
      )}
      {series.map((day, index) => (
        <text
          key={day.date || index}
          x={x(index)}
          y={height - 10}
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
