import { Link } from "react-router-dom";
import { appPath } from "../../config/appRoutes";
import { META_REVIEW_COPY } from "./metaReviewCopy";
import {
  formatMetaReviewConnectionStatus,
  formatMetaReviewServiceStatus,
  formatMetaReviewSyncTime
} from "./metaReviewFormatters";
import "./metaReviewDesign.css";
import "./MetaReviewWhatsAppPage.css";

function StatusField({ label, value, empty = false }) {
  if (!value && !empty) {
    return null;
  }

  return (
    <div className="meta-review-field">
      <span className="meta-review-field__label">{label}</span>
      <p className={`meta-review-field__value${empty ? " meta-review-field__value--empty" : ""}`}>{value}</p>
    </div>
  );
}

export default function MetaReviewWhatsAppPage({
  connected,
  connection = {},
  health = null,
  loading,
  error,
  launching,
  configurationMissing,
  sdkError,
  onConnect,
  connectDisabled
}) {
  const copy = META_REVIEW_COPY;
  const webhookHealthy =
    connected &&
    (health?.checks?.wabaSubscribed === true ||
      health?.healthy === true ||
      connection?.healthStatus === "healthy");

  const syncTime = formatMetaReviewSyncTime(
    connection.lastSyncAt || health?.checkedAt || connection.healthCheckedAt
  );

  const dataFields = [
    { label: copy.businessName, value: connection.businessName },
    { label: copy.displayName, value: connection.verifiedName || connection.businessName },
    { label: copy.wabaId, value: connection.wabaId },
    { label: copy.phoneNumber, value: connection.displayPhoneNumber }
  ].filter((field) => field.value);

  const statusFields = [
    { label: copy.cloudApiStatus, value: formatMetaReviewServiceStatus(connected) },
    { label: copy.webhookStatus, value: formatMetaReviewServiceStatus(webhookHealthy) }
  ];

  if (syncTime) {
    statusFields.push({ label: copy.lastSynchronization, value: syncTime });
  }

  return (
    <div className="meta-review-whatsapp">
      <header className="meta-review-whatsapp__header">
        <p className="meta-review-eyebrow">Integrations</p>
        <h1 className="meta-review-title">{copy.whatsappPageTitle}</h1>
        <p className="meta-review-body meta-review-whatsapp__intro">{copy.whatsappPageIntro}</p>
        <p className="meta-review-note">{copy.whatsappPermissionsNote}</p>
      </header>

      <section className="meta-review-surface meta-review-whatsapp__card" aria-labelledby="meta-review-whatsapp-status-title">
        <div className="meta-review-whatsapp__card-header">
          <h2 id="meta-review-whatsapp-status-title" className="meta-review-whatsapp__card-title">
            {copy.integrationStatus}
          </h2>
          <span
            className={`meta-review-status-badge meta-review-status-badge--hero ${
              connected ? "meta-review-status-badge--connected" : "meta-review-status-badge--disconnected"
            }`}
          >
            {formatMetaReviewConnectionStatus(connected)}
          </span>
        </div>

        {loading ? <p className="meta-review-message">{copy.loading}</p> : null}
        {error ? <p className="meta-review-message">{copy.loadError}</p> : null}

        {!loading ? (
          <div className="meta-review-field-grid">
            {dataFields.map((field) => (
              <StatusField key={field.label} label={field.label} value={field.value} />
            ))}
            {statusFields.map((field) => (
              <StatusField key={field.label} label={field.label} value={field.value} />
            ))}
          </div>
        ) : null}

        <div className="meta-review-whatsapp__actions">
          {!connected && !configurationMissing && !sdkError ? (
            <button
              type="button"
              className="meta-review-button"
              onClick={onConnect}
              disabled={connectDisabled}
            >
              {launching ? copy.connecting : copy.connectWhatsApp}
            </button>
          ) : null}
          <Link className="meta-review-button meta-review-button--secondary" to={appPath("settings/integrations")}>
            {copy.manageInSettings}
          </Link>
        </div>
      </section>
    </div>
  );
}
