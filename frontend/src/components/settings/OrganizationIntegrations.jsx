import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useLanguage } from "../../i18n/LanguageContext";
import ConfigurationSection from "../../components/settings/ConfigurationSection";
import ConfigurationLoading from "../../components/settings/ConfigurationLoading";
import AtlasButton from "../../components/ui/AtlasButton";
import {
  disconnectGoogleCalendar,
  fetchGoogleCalendarAuthUrl,
  fetchGoogleCalendars,
  fetchOrganizationIntegrations,
  selectGoogleCalendar
} from "../../services/configurationService";

export default function OrganizationIntegrations() {
  const { translate } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const [integrations, setIntegrations] = useState(null);
  const [calendars, setCalendars] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await fetchOrganizationIntegrations();
    setIntegrations(result.integrations);

    if (result.integrations?.googleCalendar?.connected) {
      try {
        const calendarResult = await fetchGoogleCalendars();
        setCalendars(calendarResult.calendars || []);
      } catch {
        setCalendars([]);
      }
    } else {
      setCalendars([]);
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

  async function connectGoogle() {
    setError("");
    setMessage("");
    setBusy(true);

    try {
      const result = await fetchGoogleCalendarAuthUrl("settings/organization");
      window.location.href = result.url;
    } catch (connectError) {
      setError(connectError.message);
      setBusy(false);
    }
  }

  async function handleDisconnectGoogle() {
    setError("");
    setMessage("");
    setBusy(true);

    try {
      await disconnectGoogleCalendar();
      setCalendars([]);
      setMessage(translate("configurationGoogleDisconnected"));
      await load();
    } catch (disconnectError) {
      setError(disconnectError.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleCalendarSelect(event) {
    const calendarId = event.target.value;
    if (!calendarId) {
      return;
    }

    setError("");
    setMessage("");
    setBusy(true);

    try {
      await selectGoogleCalendar(calendarId);
      setMessage(translate("configurationCalendarSelected"));
      await load();
    } catch (selectError) {
      setError(selectError.message);
    } finally {
      setBusy(false);
    }
  }

  if (!integrations) {
    return error ? (
      <p className="configuration-message configuration-message--error" role="alert">
        {error}
      </p>
    ) : (
      <ConfigurationLoading />
    );
  }

  const googleCalendar = integrations.googleCalendar || {};

  return (
    <ConfigurationSection title={translate("configurationIntegrations")}>
      <div className="configuration-content">
        <section className="configuration-subsection">
          <h3 className="configuration-subsection__title">{translate("configurationGoogleCalendar")}</h3>
          <dl className="configuration-meta">
            <div>
              <dt>{translate("configurationConnectionStatus")}</dt>
              <dd>
                {googleCalendar.connected
                  ? translate("configurationConnected")
                  : translate("configurationNotConnected")}
              </dd>
            </div>
            <div>
              <dt>{translate("configurationGoogleAccount")}</dt>
              <dd>{googleCalendar.googleAccountEmail || translate("configurationNotSet")}</dd>
            </div>
            <div>
              <dt>{translate("configurationCalendar")}</dt>
              <dd>{googleCalendar.calendarId || translate("configurationNotSet")}</dd>
            </div>
          </dl>

          <div className="configuration-actions">
            {!googleCalendar.connected ? (
              <AtlasButton type="button" variant="primary" onClick={connectGoogle} busy={busy}>
                {translate("configurationConnectGoogle")}
              </AtlasButton>
            ) : (
              <AtlasButton type="button" variant="secondary" onClick={handleDisconnectGoogle} busy={busy}>
                {translate("configurationDisconnectGoogle")}
              </AtlasButton>
            )}
          </div>

          {googleCalendar.connected && calendars.length > 0 ? (
            <label className="configuration-form" style={{ marginTop: "1rem" }}>
              {translate("configurationSelectCalendar")}
              <select value={googleCalendar.calendarId || ""} onChange={handleCalendarSelect} disabled={busy}>
                <option value="">{translate("configurationSelectCalendarPlaceholder")}</option>
                {calendars.map((calendar) => (
                  <option key={calendar.id} value={calendar.id}>
                    {calendar.summary}
                    {calendar.primary ? ` (${translate("configurationPrimaryCalendar")})` : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </section>
      </div>

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
