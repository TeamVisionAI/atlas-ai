export default function ConversationPanel({ lastMessage, direction, timestamp }) {
  const directionLabel =
    direction === "outgoing"
      ? "Atlas"
      : direction === "incoming"
        ? "Prospect"
        : "Message";

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
          minHeight: 0,
          overflowY: "auto"
        }}
      >
        <div
          style={{
            alignSelf: direction === "outgoing" ? "flex-end" : "flex-start",
            maxWidth: "85%",
            background: direction === "outgoing" ? "#172554" : "#1F2937",
            padding: "16px 18px",
            borderRadius:
              direction === "outgoing" ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
            border: "1px solid #374151"
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
            <span>{directionLabel}</span>
            {timestamp ? <span>{timestamp}</span> : null}
          </div>
          <p style={{ margin: 0, lineHeight: 1.7, fontSize: 16, whiteSpace: "pre-wrap" }}>
            {lastMessage || "No messages yet."}
          </p>
        </div>

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
          Continue in WhatsApp or use Next Actions above.
        </div>
      </div>
    </div>
  );
}
