import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useLanguage } from "../../i18n/LanguageContext";
import ConfigurationSection from "../../components/settings/ConfigurationSection";
import ConfigurationLoading from "../../components/settings/ConfigurationLoading";
import AtlasButton from "../../components/ui/AtlasButton";
import SettingsIcon from "../../components/icons/SettingsIcons";
import WhatsAppIntegrationCard from "../../components/settings/WhatsAppIntegrationCard";
import {
  disconnectGoogleCalendar,
  fetchGoogleCalendarAuthUrl,
  fetchGoogleCalendars,
  fetchOrganizationIntegrations,
  selectGoogleCalendar
} from "../../services/configurationService";
import { disconnectWhatsAppIntegration } from "../../services/metaEmbeddedSignupService";

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
    load().catch(() => setError(translate("configurationLoadFailed")));
  }, [load, translate]);

  useEffect(() => {
    const googleStatus = searchParams.get("google");
    const whatsappStatus = searchParams.get("whatsapp");

    if (googleStatus === "connected") {
      setMessage(translate("configurationGoogleConnected"));
      setSearchParams({}, { replace: true });
      load().catch(() => {});
    }

    if (googleStatus === "error") {
      setError(translate("configurationGoogleConnectFailed"));
      setSearchParams({}, { replace: true });
    }

    if (whatsappStatus === "connected") {
      setMessage(translate("whatsappSuccessTitle"));
      setSearchParams({}, { replace: true });
      load().catch(() => {});
    }
  }, [load, searchParams, setSearchParams, translate]);

  async function connectGoogle() {
    setError("");
    setMessage("");
    setBusy(true);

    try {
      const result = await fetchGoogleCalendarAuthUrl("settings/organization");
      window.location.href = result.url;
    } catch {
      setError(translate("configurationGoogleConnectFailed"));
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
    } catch {
      setError(translate("configurationGoogleConnectFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnectWhatsApp() {
    setError("");
    setMessage("");
    setBusy(true);

    try {
      await disconnectWhatsAppIntegration();
      setMessage(translate("whatsappIntegrationDisconnected"));
      await load();
    } catch {
      setError(translate("whatsappIntegrationDisconnectFailed"));
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
    } catch {
      setError(translate("configurationLoadFailed"));
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
  const whatsapp = integrations.whatsapp || {};

  return (
    <ConfigurationSection title={translate("configurationIntegrations")}>
      <p className="configuration-integrations-intro">{translate("configurationIntegrationsIntro")}</p>

      <div className="configuration-content configuration-content--integrations">
        <WhatsAppIntegrationCard
          connected={Boolean(whatsapp.connected)}
          connection={whatsapp.connection || {}}
          busy={busy}
          onDisconnect={handleDisconnectWhatsApp}
        />

        <article className="integration-card">
          <header className="integration-card__header">
            <span className="integration-card__icon" aria-hidden="true">
              <SettingsIcon name="calendar" />
            </span>
            <div>
              <h3 className="integration-card__title">{translate("configurationGoogleCalendar")}</h3>
              <p className="integration-card__subtitle">{translate("configurationGoogleCalendarIntro")}</p>
            </div>
          </header>

          <dl className="integration-card__meta">
            <div className="integration-card__meta-row">
              <dt>{translate("configurationConnectionStatus")}</dt>
              <dd>
                {googleCalendar.connected ? (
                  <span className="integration-status-badge integration-status-badge--connected">
                    {translate("configurationConnected")}
                  </span>
                ) : (
                  <span className="integration-status-badge integration-status-badge--disconnected">
                    {translate("configurationNotConnected")}
                  </span>
                )}
              </dd>
            </div>
            <div className="integration-card__meta-row">
              <dt>{translate("configurationGoogleAccount")}</dt>
              <dd>{googleCalendar.googleAccountEmail || translate("configurationNotSet")}</dd>
            </div>
            <div className="integration-card__meta-row">
              <dt>{translate("configurationCalendar")}</dt>
              <dd>{googleCalendar.calendarId || translate("configurationNotSet")}</dd>
            </div>
          </dl>

          <div className="integration-card__actions">
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
            <label className="configuration-form integration-card__calendar-select">
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
        </article>
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
