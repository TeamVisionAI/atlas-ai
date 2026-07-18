import { useLanguage } from "../../i18n/LanguageContext";

export default function FocusCards({ cards, onNavigate }) {
  const { translate } = useLanguage();

  return (
    <section>
      <h2 className="executive-section-label">{translate("executiveTodaysFocus")}</h2>
      <div className="executive-focus-grid">
        {cards.map((card) => (
          <button
            key={card.key}
            type="button"
            className="executive-card executive-focus-card"
            onClick={() => onNavigate(card.filter)}
          >
            <div className="executive-focus-card__title">{card.title}</div>
            <div className="executive-focus-card__count">{card.count}</div>
            <div className="executive-focus-card__status">
              {card.count === 0 ? card.emptyMessage : translate("executiveFocusOpenQueue")}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
