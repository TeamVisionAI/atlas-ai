export default function AgentQueueNavigator({
  currentIndex,
  totalProspects,
  previousProspect,
  nextProspect,
  onPrevious,
  onNext
}) {
  const position = totalProspects ? currentIndex + 1 : 0;

  return (
    <div
      style={{
        background: "white",
        borderBottom: "1px solid #E5E7EB",
        padding: "14px 30px 18px"
      }}
    >
      <div
        style={{
          color: "#64748B",
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          marginBottom: 12
        }}
      >
        Today&apos;s Queue
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12
        }}
      >
        <button
          type="button"
          onClick={onPrevious}
          disabled={!previousProspect}
          style={{
            justifySelf: "start",
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid #E5E7EB",
            background: previousProspect ? "white" : "#F8FAFC",
            color: previousProspect ? "#64748B" : "#CBD5E1",
            cursor: previousProspect ? "pointer" : "not-allowed",
            fontSize: 14,
            fontWeight: 500,
            textAlign: "left"
          }}
        >
          ← Previous
          {previousProspect ? (
            <span
              style={{
                display: "block",
                fontSize: 12,
                color: "#94A3B8",
                marginTop: 2
              }}
            >
              {previousProspect.name}
            </span>
          ) : null}
        </button>

        <div
          style={{
            textAlign: "center",
            color: "#374151",
            fontSize: 15,
            fontWeight: 600,
            whiteSpace: "nowrap"
          }}
        >
          Prospect {position} of {totalProspects}
        </div>

        <button
          type="button"
          onClick={onNext}
          disabled={!nextProspect}
          style={{
            justifySelf: "end",
            padding: "12px 18px",
            borderRadius: 8,
            border: "none",
            background: nextProspect ? "#1E3A8A" : "#CBD5E1",
            color: "white",
            cursor: nextProspect ? "pointer" : "not-allowed",
            fontSize: 14,
            fontWeight: 700,
            textAlign: "right",
            boxShadow: nextProspect ? "0 8px 20px rgba(30, 58, 138, 0.24)" : "none"
          }}
        >
          ▶ Next Priority
          {nextProspect ? (
            <span
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 500,
                opacity: 0.9,
                marginTop: 2
              }}
            >
              {nextProspect.name}
            </span>
          ) : null}
        </button>
      </div>
    </div>
  );
}
