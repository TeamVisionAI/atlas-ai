import { useRef } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import AtlasButton from "../ui/AtlasButton";
import AvailabilityTimelineBlock from "./AvailabilityTimelineBlock";

export default function DayAvailabilityTimeline({
  dayOfWeek,
  blocks,
  viewStart,
  viewEnd,
  locale,
  onBlockChange,
  onAddBlock,
  onRemoveBlock
}) {
  const { translate } = useLanguage();
  const trackRef = useRef(null);

  return (
    <div className="wst-day-track">
      <div
        ref={trackRef}
        className="wst-day-track__surface"
        role="group"
        aria-label={translate("appointmentsSettingsWorkingSchedule")}
      >
        {blocks.map((block, index) => (
          <AvailabilityTimelineBlock
            key={`${dayOfWeek}-${index}`}
            block={block}
            trackRef={trackRef}
            viewStart={viewStart}
            viewEnd={viewEnd}
            locale={locale}
            canRemove={blocks.length > 1}
            removeLabel={translate("appointmentsRemoveBlock")}
            onChange={(patch) => onBlockChange(dayOfWeek, index, patch)}
            onRemove={() => onRemoveBlock(dayOfWeek, index)}
          />
        ))}
      </div>
      <AtlasButton
        type="button"
        variant="secondary"
        size="sm"
        className="wst__add-btn"
        onClick={() => onAddBlock(dayOfWeek)}
      >
        {translate("appointmentsAddBlock")}
      </AtlasButton>
    </div>
  );
}
