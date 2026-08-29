import { useLanguage } from "../../i18n/LanguageContext";
import { appPath } from "../../config/appRoutes";
import IntegrationCard from "./IntegrationCard";
import { formatIntegrationDate, formatWebhookStatus } from "../../utils/integrationLifecycle";
import {
  OWNERSHIP_ORGANIZATION,
  OWNERSHIP_PERSONAL,
  buildWhatsAppConnectHref
} from "../../engines/whatsappEmbeddedSignupOwnership";

export default function WhatsAppIntegrationCard({
  connected,
  connection = {},
  busy = false,
  disconnecting = false,
  onDisconnect,
  ownershipMode = OWNERSHIP_PERSONAL
}) {
  const { translate, language } = useLanguage();
  const locale = language === "es" ? "es-US" : "en-US";

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
    />
  );
}
