import { Link, useLocation } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext";
import { appPath } from "../config/appRoutes";
import { resolveWhatsAppErrorKey } from "../utils/mapWhatsAppUserError";
import "./WhatsAppConnect.css";

export default function WhatsAppConnectError() {
  const { translate } = useLanguage();
  const location = useLocation();
  const messageKey = resolveWhatsAppErrorKey(location.state || {});

  return (
    <div className="whatsapp-connect whatsapp-connect--error">
      <section className="whatsapp-connect__card whatsapp-connect__card--error">
        <div className="whatsapp-connect__error-icon" aria-hidden="true">
          !
        </div>
        <h1 className="whatsapp-connect__title">{translate("whatsappErrorTitle")}</h1>
        <p className="whatsapp-connect__error-message">{translate(messageKey)}</p>

        <div className="whatsapp-connect__actions">
          <Link className="whatsapp-connect__button" to={appPath("settings/whatsapp")}>
            {translate("whatsappErrorRetry")}
          </Link>
          <Link className="whatsapp-connect__button whatsapp-connect__button--secondary" to={appPath("settings/organization")}>
            {translate("whatsappErrorReturnIntegrations")}
          </Link>
        </div>
      </section>
    </div>
  );
}
