import { lazy, Suspense } from "react";
import { useLanguage } from "../../../i18n/LanguageContext";
import ConversationPanel from "../../../components/ConversationPanel";
import ActivityFeed from "../../../components/prospect-workspace/ActivityFeed";
import { WorkspaceSkeleton } from "../../../components/ui/Skeleton";
import "./CommunicationHistorySection.css";

const ProspectTimelinePanel = lazy(() => import("./ProspectTimelinePanel"));

export default function CommunicationHistorySection({
  phone,
  conversation,
  activityPreview = [],
  prospectCoreId,
  timelineRef,
  onNoteAdded
}) {
  const { translate } = useLanguage();
  const messageCount = conversation?.messages?.length || 0;

  return (
    <section
      className="communication-history"
      aria-labelledby="communication-history-heading"
    >
      <header className="communication-history__header">
        <h2 id="communication-history-heading" className="communication-history__title">
          {translate("workspaceSectionCommunicationHistory")}
        </h2>
        <p className="communication-history__subtitle">
          {translate("workspaceSectionCommunicationHistorySubtitle")}
        </p>
      </header>

      {messageCount ? (
        <div className="communication-history__thread">
          <h3 className="communication-history__thread-title">
            {translate("workspaceSectionWhatsAppThread")}
          </h3>
          <ConversationPanel
            messages={conversation.messages}
            lastMessage={conversation.lastMessage}
            direction={conversation.direction}
            timestamp={conversation.timestamp}
            prospectAvatar={{
              photoUrl: null,
              name: translate("missionControlConversationProspect")
            }}
          />
        </div>
      ) : null}

      <ActivityFeed phone={phone} previewItems={activityPreview} onNoteAdded={onNoteAdded} />

      <Suspense fallback={<WorkspaceSkeleton />}>
        <ProspectTimelinePanel ref={timelineRef} prospectCoreId={prospectCoreId} />
      </Suspense>
    </section>
  );
}
