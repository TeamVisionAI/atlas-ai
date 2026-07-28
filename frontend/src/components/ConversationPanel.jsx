import { useLanguage } from "../i18n/LanguageContext";
import { formatTextWithDates } from "../utils/dateFormatter";
import UserAvatar from "./ui/UserAvatar";
import "./ui/ProfilePhotoEditor.css";

function formatMessageTime(timestamp, language) {
  if (!timestamp) {
    return "";
  }

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  const locale = language === "es" ? "es-PR" : "en-US";

  return date.toLocaleString(locale, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function resolveDirectionLabel(direction, translate) {
  if (direction === "outgoing") {
    return translate("missionControlConversationAtlas");
  }

  if (direction === "incoming") {
    return translate("missionControlConversationProspect");
  }

  return translate("missionControlConversationMessage");
}

export default function ConversationPanel({
  messages = [],
  lastMessage,
  direction,
  timestamp,
  atlasAvatar = null,
  prospectAvatar = null
}) {
  const { translate, language } = useLanguage();

  const thread =
    messages.length > 0
      ? messages
      : lastMessage
        ? [
            {
              id: "latest",
              text: lastMessage,
              direction: direction || "unknown",
              timestamp
            }
          ]
        : [];

  function resolveAvatar(messageDirection) {
    if (messageDirection === "outgoing") {
      return {
        photoUrl: atlasAvatar?.photoUrl || null,
        name: atlasAvatar?.name || translate("missionControlConversationAtlas")
      };
    }

    if (messageDirection === "incoming") {
      return {
        photoUrl: prospectAvatar?.photoUrl || null,
        name: prospectAvatar?.name || translate("missionControlConversationProspect")
      };
    }

    return {
      photoUrl: null,
      name: translate("missionControlConversationMessage")
    };
  }

  return (
    <div
      style={{
        background: "#111827",
        border: "1px solid #374151",
        borderRadius: 12,
        padding: 20,
        color: "#fff",
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column"
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 16,
          minHeight: 280,
          maxHeight: 420,
          overflowY: "auto"
        }}
      >
        {thread.length ? (
          thread.map((message) => {
            const outgoing = message.direction === "outgoing";
            const avatar = resolveAvatar(message.direction);

            return (
              <div
                key={message.id}
                className={`conversation-message-row ${outgoing ? "is-outgoing" : "is-incoming"}`}
              >
                <UserAvatar
                  photoUrl={avatar.photoUrl}
                  name={avatar.name}
                  size="sm"
                  className="user-avatar--on-dark"
                />
                <div
                  style={{
                    background: outgoing ? "#172554" : "#1F2937",
                    padding: "16px 18px",
                    borderRadius: outgoing ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
                    border: "1px solid #374151",
                    minWidth: 0
                  }}
                >
                  <div
                    style={{
                      color: "#94A3B8",
                      fontSize: 12,
                      marginBottom: 8,
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12
                    }}
                  >
                    <span>{resolveDirectionLabel(message.direction, translate)}</span>
                    {message.timestamp ? (
                      <span>{formatMessageTime(message.timestamp, language)}</span>
                    ) : null}
                  </div>
                  <p style={{ margin: 0, lineHeight: 1.7, fontSize: 16, whiteSpace: "pre-wrap" }}>
                    {formatTextWithDates(message.text)}
                  </p>
                </div>
              </div>
            );
          })
        ) : (
          <p style={{ margin: 0, color: "#94A3B8", fontSize: 14 }}>
            {translate("missionControlConversationNoMessages")}
          </p>
        )}

        <div
          style={{
            marginTop: "auto",
            padding: "12px 14px",
            borderRadius: 8,
            background: "#172554",
            border: "1px dashed #374151",
            color: "#94A3B8",
            fontSize: 14,
            textAlign: "center"
          }}
        >
          {translate("missionControlConversationFooter")}
        </div>
      </div>
    </div>
  );
}
