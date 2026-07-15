export default function ConversationCard({ prospect }) {
    return (
      <div
        style={{
          background: "white",
          borderRadius: 14,
          padding: 24,
          boxShadow: "0 4px 12px rgba(0,0,0,.08)"
        }}
      >
        <h2 style={{ marginTop: 0 }}>
          💬 Conversation
        </h2>
  
        <div
          style={{
            background: "#F8FAFC",
            padding: 15,
            borderRadius: 10
          }}
        >
          <strong>Last Message</strong>
  
          <p style={{ marginTop: 10 }}>
            {prospect.last_message || "No messages yet."}
          </p>
        </div>
      </div>
    );
  }