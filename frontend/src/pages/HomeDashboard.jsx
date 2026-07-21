import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { fetchHomeSummary } from "../services/onboardingService";
import "./HomeDashboard.css";

function formatMeetingTime(isoString) {
  if (!isoString) {
    return "";
  }

  return new Date(isoString).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function DashboardCard({ title, children, empty = "Nothing here yet." }) {
  const isEmpty = !children || (Array.isArray(children) && children.length === 0);

  return (
    <section className="home-dashboard-card">
      <h2>{title}</h2>
      {isEmpty ? <p className="home-dashboard-empty">{empty}</p> : children}
    </section>
  );
}

function MeetingBadge({ meeting }) {
  if (meeting.isVirtual) {
    return <span className="home-dashboard-badge is-virtual">Virtual</span>;
  }

  return <span className="home-dashboard-badge is-in-person">In person</span>;
}

function MeetingItem({ meeting, highlight = false, showAttention = false }) {
  return (
    <article className={`home-dashboard-meeting${highlight ? " is-highlight" : ""}`}>
      <div className="home-dashboard-meeting__header">
        <strong>{meeting.prospectName}</strong>
        <MeetingBadge meeting={meeting} />
      </div>
      <span>{formatMeetingTime(meeting.startTime)}</span>
      <span>{meeting.locationLabel || meeting.meetingType || "Meeting"}</span>
      {meeting.joinUrl ? (
        <span className="home-dashboard-meeting__link">Zoom link ready</span>
      ) : null}
      {showAttention && meeting.attentionItems?.length ? (
        <ul className="home-dashboard-attention-list">
          {meeting.attentionItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

export default function HomeDashboard() {
  const { user, organization } = useAuth();
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchHomeSummary()
      .then(setSummary)
      .catch((loadError) => setError(loadError.message));
  }, []);

  return (
    <div className="home-dashboard">
      <header className="home-dashboard__hero">
        <p className="home-dashboard__eyebrow">{organization?.name || "Atlas"}</p>
        <h1>Good morning{user?.displayName ? `, ${user.displayName}` : ""}</h1>
        <p className="home-dashboard__subtitle">Your Atlas command center.</p>
      </header>

      {error ? <p className="home-dashboard-error">{error}</p> : null}

      <div className="home-dashboard__grid">
        <DashboardCard
          title="Today's Meetings"
          empty="You have no meetings scheduled today."
        >
          {summary?.todaysMeetings?.length ? (
            <div className="home-dashboard-list">
              {summary.todaysMeetings.map((meeting) => (
                <MeetingItem key={meeting.id} meeting={meeting} />
              ))}
            </div>
          ) : null}
        </DashboardCard>

        <DashboardCard title="Next Meeting" empty="Your next meeting will appear here.">
          {summary?.nextMeeting ? (
            <MeetingItem meeting={summary.nextMeeting} highlight />
          ) : null}
        </DashboardCard>

        <DashboardCard title="Needs Attention" empty="Everything looks ready.">
          {summary?.needsAttention?.length ? (
            <div className="home-dashboard-list">
              {summary.needsAttention.map((meeting) => (
                <MeetingItem key={meeting.id} meeting={meeting} showAttention />
              ))}
            </div>
          ) : null}
        </DashboardCard>

        <DashboardCard title="Upcoming Meetings" empty="No upcoming meetings scheduled.">
          {summary?.upcomingMeetings?.length ? (
            <div className="home-dashboard-list">
              {summary.upcomingMeetings.map((meeting) => (
                <MeetingItem key={meeting.id} meeting={meeting} />
              ))}
            </div>
          ) : null}
        </DashboardCard>

        <DashboardCard title="Atlas Activity" empty="Atlas activity will appear here.">
          {summary?.atlasActivity?.length ? (
            <ul className="home-dashboard-activity">
              {summary.atlasActivity.map((entry) => (
                <li key={entry.id}>{entry.message}</li>
              ))}
            </ul>
          ) : null}
        </DashboardCard>
      </div>
    </div>
  );
}
