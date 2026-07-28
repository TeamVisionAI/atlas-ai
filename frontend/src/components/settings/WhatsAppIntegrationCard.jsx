import { useState } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../../i18n/LanguageContext";
import { appPath } from "../../config/appRoutes";
import AtlasButton from "../ui/AtlasButton";
import SettingsIcon from "../icons/SettingsIcons";

function formatIntegrationDate(value, locale) {
  if (!value) {
    return "—";
  }

  try {
    return new Date(value).toLocaleString(locale);
  } catch {
    return value;
  }
}

export default function WhatsAppIntegrationCard({
  connected,
  connection = {},
  busy = false,
  onDisconnect
}) {
  const { translate, language } = useLanguage();
  const [showTechnical, setShowTechnical] = useState(false);
  const locale = language === "es" ? "es-US" : "en-US";

  const hasTechnicalDetails =
    Boolean(connection.businessId) ||
    Boolean(connection.wabaId) ||
    Boolean(connection.phoneNumberId);

  return (
    <article className="integration-card">
      <header className="integration-card__header">
        <span className="integration-card__icon" aria-hidden="true">
          <SettingsIcon name="whatsapp" />
        </span>
        <div>
          <h3 className="integration-card__title">{translate("whatsappIntegrationTitle")}</h3>
          <p className="integration-card__subtitle">{translate("whatsappIntegrationSubtitle")}</p>
        </div>
      </header>

      <dl className="integration-card__meta">
        <div className="integration-card__meta-row">
          <dt>{translate("configurationConnectionStatus")}</dt>
          <dd>
            {connected ? (
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
        {connected ? (
          <>
            <div className="integration-card__meta-row">
              <dt>{translate("whatsappSuccessBusinessName")}</dt>
              <dd>{connection.businessName || translate("configurationNotSet")}</dd>
            </div>
            <div className="integration-card__meta-row">
              <dt>{translate("whatsappIntegrationDisplayPhone")}</dt>
              <dd>{connection.displayPhoneNumber || translate("configurationNotSet")}</dd>
            </div>
            <div className="integration-card__meta-row">
              <dt>{translate("whatsappSuccessConnectedAt")}</dt>
              <dd>{formatIntegrationDate(connection.connectedAt, locale)}</dd>
            </div>
            <div className="integration-card__meta-row">
              <dt>{translate("whatsappIntegrationLastSync")}</dt>
              <dd>{formatIntegrationDate(connection.lastSyncAt, locale)}</dd>
            </div>
          </>
        ) : (
          <div className="integration-card__meta-row">
            <dt>{translate("whatsappIntegrationBenefit")}</dt>
            <dd>{translate("whatsappIntegrationBenefitDescription")}</dd>
          </div>
        )}
      </dl>

      {connected && hasTechnicalDetails ? (
        <div className="integration-card__technical">
          <button
            type="button"
            className="integration-card__technical-toggle"
            aria-expanded={showTechnical}
            onClick={() => setShowTechnical((open) => !open)}
          >
            {translate("whatsappIntegrationTechnicalDetails")}
          </button>
          {showTechnical ? (
            <dl className="integration-card__technical-panel">
              {connection.businessId ? (
                <div>
                  <dt>{translate("whatsappIntegrationBusinessId")}</dt>
                  <dd>{connection.businessId}</dd>
                </div>
              ) : null}
              {connection.wabaId ? (
                <div>
                  <dt>{translate("whatsappConnectWabaId")}</dt>
                  <dd>{connection.wabaId}</dd>
                </div>
              ) : null}
              {connection.phoneNumberId ? (
                <div>
                  <dt>{translate("whatsappConnectPhoneNumberId")}</dt>
                  <dd>{connection.phoneNumberId}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
        </div>
      ) : null}

      <div className="integration-card__actions">
        {!connected ? (
          <Link className="atlas-ui-button atlas-ui-button--primary" to={appPath("settings/whatsapp")}>
            {translate("whatsappConnectButton")}
          </Link>
        ) : (
          <>
            <Link className="atlas-ui-button atlas-ui-button--secondary" to={appPath("settings/whatsapp")}>
              {translate("whatsappIntegrationReconnect")}
            </Link>
            <AtlasButton type="button" variant="secondary" onClick={onDisconnect} busy={busy}>
              {translate("whatsappIntegrationDisconnect")}
            </AtlasButton>
          </>
        )}
      </div>
    </article>
  );
}
