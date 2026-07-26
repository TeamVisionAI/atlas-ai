import { useLanguage } from "../../i18n/LanguageContext";
import ExecutivePanel from "./ExecutivePanel";
import "./ExecutiveInformationPanel.css";

function InfoRow({ icon, label, value }) {
  if (!value || value === "—") {
    return null;
  }

  return (
    <div className="executive-info-row">
      <span className="executive-info-row__icon" aria-hidden="true">
        {icon}
      </span>
      <div className="executive-info-row__content">
        <span className="executive-info-row__label">{label}</span>
        <span className="executive-info-row__value">{value}</span>
      </div>
    </div>
  );
}

export default function ExecutiveInformationPanel({ prospect }) {
  const { translate } = useLanguage();

  if (!prospect) {
    return null;
  }

  return (
    <ExecutivePanel>
      <div className="executive-info-grid">
        <InfoRow icon="👤" label={translate("missionControlRowName")} value={prospect.name} />
        <InfoRow icon="📞" label={translate("missionControlRowPhone")} value={prospect.phone} />
        <InfoRow icon="📍" label={translate("missionControlRowLocation")} value={prospect.location} />
        <InfoRow icon="🌐" label={translate("missionControlRowLanguage")} value={prospect.language} />
        <InfoRow icon="🎯" label={translate("missionControlRowMilestone")} value={prospect.milestone} />
        <InfoRow
          icon="🧭"
          label={translate("missionControlRowWorkflowOwner")}
          value={prospect.workflowOwnership}
        />
        <InfoRow
          icon="🎥"
          label={translate("missionControlRowInterviewType")}
          value={prospect.interviewType}
        />
      </div>
    </ExecutivePanel>
  );
}
