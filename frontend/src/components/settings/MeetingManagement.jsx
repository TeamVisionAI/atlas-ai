import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import ConfigurationSection from "../../components/settings/ConfigurationSection";
import ConfigurationLoading from "../../components/settings/ConfigurationLoading";
import AtlasButton from "../../components/ui/AtlasButton";
import {
  fetchMeetingManagement,
  updateMeetingManagement
} from "../../services/configurationService";

const MEETING_PREFERENCE_OPTIONS = Object.freeze({
  INCLUDE_LINK_IN_WHATSAPP: "include_link_in_whatsapp",
  INCLUDE_LINK_IN_CALENDAR: "include_link_in_calendar",
  INCLUDE_OFFICE_IN_CALENDAR: "include_office_in_calendar"
});

export default function MeetingManagement() {
  const { translate } = useLanguage();
  const [meetingManagement, setMeetingManagement] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await fetchMeetingManagement();
    setMeetingManagement(result.meetingManagement);
  }, []);

  useEffect(() => {
    load().catch((loadError) => setError(loadError.message));
  }, [load]);

  function updateField(field, value) {
    setMeetingManagement((current) => ({ ...current, [field]: value }));
  }

  function togglePreference(preference) {
    setMeetingManagement((current) => {
      const preferences = new Set(current?.meetingPreferences || []);
      if (preferences.has(preference)) {
        preferences.delete(preference);
      } else {
        preferences.add(preference);
      }

      return {
        ...current,
        meetingPreferences: Array.from(preferences)
      };
    });
  }

  async function saveMeetingManagement(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);

    try {
      const result = await updateMeetingManagement({
        personalMeetingUrl: meetingManagement.personalMeetingUrl,
        officeAddress: meetingManagement.officeAddress,
        meetingPreferences: meetingManagement.meetingPreferences
      });
      setMeetingManagement(result.meetingManagement);
      setMessage(translate("configurationSaved"));
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  }

  if (!meetingManagement) {
    return error ? (
      <p className="configuration-message configuration-message--error" role="alert">
        {error}
      </p>
    ) : (
      <ConfigurationLoading />
    );
  }

  const preferences = new Set(meetingManagement.meetingPreferences || []);

  return (
    <ConfigurationSection title={translate("configurationMeetingManagement")}>
      <form className="configuration-form" onSubmit={saveMeetingManagement}>
        <p className="configuration-help">{translate("configurationMeetingManagementDescription")}</p>

        <label>
          {translate("configurationPersonalMeetingUrl")}
          <input
            type="url"
            value={meetingManagement.personalMeetingUrl || ""}
            onChange={(event) => updateField("personalMeetingUrl", event.target.value)}
            placeholder="https://zoom.us/j/..."
          />
        </label>

        <label>
          {translate("configurationOfficeAddress")}
          <textarea
            rows={3}
            value={meetingManagement.officeAddress || ""}
            onChange={(event) => updateField("officeAddress", event.target.value)}
            placeholder={meetingManagement.effectiveOfficeAddress || ""}
          />
        </label>

        <fieldset className="configuration-fieldset">
          <legend>{translate("configurationMeetingPreferences")}</legend>

          <label className="configuration-checkbox">
            <input
              type="checkbox"
              checked={preferences.has(MEETING_PREFERENCE_OPTIONS.INCLUDE_LINK_IN_CALENDAR)}
              onChange={() => togglePreference(MEETING_PREFERENCE_OPTIONS.INCLUDE_LINK_IN_CALENDAR)}
            />
            {translate("configurationMeetingPreferenceIncludeLinkInCalendar")}
          </label>

          <label className="configuration-checkbox">
            <input
              type="checkbox"
              checked={preferences.has(MEETING_PREFERENCE_OPTIONS.INCLUDE_LINK_IN_WHATSAPP)}
              onChange={() => togglePreference(MEETING_PREFERENCE_OPTIONS.INCLUDE_LINK_IN_WHATSAPP)}
            />
            {translate("configurationMeetingPreferenceIncludeLinkInWhatsApp")}
          </label>

          <label className="configuration-checkbox">
            <input
              type="checkbox"
              checked={preferences.has(MEETING_PREFERENCE_OPTIONS.INCLUDE_OFFICE_IN_CALENDAR)}
              onChange={() => togglePreference(MEETING_PREFERENCE_OPTIONS.INCLUDE_OFFICE_IN_CALENDAR)}
            />
            {translate("configurationMeetingPreferenceIncludeOfficeInCalendar")}
          </label>
        </fieldset>

        <div className="configuration-actions">
          <AtlasButton type="submit" variant="primary" busy={busy}>
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
