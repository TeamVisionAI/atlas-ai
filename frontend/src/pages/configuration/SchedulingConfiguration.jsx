import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useLanguage } from "../../i18n/LanguageContext";
import { SETTINGS_SECTIONS } from "../../config/settingsProductNames";
import ConfigurationSection from "../../components/settings/ConfigurationSection";
import ConfigurationLoading from "../../components/settings/ConfigurationLoading";
import AtlasButton from "../../components/ui/AtlasButton";
import {
  disconnectGoogleCalendar,
  fetchGoogleCalendarAuthUrl,
  fetchGoogleCalendars,
  fetchSchedulingConfiguration,
  selectGoogleCalendar,
  updateSchedulingConfiguration
} from "../../services/configurationService";

export default function SchedulingConfiguration() {
  const { translate } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const [scheduling, setScheduling] = useState(null);
  const [googleCalendar, setGoogleCalendar] = useState(null);
  const [calendars, setCalendars] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const result = await fetchSchedulingConfiguration();
    setScheduling(result.scheduling);
    setGoogleCalendar(result.googleCalendar);

    if (result.googleCalendar?.connected) {
      try {
        const calendarResult = await fetchGoogleCalendars();
        setCalendars(calendarResult.calendars || []);
      } catch {
        setCalendars([]);
      }
    }
  }, []);

  useEffect(() => {
    load().catch((loadError) => setError(loadError.message));
  }, [load]);

  useEffect(() => {
    const googleStatus = searchParams.get("google");

    if (googleStatus === "connected") {
      setMessage(translate("configurationGoogleConnected"));
      setSearchParams({}, { replace: true });
      load().catch(() => {});
    }

    if (googleStatus === "error") {
      setError(translate("configurationGoogleConnectFailed"));
      setSearchParams({}, { replace: true });
    }
  }, [load, searchParams, setSearchParams, translate]);

  function updateSchedulingField(field, value) {
    setScheduling((current) => ({ ...current, [field]: value }));
  }

  function updateHourBlock(block, field, value) {
    setScheduling((current) => ({
      ...current,
      [block]: {
        ...current[block],
        [field]: value
      }
    }));
  }

  async function saveScheduling(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSaving(true);

    try {
      const result = await updateSchedulingConfiguration(scheduling);
      setScheduling(result.scheduling);
      setMessage(translate("configurationSaved"));
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  async function connectGoogle() {
    setError("");
    setMessage("");

    try {
      const result = await fetchGoogleCalendarAuthUrl();
      window.location.href = result.url;
    } catch (connectError) {
      setError(connectError.message);
    }
  }

  async function handleCalendarSelect(event) {
    const calendarId = event.target.value;
    if (!calendarId) {
      return;
    }

    setError("");
    setMessage("");

    try {
      await selectGoogleCalendar(calendarId);
      setMessage(translate("configurationCalendarSelected"));
      await load();
    } catch (selectError) {
      setError(selectError.message);
    }
  }

  async function handleDisconnect() {
    setError("");
    setMessage("");

    try {
      await disconnectGoogleCalendar();
      setCalendars([]);
      setMessage(translate("configurationGoogleDisconnected"));
      await load();
    } catch (disconnectError) {
      setError(disconnectError.message);
    }
  }

  if (!scheduling) {
    return error ? (
      <p className="configuration-message configuration-message--error" role="alert">
        {error}
      </p>
    ) : (
      <ConfigurationLoading />
    );
  }

  return (
    <div className="configuration-content">
      <ConfigurationSection title={translate("configurationGoogleAccount")}>
        <dl className="configuration-meta">
          <div>
            <dt>{translate("configurationGoogleAccount")}</dt>
            <dd>{googleCalendar?.googleAccountEmail || translate("configurationNotConnected")}</dd>
          </div>
          <div>
            <dt>{translate("configurationCalendar")}</dt>
            <dd>{googleCalendar?.calendarId || translate("configurationNotSet")}</dd>
          </div>
          <div>
            <dt>{translate("configurationLastSync")}</dt>
            <dd>
              {googleCalendar?.lastSync
                ? new Date(googleCalendar.lastSync).toLocaleString()
                : translate("configurationNotSet")}
            </dd>
          </div>
        </dl>

        <div className="configuration-actions">
          {!googleCalendar?.connected ? (
            <AtlasButton type="button" variant="primary" onClick={connectGoogle}>
              {translate("configurationConnectGoogle")}
            </AtlasButton>
          ) : (
            <AtlasButton type="button" variant="secondary" onClick={handleDisconnect}>
              {translate("configurationDisconnectGoogle")}
            </AtlasButton>
          )}
        </div>

        {googleCalendar?.connected && calendars.length > 0 ? (
          <div className="configuration-form" style={{ marginTop: "1rem" }}>
            <label>
              {translate("configurationSelectCalendar")}
              <select value={googleCalendar.calendarId || ""} onChange={handleCalendarSelect}>
              <option value="">{translate("configurationSelectCalendarPlaceholder")}</option>
              {calendars.map((calendar) => (
                <option key={calendar.id} value={calendar.id}>
                  {calendar.summary}
                  {calendar.primary ? ` (${translate("configurationPrimaryCalendar")})` : ""}
                </option>
              ))}
            </select>
            </label>
          </div>
        ) : null}
      </ConfigurationSection>

      <ConfigurationSection title={SETTINGS_SECTIONS.scheduling}>
        <form className="configuration-form" onSubmit={saveScheduling}>
          <fieldset>
            <legend>{translate("configurationWorkingHours")}</legend>
            <div className="configuration-grid-2">
              <label>
                {translate("configurationHoursStart")}
                <input
                  type="time"
                  value={scheduling.workingHours?.start || "09:00"}
                  onChange={(event) => updateHourBlock("workingHours", "start", event.target.value)}
                />
              </label>
              <label>
                {translate("configurationHoursEnd")}
                <input
                  type="time"
                  value={scheduling.workingHours?.end || "17:00"}
                  onChange={(event) => updateHourBlock("workingHours", "end", event.target.value)}
                />
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend>{translate("configurationPreferredAppointmentHours")}</legend>
            <div className="configuration-grid-2">
              <label>
                {translate("configurationHoursStart")}
                <input
                  type="time"
                  value={scheduling.preferredAppointmentHours?.start || "10:00"}
                  onChange={(event) =>
                    updateHourBlock("preferredAppointmentHours", "start", event.target.value)
                  }
                />
              </label>
              <label>
                {translate("configurationHoursEnd")}
                <input
                  type="time"
                  value={scheduling.preferredAppointmentHours?.end || "16:00"}
                  onChange={(event) =>
                    updateHourBlock("preferredAppointmentHours", "end", event.target.value)
                  }
                />
              </label>
            </div>
          </fieldset>

          <label>
            {translate("configurationMaxConcurrentAppointments")}
            <input
              type="number"
              min="1"
              max="20"
              value={scheduling.maxConcurrentBusinessAppointments ?? 2}
              onChange={(event) =>
                updateSchedulingField(
                  "maxConcurrentBusinessAppointments",
                  Number(event.target.value)
                )
              }
            />
          </label>

          <label className="configuration-checkbox">
            <input
              type="checkbox"
              checked={Boolean(scheduling.allowBusinessOverlap)}
              onChange={(event) => updateSchedulingField("allowBusinessOverlap", event.target.checked)}
            />
            {translate("configurationAllowBusinessOverlap")}
          </label>

          <label className="configuration-checkbox">
            <input
              type="checkbox"
              checked={scheduling.respectPersonalCalendar !== false}
              onChange={(event) =>
                updateSchedulingField("respectPersonalCalendar", event.target.checked)
              }
            />
            {translate("configurationRespectPersonalCalendar")}
          </label>

          <div className="configuration-actions">
            <AtlasButton type="submit" variant="primary" busy={saving}>
              {translate("configurationSave")}
            </AtlasButton>
          </div>
        </form>
      </ConfigurationSection>

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
    </div>
  );
}
