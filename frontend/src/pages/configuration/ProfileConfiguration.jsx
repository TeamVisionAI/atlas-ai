import { useEffect, useState } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import { SETTINGS_SECTIONS } from "../../config/settingsProductNames";
import ConfigurationSection from "../../components/settings/ConfigurationSection";
import ConfigurationLoading from "../../components/settings/ConfigurationLoading";
import AtlasButton from "../../components/ui/AtlasButton";
import {
  fetchConfigurationProfile,
  updateConfigurationProfile
} from "../../services/configurationService";

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Puerto_Rico"
];

const LANGUAGES = [
  { value: "en", labelKey: "configurationLanguageEnglish" },
  { value: "es", labelKey: "configurationLanguageSpanish" }
];

const WEEKDAYS = [
  { value: 1, labelKey: "configurationWeekdayMon" },
  { value: 2, labelKey: "configurationWeekdayTue" },
  { value: 3, labelKey: "configurationWeekdayWed" },
  { value: 4, labelKey: "configurationWeekdayThu" },
  { value: 5, labelKey: "configurationWeekdayFri" },
  { value: 6, labelKey: "configurationWeekdaySat" },
  { value: 0, labelKey: "configurationWeekdaySun" }
];

export default function ProfileConfiguration() {
  const { translate } = useLanguage();
  const [profile, setProfile] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchConfigurationProfile()
      .then((result) => setProfile(result.profile))
      .catch((loadError) => setError(loadError.message));
  }, []);

  function updateField(field, value) {
    setProfile((current) => ({ ...current, [field]: value }));
  }

  function updateBusinessHours(field, value) {
    setProfile((current) => ({
      ...current,
      businessHours: {
        ...current.businessHours,
        [field]: value
      }
    }));
  }

  function toggleBusinessDay(day) {
    setProfile((current) => {
      const days = new Set(current.businessHours?.days || []);
      if (days.has(day)) {
        days.delete(day);
      } else {
        days.add(day);
      }

      return {
        ...current,
        businessHours: {
          ...current.businessHours,
          days: [...days].sort((a, b) => a - b)
        }
      };
    });
  }

  async function saveProfile(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSaving(true);

    try {
      const result = await updateConfigurationProfile({
        firstName: profile.firstName,
        lastName: profile.lastName,
        phone: profile.phone,
        timezone: profile.timezone,
        language: profile.language,
        businessHours: profile.businessHours,
        defaultOffice: profile.defaultOffice
      });
      setProfile(result.profile);
      setMessage(translate("configurationSaved"));
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  if (!profile) {
    return error ? (
      <p className="configuration-message configuration-message--error" role="alert">
        {error}
      </p>
    ) : (
      <ConfigurationLoading />
    );
  }

  return (
    <ConfigurationSection title={SETTINGS_SECTIONS.profile}>
      <form className="configuration-form" onSubmit={saveProfile}>
        <div className="configuration-grid-2">
          <label>
            {translate("configurationFirstName")}
            <input
              value={profile.firstName || ""}
              onChange={(event) => updateField("firstName", event.target.value)}
              autoComplete="given-name"
            />
          </label>
          <label>
            {translate("configurationLastName")}
            <input
              value={profile.lastName || ""}
              onChange={(event) => updateField("lastName", event.target.value)}
              autoComplete="family-name"
            />
          </label>
        </div>

        <label>
          {translate("configurationEmail")}
          <input value={profile.email || ""} disabled autoComplete="email" />
        </label>

        <label>
          {translate("configurationPhone")}
          <input
            value={profile.phone || ""}
            onChange={(event) => updateField("phone", event.target.value)}
            autoComplete="tel"
          />
        </label>

        <label>
          {translate("configurationTimezone")}
          <select
            value={profile.timezone || "America/New_York"}
            onChange={(event) => updateField("timezone", event.target.value)}
          >
            {TIMEZONES.map((timezone) => (
              <option key={timezone} value={timezone}>
                {timezone}
              </option>
            ))}
          </select>
        </label>

        <label>
          {translate("configurationLanguage")}
          <select
            value={profile.language || "en"}
            onChange={(event) => updateField("language", event.target.value)}
          >
            {LANGUAGES.map((language) => (
              <option key={language.value} value={language.value}>
                {translate(language.labelKey)}
              </option>
            ))}
          </select>
        </label>

        <fieldset>
          <legend>{translate("configurationBusinessHours")}</legend>
          <div className="configuration-grid-2">
            <label>
              {translate("configurationHoursStart")}
              <input
                type="time"
                value={profile.businessHours?.start || "09:00"}
                onChange={(event) => updateBusinessHours("start", event.target.value)}
              />
            </label>
            <label>
              {translate("configurationHoursEnd")}
              <input
                type="time"
                value={profile.businessHours?.end || "17:00"}
                onChange={(event) => updateBusinessHours("end", event.target.value)}
              />
            </label>
          </div>
          <div className="configuration-actions">
            {WEEKDAYS.map((day) => (
              <label key={day.value} className="configuration-checkbox">
                <input
                  type="checkbox"
                  checked={(profile.businessHours?.days || []).includes(day.value)}
                  onChange={() => toggleBusinessDay(day.value)}
                />
                {translate(day.labelKey)}
              </label>
            ))}
          </div>
        </fieldset>

        <label>
          {translate("configurationDefaultOffice")}
          <input
            value={profile.defaultOffice || ""}
            onChange={(event) => updateField("defaultOffice", event.target.value)}
          />
        </label>

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
  );
}
