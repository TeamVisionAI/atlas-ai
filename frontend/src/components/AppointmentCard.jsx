import { formatProspectInterviewTime } from "../utils/dateFormatter";

export default function AppointmentCard({ prospect }) {

    if (!prospect) {
      return null;
    }

    const interviewDisplay = formatProspectInterviewTime(prospect) || "Not Scheduled";
  
    return (
      <div
        style={{
          background: "white",
          padding: 28,
          borderRadius: 18,
          flex: 1,
          boxShadow: "0 10px 25px rgba(0,0,0,.08)"
        }}
      >
        <div
          style={{
            color: "#64748B"
          }}
        >
          Next Appointment
        </div>
  
        <h2
          style={{
            marginBottom: 5
          }}
        >
          {interviewDisplay}
        </h2>
  
        <h3>{prospect.name}</h3>
  
        <p>
          {prospect.interview_type}
        </p>
  
        <div
          style={{
            display: "flex",
            gap: 10,
            marginTop: 20
          }}
        >
          <button>WhatsApp</button>
  
          <button>Calendar</button>
        </div>
      </div>
    );
  }
