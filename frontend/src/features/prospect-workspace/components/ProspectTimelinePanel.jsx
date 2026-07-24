import { forwardRef, memo, useEffect, useId, useImperativeHandle, useState } from "react";
import { useLanguage } from "../../../i18n/LanguageContext";
import { useProspectTimeline } from "../hooks/useProspectTimeline";
import AtlasButton from "../../../components/ui/AtlasButton";
import EmptyState from "../../../components/ui/EmptyState";
import ErrorState from "../../../components/ui/ErrorState";
import Skeleton from "../../../components/ui/Skeleton";

const ProspectTimelinePanel = forwardRef(function ProspectTimelinePanel(
  { prospectCoreId },
  ref
) {
  const { translate } = useLanguage();
  const panelId = useId();
  const [expanded, setExpanded] = useState(false);
  const { timeline, loading, error } = useProspectTimeline(prospectCoreId, {
    enabled: expanded && Boolean(prospectCoreId),
    limit: 25
  });

  useImperativeHandle(ref, () => ({
    toggle: () => setExpanded((current) => !current),
    expand: () => setExpanded(true),
    collapse: () => setExpanded(false)
  }));

  useEffect(() => {
    if (!prospectCoreId) {
      setExpanded(false);
    }
  }, [prospectCoreId]);

  return (
    <section
      className="prospect-workspace-panel prospect-workspace-panel--timeline"
      aria-label={translate("workspaceSectionTimeline")}
    >
      <div className="prospect-workspace-panel__header">
        <div>
          <h2 className="workspace-eyebrow">{translate("workspaceSectionTimeline")}</h2>
          <p className="prospect-workspace-panel__intro">{translate("workspaceTimelineHint")}</p>
        </div>
        <AtlasButton
          type="button"
          variant="secondary"
          className="prospect-workspace-panel__toggle"
          aria-expanded={expanded}
          aria-controls={panelId}
          disabled={!prospectCoreId}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? translate("workspaceTimelineHide") : translate("workspaceTimelineShow")}
        </AtlasButton>
      </div>

      {!prospectCoreId ? (
        <EmptyState
          title={translate("workspaceTimelineRequiresCoreProspect")}
          body={translate("workspacePanelEmptyHint")}
        />
      ) : null}

      {expanded && prospectCoreId ? (
        <div id={panelId} className="prospect-workspace-timeline">
          {loading ? (
            <div aria-busy="true">
              <Skeleton variant="text" />
              <Skeleton variant="text" />
              <Skeleton variant="text" />
            </div>
          ) : null}
          {error ? (
            <ErrorState
              title={translate("workspaceTimelineLoadError")}
              body={translate("workspacePanelErrorHint")}
            />
          ) : null}
          {!loading && !error && timeline?.items?.length ? (
            <ol className="prospect-workspace-timeline__list">
              {timeline.items.map((entry) => (
                <li key={entry.entryId || entry.id} className="prospect-workspace-timeline__item">
                  <span className="prospect-workspace-timeline__type">{entry.eventType}</span>
                  <span className="prospect-workspace-timeline__summary">
                    {entry.summary || entry.entryType}
                  </span>
                  <time className="prospect-workspace-timeline__time" dateTime={entry.timestamp}>
                    {entry.timestamp}
                  </time>
                </li>
              ))}
            </ol>
          ) : null}
          {!loading && !error && !timeline?.items?.length ? (
            <EmptyState
              title={translate("workspaceTimelineEmpty")}
              body={translate("workspaceTimelineEmptyHint")}
            />
          ) : null}
        </div>
      ) : null}
    </section>
  );
});

export default memo(ProspectTimelinePanel);
