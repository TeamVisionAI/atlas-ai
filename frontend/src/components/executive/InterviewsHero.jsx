import { useLanguage } from "../../i18n/LanguageContext";

export default function InterviewsHero({ hero, onOpenMissionControl }) {
  const { translate } = useLanguage();

  return (
    <section className="executive-card executive-hero">
      <h1 className="executive-hero__title">{translate("executiveTodaysInterviews")}</h1>
      <div className="executive-hero__kpi">{hero.total}</div>

      <div className="executive-hero__stats">
        <div className="executive-hero__stat">
          👤 {translate("executiveHeroMine")} <strong>{hero.mine}</strong>
        </div>
        <div className="executive-hero__stat">
          👥 {translate("executiveHeroTeam")} <strong>{hero.team}</strong>
        </div>
        <div className="executive-hero__stat">
          ✅ {translate("executiveHeroConfirmed")} <strong>{hero.confirmed}</strong>
        </div>
        <div className="executive-hero__stat">
          🟡 {translate("executiveHeroWaitingConfirmation")}{" "}
          <strong>{hero.waitingConfirmation}</strong>
        </div>
        <div className="executive-hero__stat">
          🔴 {translate("executiveHeroOutcomePending")} <strong>{hero.outcomePending}</strong>
        </div>
        <div className="executive-hero__stat">
          🔵 {translate("executiveHeroRescheduled")} <strong>{hero.rescheduled}</strong>
        </div>
      </div>

      <button type="button" className="executive-primary-button" onClick={onOpenMissionControl}>
        {translate("executiveOpenMissionControl")}
      </button>
    </section>
  );
}
