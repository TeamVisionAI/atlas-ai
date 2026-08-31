import { useEffect, useState } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import { appPath } from "../../config/appRoutes";
import IntegrationCard from "./IntegrationCard";
import { formatIntegrationDate, formatWebhookStatus } from "../../utils/integrationLifecycle";
import {
  OWNERSHIP_ORGANIZATION,
  OWNERSHIP_PERSONAL,
  buildWhatsAppConnectHref
} from "../../engines/whatsappEmbeddedSignupOwnership";
import { updateWhatsAppMetaAdDestinationAutomation } from "../../services/metaEmbeddedSignupService";

export default function WhatsAppIntegrationCard({
  connected,
  connection = {},
  busy = false,
  disconnecting = false,
  onDisconnect,
  ownershipMode = OWNERSHIP_PERSONAL,
  onConnectionUpdated
}) {
  const { translate, language } = useLanguage();
  const locale = language === "es" ? "es-US" : "en-US";
  const [adDestinationEnabled, setAdDestinationEnabled] = useState(
    Boolean(connection.metaAdDestinationAutomationEnabled)
  );
  const [adDestinationBusy, setAdDestinationBusy] = useState(false);
  const [adDestinationError, setAdDestinationError] = useState("");

  useEffect(() => {
    setAdDestinationEnabled(Boolean(connection.metaAdDestinationAutomationEnabled));
  }, [connection.metaAdDestinationAutomationEnabled]);

  async function handleAdDestinationChange(nextEnabled) {
    setAdDestinationError("");
    setAdDestinationBusy(true);
    setAdDestinationEnabled(nextEnabled);
    try {
      const result = await updateWhatsAppMetaAdDestinationAutomation({
        enabled: nextEnabled,
        ownership: ownershipMode
      });
      setAdDestinationEnabled(
        Boolean(result?.connection?.metaAdDestinationAutomationEnabled)
      );
      onConnectionUpdated?.(result);
    } catch {
      setAdDestinationEnabled(Boolean(connection.metaAdDestinationAutomationEnabled));
      setAdDestinationError(translate("whatsappMetaAdDestinationSaveFailed"));
    } finally {
      setAdDestinationBusy(false);
    }
  }

  const webhookHealthy =
    connected &&
    String(connection.healthStatus || "healthy").trim().toLowerCase() !== "disconnected" &&
    String(connection.healthStatus || "healthy").trim().toLowerCase() !== "error";

  const detailRows = connected
    ? [
        {
          key: "business-manager",
          label: translate("whatsappIntegrationBusinessManager"),
          value: connection.businessName
        },
        {
          key: "waba-account",
          label: translate("whatsappIntegrationWabaAccount"),
          value: connection.verifiedName || connection.businessName || connection.wabaId
        },
        {
          key: "phone-number",
          label: translate("whatsappIntegrationPhoneNumber"),
          value: connection.displayPhoneNumber
        },
        {
          key: "webhook-status",
          label: translate("whatsappIntegrationWebhookStatus"),
          value: formatWebhookStatus(connection.healthStatus, connected, translate)
        },
        {
          key: "connection-date",
          label: translate("whatsappIntegrationConnectionDate"),
          value: formatIntegrationDate(connection.connectedAt, locale)
        }
      ]
    : [];

  const connectHref = buildWhatsAppConnectHref(appPath("settings/whatsapp"), ownershipMode);
  const isOrgChannel = ownershipMode === OWNERSHIP_ORGANIZATION;

  return (
    <IntegrationCard
      icon="whatsapp"
      title={translate("whatsappIntegrationTitle")}
      subtitle={translate("whatsappIntegrationSubtitle")}
      connected={connected}
      disconnecting={disconnecting}
      detailRows={detailRows}
      connectLabel={translate("whatsappConnectButton")}
      connectTo={connectHref}
      disconnectLabel={translate("whatsappIntegrationDisconnect")}
      viewDetailsLabel={translate("whatsappIntegrationViewDetails")}
      viewDetailsTo={connectHref}
      reconnectLabel={isOrgChannel ? translate("whatsappIntegrationReconnect") : null}
      reconnectTo={isOrgChannel ? connectHref : null}
      onDisconnect={onDisconnect}
      busy={busy}
    >
      {connected ? (
        <div className="integration-card__ad-destination">
          <label className="configuration-checkbox">
            <input
              type="checkbox"
              checked={adDestinationEnabled}
              disabled={busy || adDestinationBusy || disconnecting}
              onChange={(event) => handleAdDestinationChange(event.target.checked)}
              data-testid="whatsapp-meta-ad-destination-toggle"
            />
            {translate("whatsappMetaAdDestinationLabel")}
          </label>
          <p className="integration-card__ad-destination-warning">
            {translate("whatsappMetaAdDestinationWarning")}
          </p>
          {adDestinationError ? (
            <p className="configuration-message configuration-message--error" role="alert">
              {adDestinationError}
            </p>
          ) : null}
        </div>
      ) : null}
    </IntegrationCard>
  );
}
