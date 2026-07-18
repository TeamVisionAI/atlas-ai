export default function InterviewsHero({ hero, onOpenMissionControl }) {
  return (
    <section className="executive-card executive-hero">
      <h1 className="executive-hero__title">Today&apos;s Interviews</h1>
      <div className="executive-hero__kpi">{hero.total}</div>

      <div className="executive-hero__stats">
        <div className="executive-hero__stat">
          👤 Mine <strong>{hero.mine}</strong>
        </div>
        <div className="executive-hero__stat">
          👥 Team <strong>{hero.team}</strong>
        </div>
        <div className="executive-hero__stat">
          ✅ Confirmed <strong>{hero.confirmed}</strong>
        </div>
        <div className="executive-hero__stat">
          🟡 Waiting Confirmation <strong>{hero.waitingConfirmation}</strong>
        </div>
        <div className="executive-hero__stat">
          🔴 Outcome Pending <strong>{hero.outcomePending}</strong>
        </div>
        <div className="executive-hero__stat">
          🔵 Rescheduled <strong>{hero.rescheduled}</strong>
        </div>
      </div>

      <button type="button" className="executive-primary-button" onClick={onOpenMissionControl}>
        Open Mission Control
      </button>
    </section>
  );
}
