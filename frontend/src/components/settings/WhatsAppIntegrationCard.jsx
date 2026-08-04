import { useLanguage } from "../../i18n/LanguageContext";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import { appPath } from "../../config/appRoutes";
import { isMetaReviewWorkspaceActive } from "../../config/metaReviewMode";
import {
  formatMetaReviewConnectionStatus,
  formatMetaReviewServiceStatus,
  formatMetaReviewSyncTime
} from "../meta-review/metaReviewFormatters";
import IntegrationCard from "./IntegrationCard";
import { formatIntegrationDate, formatWebhookStatus } from "../../utils/integrationLifecycle";

export default function WhatsAppIntegrationCard({
  connected,
  connection = {},
  busy = false,
  disconnecting = false,
  onDisconnect
}) {
  const { translate, language } = useLanguage();
  const { user } = useWorkspace();
  const metaReviewMode = isMetaReviewWorkspaceActive(user);
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
          label: metaReviewMode
            ? "Webhook Status"
            : translate("whatsappIntegrationWebhookStatus"),
          value: metaReviewMode
            ? formatMetaReviewServiceStatus(webhookHealthy)
            : formatWebhookStatus(connection.healthStatus, connected, translate)
        },
        {
          key: "connection-date",
          label: metaReviewMode
            ? "Last Synchronization"
            : translate("whatsappIntegrationConnectionDate"),
          value: metaReviewMode
            ? formatMetaReviewSyncTime(connection.lastSyncAt || connection.connectedAt)
            : formatIntegrationDate(connection.connectedAt, locale)
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
      connectedLabel={metaReviewMode ? formatMetaReviewConnectionStatus(connected) : null}
      disconnectedLabel={metaReviewMode ? formatMetaReviewConnectionStatus(false) : null}
      omitEmptyDetailRows={metaReviewMode}
    />
  );
}
