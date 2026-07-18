import { useLanguage } from "../../i18n/LanguageContext";

export default function ProspectIdentityStrip({ identity }) {
  const { translate } = useLanguage();

  return (
    <section className="prospect-identity" aria-label={translate("workspaceSectionIdentity")}>
      <div className="prospect-identity__primary">
        <h1 className="prospect-identity__name">{identity.name}</h1>
        {identity.prospectNumber ? (
          <span className="prospect-identity__number">{identity.prospectNumber}</span>
        ) : null}
      </div>
      <div className="prospect-identity__meta">
        <span className="prospect-identity__phone">{identity.phone}</span>
        {identity.communicationLanguage ? (
          <span className="prospect-identity__chip">{identity.communicationLanguage}</span>
        ) : null}
        {identity.location && identity.location !== "—" ? (
          <span className="prospect-identity__location">{identity.location}</span>
        ) : null}
      </div>
    </section>
  );
}
