export default function Header() {
    return (
      <header
        style={{
          background: "white",
          padding: "20px 30px",
          borderBottom: "1px solid #E5E7EB",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}
      >
        <div>
          <div
            style={{
              color: "#64748B",
              fontSize: 13
            }}
          >
            ATLAS AI
          </div>
  
          <h1
            style={{
              margin: 0
            }}
          >
            Today's Game Plan
          </h1>
        </div>
  
        <div>
          🟢 Atlas Active
        </div>
      </header>
    );
  }