import { useLanguage } from "../../i18n/LanguageContext";

export default function AgencyHealth({ agencyPulse }) {
  const { translate } = useLanguage();

  if (!agencyPulse) {
    return null;
  }

  return (
    <section>
      <h2 className="executive-section-label">{translate("executiveAgencyHealth")}</h2>
      <div className="executive-card executive-health">
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>
            {agencyPulse.label || translate("executiveAgencyHealth")}
          </div>
          <div className="executive-health__meta" style={{ marginTop: 6 }}>
            {translate("executiveAgencyHealthFormula", {
              version: agencyPulse.formulaVersion || "9.0-mvp"
            })}
          </div>
        </div>
        <div className="executive-health__score">
          {agencyPulse.score}
          <span style={{ fontSize: 16, fontWeight: 500, color: "#94A3B8" }}> / 100</span>
        </div>
      </div>
    </section>
  );
}
