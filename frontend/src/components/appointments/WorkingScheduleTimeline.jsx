import { useMemo, useState } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import DayAvailabilityTimeline from "./DayAvailabilityTimeline";
import {
  DEFAULT_VIEW_END,
  DEFAULT_VIEW_START,
  FULL_DAY_END,
  FULL_DAY_START,
  buildHourTicks,
  formatTimeLabel
} from "./workingScheduleTimeUtils";
import "./WorkingScheduleTimeline.css";

export default function WorkingScheduleTimeline({
  workingSchedule,
  dayLabels,
  onDayChange,
  onBlockChange,
  onAddBlock,
  onRemoveBlock
}) {
  const { translate, locale } = useLanguage();
  const [fullDayView, setFullDayView] = useState(false);

  const viewStart = fullDayView ? FULL_DAY_START : DEFAULT_VIEW_START;
  const viewEnd = fullDayView ? FULL_DAY_END : DEFAULT_VIEW_END;

  const hourTicks = useMemo(
    () => buildHourTicks(viewStart, viewEnd, fullDayView),
    [fullDayView, viewEnd, viewStart]
  );

  return (
    <div className="wst">
      <div className="wst__controls">
        <label className="wst__toggle-24h">
          <input
            type="checkbox"
            checked={fullDayView}
            onChange={(event) => setFullDayView(event.target.checked)}
          />
          <span className="wst__toggle-24h-track" aria-hidden="true">
            <span className="wst__toggle-24h-thumb" />
          </span>
          <span>{translate("appointmentsSchedule24HourView")}</span>
        </label>
      </div>

      <div className="wst__grid">
        <div className="wst__ruler-row">
          <div className="wst__day-spacer" aria-hidden="true" />
          <div className="wst__ruler">
            {hourTicks.map((minutes) => (
              <span
                key={minutes}
                className="wst__ruler-tick"
                style={{ left: `${((minutes - viewStart) / (viewEnd - viewStart)) * 100}%` }}
              >
                {formatTimeLabel(minutes, locale)}
              </span>
            ))}
          </div>
          <div className="wst__ruler-spacer" aria-hidden="true" />
        </div>

        {workingSchedule.map((day) => {
          const label = dayLabels[day.dayOfWeek] ?? day.dayOfWeek;

          return (
            <div
              key={day.dayOfWeek}
              className={`wst__day ${day.enabled ? "wst__day--enabled" : "wst__day--disabled"}`}
            >
              <label className="wst__day-label">
                <input
                  type="checkbox"
                  checked={day.enabled}
                  onChange={(event) =>
                    onDayChange(day.dayOfWeek, { enabled: event.target.checked })
                  }
                />
                <span className="wst__day-name">{label}</span>
              </label>

              <div className="wst__day-content">
                {day.enabled ? (
                  <DayAvailabilityTimeline
                    dayOfWeek={day.dayOfWeek}
                    blocks={day.blocks}
                    viewStart={viewStart}
                    viewEnd={viewEnd}
                    locale={locale}
                    onBlockChange={onBlockChange}
                    onAddBlock={onAddBlock}
                    onRemoveBlock={onRemoveBlock}
                  />
                ) : (
                  <p className="wst__unavailable">{translate("appointmentsUnavailable")}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
