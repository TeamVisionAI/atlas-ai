import { useLanguage } from "../../i18n/LanguageContext";
import { appPath } from "../../config/appRoutes";
import IntegrationCard from "./IntegrationCard";
import {
  formatIntegrationDate,
  formatWebhookStatus
} from "../../utils/integrationLifecycle";

export default function WhatsAppIntegrationCard({
  connected,
  connection = {},
  busy = false,
  disconnecting = false,
  onDisconnect
}) {
  const { translate, language } = useLanguage();
  const locale = language === "es" ? "es-US" : "en-US";

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

  return (
    <IntegrationCard
      icon="whatsapp"
      title={translate("whatsappIntegrationTitle")}
      subtitle={translate("whatsappIntegrationSubtitle")}
      connected={connected}
      disconnecting={disconnecting}
      detailRows={detailRows}
      connectLabel={translate("whatsappConnectButton")}
      connectTo={appPath("settings/whatsapp")}
      disconnectLabel={translate("whatsappIntegrationDisconnect")}
      viewDetailsLabel={translate("whatsappIntegrationViewDetails")}
      viewDetailsTo={appPath("settings/whatsapp")}
      onDisconnect={onDisconnect}
      busy={busy}
    />
  );
}
