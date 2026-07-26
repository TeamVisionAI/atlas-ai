import { useLanguage } from "../../i18n/LanguageContext";
import { SOURCE_LABEL_KEYS } from "./fieldInputConfig";
import ExecutivePanel from "../design-system/ExecutivePanel";
import "../design-system/ExecutiveInformationPanel.css";

export default function KnownInformationSection({ items = [], showHeading = true }) {
  const { translate } = useLanguage();

  if (!items.length) {
    return null;
  }

  return (
    <ExecutivePanel>
      {showHeading ? (
        <h4 className="executive-info-section__title">{translate("conversationOutcomeKnownInformation")}</h4>
      ) : null}
      <div className="executive-info-grid">
        {items.map((item) => (
          <div key={item.key} className="executive-info-row">
            <span className="executive-info-row__icon" aria-hidden="true">
              ✓
            </span>
            <div className="executive-info-row__content">
              <span className="executive-info-row__label">{item.label}</span>
              <span className="executive-info-row__value">
                {item.value}
                {item.source ? (
                  <span className="executive-info-row__source">
                    {" "}
                    ({translate(SOURCE_LABEL_KEYS[item.source] || "conversationOutcomeSourceStored")})
                  </span>
                ) : null}
              </span>
            </div>
          </div>
        ))}
      </div>
    </ExecutivePanel>
  );
}
