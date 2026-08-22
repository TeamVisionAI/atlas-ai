import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useLanguage } from "../../i18n/LanguageContext";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import ConfigurationSection from "../../components/settings/ConfigurationSection";
import ConfigurationLoading from "../../components/settings/ConfigurationLoading";
import IntegrationCard from "../../components/settings/IntegrationCard";
import SettingsIcon from "../../components/icons/SettingsIcons";
import WhatsAppIntegrationCard from "../../components/settings/WhatsAppIntegrationCard";
import AtlasButton from "../../components/ui/AtlasButton";
import {
  disconnectGoogleCalendar,
  fetchGoogleCalendarAuthUrl,
  fetchGoogleCalendars,
  fetchOrganizationIntegrations,
  selectGoogleCalendar
} from "../../services/configurationService";
import {
  resolveGoogleCalendarListUiFailure,
  shouldFetchGoogleCalendarList
} from "../../services/googleCalendarListUi";
import { disconnectWhatsAppIntegration } from "../../services/metaEmbeddedSignupService";
import { updateAppointmentProfile } from "../../services/appointmentService";
import { roleHasPermission, PERMISSIONS } from "../../security/workspacePermissions";

export default function OrganizationIntegrations() {
  const { translate } = useLanguage();
  const { user } = useWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const [integrations, setIntegrations] = useState(null);
  const [calendars, setCalendars] = useState([]);
  const [zoomUrl, setZoomUrl] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState(null);
  const canManageOrgChannel = roleHasPermission(user?.role, PERMISSIONS.ORG_WRITE);

  const load = useCallback(async () => {
    const result = await fetchOrganizationIntegrations();
    setIntegrations(result.integrations);
    setZoomUrl(result.integrations?.zoom?.personalMeetingUrl || "");

    const googleCalendar = result.integrations?.googleCalendar || {};

    if (googleCalendar.reconnectRequired) {
      setCalendars([]);
      setError(translate("configurationGoogleReconnectRequired"));
      return;
    }

    if (shouldFetchGoogleCalendarList(googleCalendar)) {
      try {
        const calendarResult = await fetchGoogleCalendars({ ownershipMode: "personal" });
        setCalendars(calendarResult.calendars || []);
        setError("");
      } catch (calendarError) {
        const uiFailure = resolveGoogleCalendarListUiFailure(calendarError, googleCalendar);
        setCalendars(uiFailure.calendars);
        if (uiFailure.reconnectRequired && !uiFailure.suppressGoogleError) {
          setError(translate("configurationGoogleReconnectRequired"));
        }
      }
    } else {
      setCalendars([]);
    }
  }, [translate]);

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
      const result = await fetchGoogleCalendarAuthUrl("settings/integrations", {
        ownershipMode: "personal"
      });
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
      await disconnectGoogleCalendar({ ownershipMode: "personal" });
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
      await disconnectWhatsAppIntegration({ ownership: "personal" });
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
      await selectGoogleCalendar(calendarId, { ownershipMode: "personal" });
      setMessage(translate("configurationCalendarSelected"));
      await load();
    } catch {
      setError(translate("configurationLoadFailed"));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSaveZoom() {
    setError("");
    setMessage("");
    setBusyAction("zoom-save");

    try {
      await updateAppointmentProfile({
        virtualMeeting: { personalMeetingUrl: zoomUrl.trim() }
      });
      setMessage(translate("configurationZoomSaved"));
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
  const orgChannel = integrations.organizationChannel || null;
  const readiness = integrations.readiness || null;

  return (
    <ConfigurationSection title={translate("configurationIntegrations")}>
      <p className="configuration-integrations-intro">
        {translate("configurationIntegrationsIntroPersonal")}
      </p>

      {readiness ? (
        <p className="configuration-integrations-intro" data-testid="agent-readiness-summary">
          {translate("configurationAgentReadinessLabel")}:{" "}
          {readiness.ready
            ? translate("configurationAgentReadinessReady")
            : translate("configurationAgentReadinessPending")}
          {" · "}
          {translate("configurationLeadChannelTitle")}: {readiness.leadChannelLabel}
        </p>
      ) : null}

      <div className="configuration-content configuration-content--integrations">
        {whatsapp.visible ? (
          <WhatsAppIntegrationCard
            connected={Boolean(whatsapp.connected)}
            connection={whatsapp.connection || {}}
            busy={whatsappBusy}
            disconnecting={busyAction === "whatsapp-disconnect"}
            onDisconnect={handleDisconnectWhatsApp}
          />
        ) : integrations.organizationLeadChannel?.managedByOrganization ? (
          <article className="integration-card integration-card--info" data-testid="org-lead-channel-info">
            <header className="integration-card__header">
              <span className="integration-card__icon" aria-hidden="true">
                <SettingsIcon name="integrations" />
              </span>
              <div>
                <h3 className="integration-card__title">
                  {translate("configurationLeadChannelTitle")}
                </h3>
                <p className="integration-card__subtitle">
                  {translate("configurationLeadChannelOrganizationManaged")}
                </p>
              </div>
            </header>
          </article>
        ) : null}

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

        <article className="integration-card">
          <header className="integration-card__header">
            <span className="integration-card__icon" aria-hidden="true">
              <SettingsIcon name="integrations" />
            </span>
            <div>
              <h3 className="integration-card__title">{translate("configurationPersonalZoom")}</h3>
              <p className="integration-card__subtitle">
                {translate("configurationPersonalZoomIntro")}
              </p>
            </div>
          </header>
          <label className="configuration-form">
            {translate("configurationPersonalZoomUrl")}
            <input
              type="url"
              value={zoomUrl}
              onChange={(event) => setZoomUrl(event.target.value)}
              placeholder="https://zoom.us/j/…"
              disabled={busyAction === "zoom-save"}
            />
          </label>
          <AtlasButton type="button" onClick={handleSaveZoom} disabled={busyAction === "zoom-save"}>
            {translate("configurationSaveZoom")}
          </AtlasButton>
        </article>
      </div>

      {canManageOrgChannel && orgChannel ? (
        <div
          className="configuration-content configuration-content--integrations"
          style={{ marginTop: "1.5rem" }}
        >
          <h3 className="configuration-subsection-title">
            {translate("configurationOrganizationChannel")}
          </h3>
          <p className="configuration-integrations-intro">
            {translate("configurationOrganizationChannelIntro")}
          </p>
          <WhatsAppIntegrationCard
            connected={Boolean(orgChannel.whatsapp?.connected)}
            connection={orgChannel.whatsapp?.connection || {}}
            busy={false}
            disconnecting={busyAction === "org-whatsapp-disconnect"}
            onDisconnect={async () => {
              setBusyAction("org-whatsapp-disconnect");
              try {
                await disconnectWhatsAppIntegration({ ownership: "organization" });
                setMessage(translate("whatsappIntegrationDisconnected"));
                await load();
              } catch {
                setError(translate("whatsappIntegrationDisconnectFailed"));
              } finally {
                setBusyAction(null);
              }
            }}
          />
          <IntegrationCard
            icon="calendar"
            title={translate("configurationOrgGoogleCalendar")}
            subtitle={translate("configurationOrgGoogleCalendarIntro")}
            connected={Boolean(orgChannel.googleCalendar?.connected)}
            connecting={false}
            disconnecting={busyAction === "org-google-disconnect"}
            showDetailsWhenDisconnected
            detailRows={[
              {
                key: "org-google-account",
                label: translate("configurationGoogleAccount"),
                value: orgChannel.googleCalendar?.googleAccountEmail
              }
            ]}
            connectLabel={translate("configurationConnectGoogle")}
            disconnectLabel={translate("configurationDisconnectGoogle")}
            onConnect={async () => {
              const result = await fetchGoogleCalendarAuthUrl("settings/integrations", {
                ownershipMode: "organization"
              });
              window.location.href = result.url;
            }}
            onDisconnect={async () => {
              setBusyAction("org-google-disconnect");
              try {
                await disconnectGoogleCalendar({ ownershipMode: "organization" });
                setMessage(translate("configurationGoogleDisconnected"));
                await load();
              } catch {
                setError(translate("configurationGoogleConnectFailed"));
              } finally {
                setBusyAction(null);
              }
            }}
            busy={busyAction === "org-google-disconnect"}
          />
        </div>
      ) : null}

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
