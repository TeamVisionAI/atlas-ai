import { Link } from "react-router-dom";
import { useLanguage } from "../../i18n/LanguageContext";
import AtlasButton from "../ui/AtlasButton";
import SettingsIcon from "../icons/SettingsIcons";
import { resolveIntegrationLifecycle } from "../../utils/integrationLifecycle";

function IntegrationStatusBadge({ connected, translate, connectedLabel, disconnectedLabel }) {
  if (connected) {
    return (
      <span className="integration-status-badge integration-status-badge--connected">
        {connectedLabel || translate("configurationConnected")}
      </span>
    );
  }

  return (
    <span className="integration-status-badge integration-status-badge--disconnected">
      {disconnectedLabel || translate("configurationNotConnected")}
    </span>
  );
}

export default function IntegrationCard({
  icon,
  title,
  subtitle,
  connected = false,
  connecting = false,
  disconnecting = false,
  detailRows = [],
  showDetailsWhenDisconnected = false,
  connectLabel,
  disconnectLabel,
  viewDetailsLabel,
  viewDetailsTo = null,
  onConnect,
  connectTo = null,
  onDisconnect,
  busy = false,
  children = null,
  connectedLabel = null,
  disconnectedLabel = null,
  omitEmptyDetailRows = false
}) {
  const { translate } = useLanguage();
  const lifecycle = resolveIntegrationLifecycle({ connected, connecting, disconnecting });
  const isConnected = lifecycle === "connected";
  const isDisconnecting = lifecycle === "disconnecting";
  const isConnecting = lifecycle === "connecting";
  const showDetailRows =
    detailRows.length > 0 && (isConnected || showDetailsWhenDisconnected);
  const visibleDetailRows = omitEmptyDetailRows
    ? detailRows.filter((row) => Boolean(row.value))
    : detailRows;
  const notSetLabel = translate("configurationNotSet");

  return (
    <article className="integration-card">
      <header className="integration-card__header">
        <span className="integration-card__icon" aria-hidden="true">
          <SettingsIcon name={icon} />
        </span>
        <div>
          <h3 className="integration-card__title">{title}</h3>
          <p className="integration-card__subtitle">{subtitle}</p>
        </div>
      </header>

      <dl className="integration-card__meta">
        <div className="integration-card__meta-row">
          <dt>{translate("configurationConnectionStatus")}</dt>
          <dd>
            <IntegrationStatusBadge
              connected={isConnected}
              translate={translate}
              connectedLabel={connectedLabel}
              disconnectedLabel={disconnectedLabel}
            />
          </dd>
        </div>

        {showDetailRows
          ? visibleDetailRows.map((row) => (
              <div className="integration-card__meta-row" key={row.key || row.label}>
                <dt>{row.label}</dt>
                <dd>{row.value || notSetLabel}</dd>
              </div>
            ))
          : null}
      </dl>

      <div className="integration-card__actions">
        {!isConnected ? (
          connectTo ? (
            <Link
              className="atlas-ui-button atlas-ui-button--primary"
              to={connectTo}
              aria-busy={isConnecting || undefined}
            >
              {connectLabel}
            </Link>
          ) : (
            <AtlasButton
              type="button"
              variant="primary"
              onClick={onConnect}
              busy={busy || isConnecting}
            >
              {connectLabel}
            </AtlasButton>
          )
        ) : (
          <>
            {viewDetailsTo && viewDetailsLabel ? (
              <Link className="atlas-ui-button atlas-ui-button--secondary" to={viewDetailsTo}>
                {viewDetailsLabel}
              </Link>
            ) : null}
            <AtlasButton
              type="button"
              variant="secondary"
              onClick={onDisconnect}
              busy={busy || isDisconnecting}
            >
              {disconnectLabel}
            </AtlasButton>
          </>
        )}
      </div>

      {children}
    </article>
  );
}
