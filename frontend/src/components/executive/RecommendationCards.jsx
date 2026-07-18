import { useLanguage } from "../../i18n/LanguageContext";

export default function RecommendationCards({ items, onOpen }) {
  const { translate } = useLanguage();

  return (
    <section>
      <h2 className="executive-section-label">{translate("executiveRecommendations")}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {items.length ? (
          items.map((item) => (
            <button
              key={`${item.phone}-${item.rank}`}
              type="button"
              className="executive-card executive-recommendation"
              onClick={() => onOpen(item.phone, item.filter)}
            >
              <div className="executive-recommendation__name">{item.name}</div>
              <div className="executive-recommendation__reason">{item.reason}</div>
              <div className="executive-recommendation__meta">
                {translate("executiveRecommendationLabel")} {item.recommendedAction}
              </div>
              <div className="executive-recommendation__priority">
                {translate("executiveRecommendationPriority", { level: item.priorityLabel })}
              </div>
            </button>
          ))
        ) : (
          <div className="executive-card" style={{ padding: 20, color: "#64748B" }}>
            {translate("executiveRecommendationsEmpty")}
          </div>
        )}
      </div>
    </section>
  );
}
