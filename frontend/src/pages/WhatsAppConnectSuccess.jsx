import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useLanguage } from "../i18n/LanguageContext";
import { appPath } from "../config/appRoutes";
import { verifyEmbeddedSignupConnected } from "../services/metaEmbeddedSignupService";
import { buildWhatsAppErrorNavigationState } from "../utils/mapWhatsAppUserError";
import "./WhatsAppConnect.css";

export default function WhatsAppConnectSuccess() {
  const { translate } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const [connection, setConnection] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    verifyEmbeddedSignupConnected()
      .then((verified) => {
        if (cancelled) {
          return;
        }

        if (verified.verified && verified.connection) {
          setConnection(verified.connection);
          setChecking(false);
          return;
        }

        navigate(appPath("settings/whatsapp/error"), {
          replace: true,
          state: buildWhatsAppErrorNavigationState({ errorKey: "STATUS_VERIFY_FAILED" })
        });
      })
      .catch(() => {
        if (!cancelled) {
          navigate(appPath("settings/whatsapp/error"), {
            replace: true,
            state: buildWhatsAppErrorNavigationState({ errorKey: "STATUS_VERIFY_FAILED" })
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [location.state, navigate]);

  if (checking || !connection) {
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
