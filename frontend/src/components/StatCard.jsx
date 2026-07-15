export default function StatCard({ title, value, subtitle }) {
    return (
      <div
        style={{
          background: "#1E3A8A",
          color: "white",
          padding: 28,
          borderRadius: 18,
          minWidth: 300,
          flex: 1,
          boxShadow: "0 10px 25px rgba(0,0,0,.12)"
        }}
      >
        <div
          style={{
            fontSize: 18,
            opacity: .9
          }}
        >
          {title}
        </div>
  
        <div
          style={{
            fontSize: 64,
            fontWeight: 700,
            marginTop: 15
          }}
        >
          {value}
        </div>
  
        {subtitle && (
          <div
            style={{
              marginTop: 10,
              opacity: .8
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
    );
  }