export default function InterviewCard({ prospect }) {
    return (
      <div
        style={{
          background: "white",
          borderRadius: 14,
          padding: 24,
          boxShadow: "0 4px 12px rgba(0,0,0,.08)"
        }}
      >
        <h2 style={{ marginTop: 0 }}>📅 Next Interview</h2>
  
        <table style={{ width: "100%", lineHeight: "2" }}>
          <tbody>
            <tr>
              <td><strong>Time</strong></td>
              <td>{prospect.interview_time || "Not Scheduled"}</td>
            </tr>
  
            <tr>
              <td><strong>Type</strong></td>
              <td>{prospect.interview_type || "-"}</td>
            </tr>
  
            <tr>
              <td><strong>Status</strong></td>
              <td>{prospect.current_step}</td>
            </tr>
          </tbody>
        </table>
  
        <div
          style={{
            display: "flex",
            gap: 10,
            marginTop: 20
          }}
        >
          <button>📅 Calendar</button>
  
          <button>💬 WhatsApp</button>
  
          <button>✏️ Reschedule</button>
        </div>
      </div>
    );
  }