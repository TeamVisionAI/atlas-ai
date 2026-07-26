import { useLanguage } from "../../i18n/LanguageContext";
import { SOURCE_LABEL_KEYS } from "./fieldInputConfig";

export default function KnownInformationSection({ items = [] }) {
  const { translate } = useLanguage();

  if (!items.length) {
    return null;
  }

  return (
    <div className="conversation-outcome__known">
      <h4>{translate("conversationOutcomeKnownInformation")}</h4>
      <ul>
        {items.map((item) => (
          <li key={item.key}>
            <strong>{item.label}:</strong> {item.value}
            {item.source ? (
              <span className="conversation-outcome__source">
                {" "}
                ({translate(SOURCE_LABEL_KEYS[item.source] || "conversationOutcomeSourceStored")})
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
