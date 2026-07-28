import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useLanguage } from "../i18n/LanguageContext";
import { appPath } from "../config/appRoutes";
import { getEmbeddedSignupStatus } from "../services/metaEmbeddedSignupService";
import "./WhatsAppConnect.css";

export default function WhatsAppConnectSuccess() {
  const { translate } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const [connection, setConnection] = useState(location.state?.connection || null);

  useEffect(() => {
    if (connection) {
      return undefined;
    }

    let cancelled = false;

    getEmbeddedSignupStatus()
      .then((payload) => {
        if (!cancelled && payload.connected && payload.connection) {
          setConnection(payload.connection);
        } else if (!cancelled) {
          navigate(appPath("settings/integrations"), { replace: true });
        }
      })
      .catch(() => {
        if (!cancelled) {
          navigate(appPath("settings/integrations"), { replace: true });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [connection, navigate]);

  if (!connection) {
    return null;
  }

  return (
    <div className="whatsapp-connect whatsapp-connect--success">
      <section className="whatsapp-connect__card whatsapp-connect__card--success">
        <div className="whatsapp-connect__success-icon" aria-hidden="true">
          ✓
        </div>
        <h1 className="whatsapp-connect__title">{translate("whatsappSuccessTitle")}</h1>
        <p className="whatsapp-connect__subtitle">{translate("whatsappSuccessSubtitle")}</p>

        <dl className="whatsapp-connect__details whatsapp-connect__details--success">
          <div>
            <dt>{translate("whatsappSuccessBusinessName")}</dt>
            <dd>{connection.businessName || translate("configurationNotSet")}</dd>
          </div>
          <div>
            <dt>{translate("whatsappSuccessPhoneNumber")}</dt>
            <dd>{connection.displayPhoneNumber || translate("configurationNotSet")}</dd>
          </div>
          <div>
            <dt>{translate("whatsappConnectStatusLabel")}</dt>
            <dd>
              <span className="integration-status-badge integration-status-badge--connected">
                {translate("whatsappSuccessStatusConnected")}
              </span>
            </dd>
          </div>
        </dl>

        <p className="whatsapp-connect__success-message">{translate("whatsappSuccessReadyMessage")}</p>

        <div className="whatsapp-connect__actions">
          <Link
            className="whatsapp-connect__button"
            to={`${appPath("settings/integrations")}?whatsapp=connected`}
          >
            {translate("whatsappSuccessContinue")}
          </Link>
        </div>
      </section>
    </div>
  );
}
