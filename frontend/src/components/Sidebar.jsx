export default function Sidebar() {
    return (
      <aside
        style={{
          width: 250,
          background: "#172554",
          color: "white",
          padding: 25
        }}
      >
        <h2>🚀 Atlas AI</h2>
  
        <p
          style={{
            color: "#94A3B8",
            marginBottom: 40
          }}
        >
          Recruiting Command Center
        </p>
  
        <MenuItem active>Dashboard</MenuItem>
        <MenuItem>Pipeline</MenuItem>
        <MenuItem>Conversations</MenuItem>
        <MenuItem>Appointments</MenuItem>
        <MenuItem>Follow-ups</MenuItem>
        <MenuItem>Analytics</MenuItem>
        <MenuItem>Settings</MenuItem>
  
        <div
          style={{
            marginTop: 60,
            color: "#94A3B8",
            fontSize: 14
          }}
        >
          Niovel Perez
  
          <br />
  
          Team Vision
        </div>
      </aside>
    );
  }
  
  function MenuItem({ children, active }) {
    return (
      <div
        style={{
          padding: "12px 14px",
          marginBottom: 8,
          borderRadius: 8,
          background: active ? "#1E3A8A" : "transparent",
          cursor: "pointer"
        }}
      >
        {children}
      </div>
    );
  }