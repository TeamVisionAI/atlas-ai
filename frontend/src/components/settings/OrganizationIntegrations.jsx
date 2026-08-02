import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useLanguage } from "../../i18n/LanguageContext";
import { isMetaReviewModeEnabled } from "../../config/metaReviewMode";
import ConfigurationSection from "../../components/settings/ConfigurationSection";
import ConfigurationLoading from "../../components/settings/ConfigurationLoading";
import IntegrationCard from "../../components/settings/IntegrationCard";
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
import { META_REVIEW_COPY } from "../meta-review/metaReviewCopy";

export default function OrganizationIntegrations() {
  const { translate } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const [integrations, setIntegrations] = useState(null);
  const [calendars, setCalendars] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState(null);

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
    load().catch(() => setError(translate("configurationIntegrationsLoadFailed")));
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
    setBusyAction("google-connect");

    try {
      const result = await fetchGoogleCalendarAuthUrl("settings/integrations");
      window.location.href = result.url;
    } catch {
      setError(translate("configurationGoogleConnectFailed"));
      setBusyAction(null);
    }
  }

  async function handleDisconnectGoogle() {
    setError("");
    setMessage("");
    setBusyAction("google-disconnect");

    const previousIntegrations = integrations;

    setIntegrations((current) => ({
      ...current,
      googleCalendar: {
        ...(current.googleCalendar || {}),
        connected: false,
        googleAccountEmail: null,
        calendarId: null
      }
    }));
    setCalendars([]);

    try {
      await disconnectGoogleCalendar();
      setMessage(translate("configurationGoogleDisconnected"));
      await load();
    } catch {
      setIntegrations(previousIntegrations);
      setError(translate("configurationGoogleConnectFailed"));
      await load();
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDisconnectWhatsApp() {
    setError("");
    setMessage("");
    setBusyAction("whatsapp-disconnect");

    const previousIntegrations = integrations;

    setIntegrations((current) => ({
      ...current,
      whatsapp: {
        ...(current.whatsapp || {}),
        connected: false,
        status: "disconnected",
        connection: null
      }
    }));

    try {
      await disconnectWhatsAppIntegration();
      setMessage(translate("whatsappIntegrationDisconnected"));
      await load();
    } catch {
      setIntegrations(previousIntegrations);
      setError(translate("whatsappIntegrationDisconnectFailed"));
      await load();
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCalendarSelect(event) {
    const calendarId = event.target.value;
    if (!calendarId) {
      return;
    }

    setError("");
    setMessage("");
    setBusyAction("google-calendar");

    try {
      await selectGoogleCalendar(calendarId);
      setMessage(translate("configurationCalendarSelected"));
      await load();
    } catch {
      setError(translate("configurationLoadFailed"));
    } finally {
      setBusyAction(null);
    }
  }

  const googleBusy =
    busyAction === "google-connect" ||
    busyAction === "google-disconnect" ||
    busyAction === "google-calendar";
  const whatsappBusy = busyAction === "whatsapp-disconnect";

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
  const metaReviewMode = isMetaReviewModeEnabled();

  return (
    <ConfigurationSection title={translate("configurationIntegrations")}>
      <p className="configuration-integrations-intro">
        {metaReviewMode ? META_REVIEW_COPY.integrationsPageIntro : translate("configurationIntegrationsIntro")}
      </p>

      <div className="configuration-content configuration-content--integrations">
        <WhatsAppIntegrationCard
          connected={Boolean(whatsapp.connected)}
          connection={whatsapp.connection || {}}
          busy={whatsappBusy}
          disconnecting={busyAction === "whatsapp-disconnect"}
          onDisconnect={handleDisconnectWhatsApp}
        />

        {!metaReviewMode ? (
          <>
            <IntegrationCard
              icon="calendar"
              title={translate("configurationGoogleCalendar")}
              subtitle={translate("configurationGoogleCalendarIntro")}
              connected={Boolean(googleCalendar.connected)}
              connecting={busyAction === "google-connect"}
              disconnecting={busyAction === "google-disconnect"}
              showDetailsWhenDisconnected
              detailRows={[
                {
                  key: "google-account",
                  label: translate("configurationGoogleAccount"),
                  value: googleCalendar.googleAccountEmail
                },
                {
                  key: "calendar",
                  label: translate("configurationCalendar"),
                  value: googleCalendar.calendarId
                }
              ]}
              connectLabel={translate("configurationConnectGoogle")}
              disconnectLabel={translate("configurationDisconnectGoogle")}
              onConnect={connectGoogle}
              onDisconnect={handleDisconnectGoogle}
              busy={googleBusy}
            >
              {googleCalendar.connected && calendars.length > 0 ? (
                <label className="configuration-form integration-card__calendar-select">
                  {translate("configurationSelectCalendar")}
                  <select
                    value={googleCalendar.calendarId || ""}
                    onChange={handleCalendarSelect}
                    disabled={googleBusy}
                  >
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
            </IntegrationCard>

            <article className="integration-card integration-card--placeholder" aria-disabled="true">
              <header className="integration-card__header">
                <span className="integration-card__icon integration-card__icon--muted" aria-hidden="true">
                  <SettingsIcon name="integrations" />
                </span>
                <div>
                  <h3 className="integration-card__title">{translate("configurationIntegrationsComingSoonTitle")}</h3>
                  <p className="integration-card__subtitle">
                    {translate("configurationIntegrationsComingSoonDescription")}
                  </p>
                </div>
              </header>
            </article>
          </>
        ) : null}
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
