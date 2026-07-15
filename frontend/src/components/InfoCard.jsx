export default function InfoCard({ prospect }) {
    return (
      <div
        style={{
          background: "white",
          borderRadius: 14,
          padding: 24,
          boxShadow: "0 4px 12px rgba(0,0,0,.08)"
        }}
      >
        <h2 style={{ marginTop: 0 }}>👤 Prospect Information</h2>
  
        <table style={{ width: "100%", lineHeight: "2" }}>
          <tbody>
            <tr>
              <td><strong>Name</strong></td>
              <td>{prospect.name}</td>
            </tr>
  
            <tr>
              <td><strong>Phone</strong></td>
              <td>{prospect.phone}</td>
            </tr>
  
            <tr>
              <td><strong>Language</strong></td>
              <td>{prospect.language}</td>
            </tr>
  
            <tr>
              <td><strong>City</strong></td>
              <td>{prospect.city}</td>
            </tr>
  
            <tr>
              <td><strong>Occupation</strong></td>
              <td>{prospect.occupation}</td>
            </tr>
  
            <tr>
              <td><strong>Status</strong></td>
              <td>{prospect.current_step}</td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }