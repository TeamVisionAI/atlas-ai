import { useLanguage } from "../../i18n/LanguageContext";

export default function WorkflowRequirementsSection({ requirements = [] }) {
  const { translate } = useLanguage();

  if (!requirements.length) {
    return null;
  }

  return (
    <div className="conversation-outcome__requirements">
      <h4>{translate("conversationOutcomeWorkflowRequirements")}</h4>
      <ul className="conversation-outcome__requirement-list">
        {requirements.map((item) => (
          <li key={item.key}>{item.label}</li>
        ))}
      </ul>
    </div>
  );
}
