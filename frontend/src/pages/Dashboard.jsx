import { useEffect, useState } from "react";
import { getDashboard } from "../services/api";
import StatCard from "../components/StatCard";
import AppointmentCard from "../components/AppointmentCard";

export default function Dashboard() {
  const [dashboard, setDashboard] = useState(null);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const data = await getDashboard();
        setDashboard(data);
      } catch (err) {
        console.error("Failed to load dashboard:", err);
      }
    }

    loadDashboard();
  }, []);

  if (!dashboard) {
    return <h2>🚀 Loading Atlas...</h2>;
  }

  return (
    <div>
      <h2
        style={{
          marginBottom: 30
        }}
      >
        Today's Game Plan
      </h2>

      <div
        style={{
          display: "flex",
          gap: 25,
          alignItems: "stretch",
          flexWrap: "wrap"
        }}
      >
        <StatCard
          title="Confirmed Appointments Today"
          value={dashboard.confirmed}
          subtitle={`${dashboard.totalProspects} Total Prospects`}
        />

        <AppointmentCard
          prospect={dashboard.prospects[0]}
        />
      </div>
    </div>
  );
}