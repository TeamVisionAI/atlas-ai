import { useCallback, useRef, useState } from "react";
import {
  MIN_BLOCK_MINUTES,
  clampMinutes,
  formatTimeLabel,
  minutesToTime,
  parseTimeToMinutes,
  snapMinutes
} from "./workingScheduleTimeUtils";

export default function AvailabilityTimelineBlock({
  block,
  trackRef,
  viewStart,
  viewEnd,
  locale,
  onChange,
  onRemove,
  canRemove,
  disabled,
  removeLabel
}) {
  const dragRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const startMinutes = parseTimeToMinutes(block.start);
  const endMinutes = parseTimeToMinutes(block.end);
  const range = viewEnd - viewStart;

  const leftPct = ((clampMinutes(startMinutes, viewStart, viewEnd) - viewStart) / range) * 100;
  const widthPct =
    ((clampMinutes(endMinutes, viewStart, viewEnd) -
      clampMinutes(startMinutes, viewStart, viewEnd)) /
      range) *
    100;

  const clientXToMinutes = useCallback(
    (clientX) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) {
        return viewStart;
      }

      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return snapMinutes(viewStart + ratio * range);
    },
    [range, trackRef, viewStart]
  );

  const commitBlock = useCallback(
    (nextStart, nextEnd) => {
      const snappedStart = snapMinutes(nextStart);
      const snappedEnd = snapMinutes(nextEnd);

      if (snappedEnd - snappedStart < MIN_BLOCK_MINUTES) {
        return;
      }

      onChange({
        start: minutesToTime(snappedStart),
        end: minutesToTime(snappedEnd)
      });
    },
    [onChange]
  );

  const handlePointerDown = useCallback(
    (event, mode) => {
      if (disabled) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const captureTarget = event.currentTarget;
      captureTarget.setPointerCapture(event.pointerId);

      const originStart = startMinutes;
      const originEnd = endMinutes;
      const originX = event.clientX;

      dragRef.current = { mode, originStart, originEnd, originX };
      setDragging(true);

      const handleMove = (moveEvent) => {
        const drag = dragRef.current;
        if (!drag) {
          return;
        }

        const deltaMinutes = clientXToMinutes(moveEvent.clientX) - clientXToMinutes(drag.originX);

        if (drag.mode === "start") {
          const nextStart = clampMinutes(
            drag.originStart + deltaMinutes,
            viewStart,
            drag.originEnd - MIN_BLOCK_MINUTES
          );
          commitBlock(nextStart, drag.originEnd);
        } else if (drag.mode === "end") {
          const nextEnd = clampMinutes(
            drag.originEnd + deltaMinutes,
            drag.originStart + MIN_BLOCK_MINUTES,
            viewEnd
          );
          commitBlock(drag.originStart, nextEnd);
        } else if (drag.mode === "move") {
          const duration = drag.originEnd - drag.originStart;
          let nextStart = drag.originStart + deltaMinutes;
          nextStart = clampMinutes(nextStart, viewStart, viewEnd - duration);
          commitBlock(nextStart, nextStart + duration);
        }
      };

      const handleUp = (upEvent) => {
        try {
          captureTarget.releasePointerCapture(upEvent.pointerId);
        } catch {
          // pointer already released
        }
        dragRef.current = null;
        setDragging(false);
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    },
    [clientXToMinutes, commitBlock, disabled, endMinutes, startMinutes, viewEnd, viewStart]
  );

  return (
    <div
      className={`wst-block__range ${dragging ? "wst-block__range--dragging" : ""}`}
      style={{
        left: `${leftPct}%`,
        width: `${Math.max(widthPct, 1.5)}%`,
        zIndex: dragging ? 3 : 1
      }}
      role="group"
      aria-label={`${formatTimeLabel(startMinutes, locale)} – ${formatTimeLabel(endMinutes, locale)}`}
    >
      <button
        type="button"
        className="wst-block__handle wst-block__handle--start"
        aria-label={`Start ${formatTimeLabel(startMinutes, locale)}`}
        disabled={disabled}
        onPointerDown={(event) => handlePointerDown(event, "start")}
      />
      <div
        className="wst-block__body"
        onPointerDown={(event) => handlePointerDown(event, "move")}
        role="presentation"
      >
        <span className="wst-block__label">
          {formatTimeLabel(startMinutes, locale)} – {formatTimeLabel(endMinutes, locale)}
        </span>
      </div>
      <button
        type="button"
        className="wst-block__handle wst-block__handle--end"
        aria-label={`End ${formatTimeLabel(endMinutes, locale)}`}
        disabled={disabled}
        onPointerDown={(event) => handlePointerDown(event, "end")}
      />
      {canRemove ? (
        <button
          type="button"
          className="wst-block__remove"
          aria-label={removeLabel}
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}
