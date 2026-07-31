import { useLanguage } from "../../i18n/LanguageContext";

function AlphaStatList({ title, items }) {
  return (
    <div className="executive-brief__section">
      <h3 className="executive-brief__section-title">{title}</h3>
      <ul className="executive-brief__list">
        {items.map((item) => (
          <li key={item.label}>
            <strong>{item.value}</strong> {item.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function MorningBrief({ brief, onReview }) {
  const { translate } = useLanguage();

  if (!brief) {
    return null;
  }

  const isAlphaBrief = Boolean(brief.yesterday || brief.todaysPriorities);

  if (isAlphaBrief) {
    const yesterday = brief.yesterday || {};
    const priorities = brief.todaysPriorities || {};
    const recommendation = brief.aiRecommendation || brief.recommendedAction;

    return (
      <section className="executive-card executive-brief">
        <h2 className="executive-section-label">{translate("executiveMorningBrief")}</h2>
        <p className="executive-brief__greeting">{brief.greeting || brief.lines?.[0]}</p>

        <AlphaStatList
          title={translate("executiveBriefYesterday")}
          items={[
            { value: yesterday.newProspects ?? 0, label: translate("executiveBriefNewProspects") },
            { value: yesterday.qualified ?? 0, label: translate("executiveBriefQualified") },
            { value: yesterday.appointments ?? 0, label: translate("executiveBriefAppointments") },
            { value: yesterday.confirmed ?? 0, label: translate("executiveBriefConfirmed") },
            { value: yesterday.completed ?? 0, label: translate("executiveBriefCompleted") },
            { value: yesterday.recruited ?? 0, label: translate("executiveBriefRecruited") }
          ]}
        />

        <AlphaStatList
          title={translate("executiveBriefTodaysPriorities")}
          items={[
            {
              value: priorities.followUpsOverdue ?? 0,
              label: translate("executiveBriefFollowUpsOverdue")
            },
            {
              value: priorities.interviewsToday ?? 0,
              label: translate("executiveBriefInterviewsToday")
            },
            {
              value: priorities.hotProspects ?? 0,
              label: translate("executiveBriefHotProspects")
            }
          ]}
        />

        <div className="executive-brief__action">
          <strong>{translate("executiveBriefAiRecommendation")}</strong>{" "}
          {recommendation?.phone && onReview ? (
            <button
              type="button"
              onClick={() =>
                onReview(recommendation.phone, recommendation.filter, recommendation.to)
              }
              style={{
                appearance: "none",
                border: "none",
                background: "none",
                padding: 0,
                color: "#111827",
                fontWeight: 600,
                cursor: "pointer",
                textDecoration: "underline"
              }}
            >
              {recommendation.label}
            </button>
          ) : recommendation?.label && onReview ? (
            <button
              type="button"
              onClick={() => onReview(null, null, recommendation.to)}
              style={{
                appearance: "none",
                border: "none",
                background: "none",
                padding: 0,
                color: "#111827",
                fontWeight: 600,
                cursor: "pointer",
                textDecoration: "underline"
              }}
            >
              {recommendation.label}
            </button>
          ) : (
            <span>{recommendation?.label}</span>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="executive-card executive-brief">
      <h2 className="executive-section-label">{translate("executiveMorningBrief")}</h2>
      {(brief.lines || []).map((line) => (
        <p key={line}>{line}</p>
      ))}

      {brief.recommendedAction ? (
        <div className="executive-brief__action">
          <strong>{translate("executiveRecommendedFirstAction")}</strong>{" "}
          <button
            type="button"
            onClick={() =>
              onReview(
                brief.recommendedAction.phone,
                brief.recommendedAction.filter,
                brief.recommendedAction.to
              )
            }
            style={{
              appearance: "none",
              border: "none",
              background: "none",
              padding: 0,
              color: "#111827",
              fontWeight: 600,
              cursor: "pointer",
              textDecoration: "underline"
            }}
          >
            {brief.recommendedAction.label}
          </button>
        </div>
      ) : null}

      {brief.coachingLeader ? (
        <div className="executive-brief__action" style={{ borderTop: "none", paddingTop: 8 }}>
          <strong>{translate("executiveCoachingFocus")}</strong> {brief.coachingLeader.label}
        </div>
      ) : null}
    </section>
  );
}
