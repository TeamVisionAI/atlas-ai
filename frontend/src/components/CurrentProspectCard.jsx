const cardStyle = {
  background: "#111827",
  border: "1px solid #374151",
  borderRadius: 12,
  padding: "12px 20px",
  color: "#fff"
};

function Row({ icon, label, value }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "10px 0",
        borderBottom: "1px solid #1F2937"
      }}
    >
      <span style={{ fontSize: 18, width: 28, textAlign: "center", flexShrink: 0 }}>
        {icon}
      </span>
      <span style={{ fontSize: 15, lineHeight: 1.5 }}>
        <span style={{ color: "#94A3B8" }}>{label}: </span>
        {value}
      </span>
    </div>
  );
}

export default function CurrentProspectCard({ prospect }) {
  return (
    <div style={cardStyle}>
      <Row icon="👤" label="Name" value={prospect.name} />
      <Row icon="📞" label="Phone" value={prospect.phone} />
      <Row icon="📍" label="City / State" value={prospect.location} />
      <Row icon="🌐" label="Language" value={prospect.language} />
      <Row icon="🎯" label="Current Milestone" value={prospect.milestone} />
      {prospect.workflowOwnership ? (
        <Row icon="🧭" label="Workflow Owner" value={prospect.workflowOwnership} />
      ) : null}
      {prospect.interviewType ? (
        <Row icon="🎥" label="Interview Type" value={prospect.interviewType} />
      ) : null}
    </div>
  );
}
