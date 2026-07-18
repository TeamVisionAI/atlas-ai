import { useLanguage } from "../../i18n/LanguageContext";

export default function MorningBrief({ brief, onReview }) {
  const { translate } = useLanguage();

  return (
    <section className="executive-card executive-brief">
      <h2 className="executive-section-label">{translate("executiveMorningBrief")}</h2>
      {brief.lines.map((line) => (
        <p key={line}>{line}</p>
      ))}

      {brief.recommendedAction ? (
        <div className="executive-brief__action">
          <strong>{translate("executiveRecommendedFirstAction")}</strong>{" "}
          <button
            type="button"
            onClick={() =>
              onReview(brief.recommendedAction.phone, brief.recommendedAction.filter)
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
