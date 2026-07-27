import { useEffect, useState } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import { SETTINGS_SECTIONS } from "../../config/settingsProductNames";
import ConfigurationSection from "../../components/settings/ConfigurationSection";
import ConfigurationLoading from "../../components/settings/ConfigurationLoading";
import AtlasButton from "../../components/ui/AtlasButton";
import {
  fetchOrganizationConfiguration,
  fetchOrganizationLevels,
  updateOrganizationConfiguration
} from "../../services/configurationService";
import OrganizationIntegrations from "../../components/settings/OrganizationIntegrations";
import MeetingManagement from "../../components/settings/MeetingManagement";

export default function OrganizationConfiguration() {
  const { translate } = useLanguage();
  const [organization, setOrganization] = useState(null);
  const [levels, setLevels] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([fetchOrganizationConfiguration(), fetchOrganizationLevels()])
      .then(([orgResult, levelsResult]) => {
        setOrganization(orgResult.organization);
        setLevels(levelsResult.levels || []);
      })
      .catch((loadError) => setError(loadError.message));
  }, []);

  function updateField(field, value) {
    setOrganization((current) => ({ ...current, [field]: value }));
  }

  async function saveOrganization(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSaving(true);

    try {
      const result = await updateOrganizationConfiguration({
        name: organization.name,
        organizationLevel: organization.organizationLevel,
        officeName: organization.officeName,
        brandName: organization.brandName,
        logoUrl: organization.logoUrl,
        primaryColor: organization.primaryColor,
        secondaryColor: organization.secondaryColor,
        timezone: organization.timezone
      });
      setOrganization(result.organization);
      setMessage(translate("configurationSaved"));
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  if (!organization) {
    return error ? (
      <p className="configuration-message configuration-message--error" role="alert">
        {error}
      </p>
    ) : (
      <ConfigurationLoading />
    );
  }

  return (
    <>
      <ConfigurationSection title={SETTINGS_SECTIONS.organization}>
        <form className="configuration-form" onSubmit={saveOrganization}>
        <label>
          {translate("configurationOrganizationName")}
          <input
            value={organization.name || ""}
            onChange={(event) => updateField("name", event.target.value)}
          />
        </label>

        <label>
          {translate("configurationOrganizationOwner")}
          <input
            value={
              organization.owner?.name ||
              organization.owner?.email ||
              translate("configurationNotSet")
            }
            disabled
          />
        </label>

        <label>
          {translate("configurationOrganizationLevel")}
          <select
            value={organization.organizationLevel || ""}
            onChange={(event) => updateField("organizationLevel", event.target.value || null)}
          >
            <option value="">{translate("configurationNotSet")}</option>
            {levels.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </label>

        <label>
          {translate("configurationOfficeName")}
          <input
            value={organization.officeName || ""}
            onChange={(event) => updateField("officeName", event.target.value)}
          />
        </label>

        <label>
          {translate("configurationBrandName")}
          <input
            value={organization.brandName || ""}
            onChange={(event) => updateField("brandName", event.target.value)}
          />
        </label>

        <label>
          {translate("configurationLogoUrl")}
          <input
            value={organization.logoUrl || ""}
            onChange={(event) => updateField("logoUrl", event.target.value)}
          />
        </label>

        <div className="configuration-grid-2">
          <label>
            {translate("configurationPrimaryColor")}
            <input
              type="color"
              value={organization.primaryColor || "#1a365d"}
              onChange={(event) => updateField("primaryColor", event.target.value)}
            />
          </label>
          <label>
            {translate("configurationSecondaryColor")}
            <input
              type="color"
              value={organization.secondaryColor || "#2b6cb0"}
              onChange={(event) => updateField("secondaryColor", event.target.value)}
            />
          </label>
        </div>

        <div className="configuration-actions">
          <AtlasButton type="submit" variant="primary" busy={saving}>
            {translate("configurationSave")}
          </AtlasButton>
        </div>
      </form>

      {message ? (
        <p className="configuration-message configuration-message--success" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="configuration-message configuration-message--error" role="alert">
          {error}
        </p>
        ) : null}
      </ConfigurationSection>

      <MeetingManagement />
      <OrganizationIntegrations />
    </>
  );
}
