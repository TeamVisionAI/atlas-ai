import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext";
import { useFacebookSdk } from "../hooks/useFacebookSdk";
import {
  exchangeEmbeddedSignupCode,
  getEmbeddedSignupHealth,
  getEmbeddedSignupStatus,
  MetaEmbeddedSignupError
} from "../services/metaEmbeddedSignupService";
import {
  isAllowedFacebookOrigin,
  mergeEmbeddedSignupIds,
  parseEmbeddedSignupPostMessage
} from "../utils/metaEmbeddedSignupEvents";
import "./WhatsAppConnect.css";

const CONNECTION_TYPE_LABEL = "WhatsApp Business App";
const FINISH_EVENTS = new Set(["FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING", "FINISH"]);

export default function WhatsAppConnect() {
  const { translate } = useLanguage();
  const { ready, error: sdkError, appId, configId, version } = useFacebookSdk();

  const [status, setStatus] = useState("disconnected");
  const [connection, setConnection] = useState(null);
  const [healthStatus, setHealthStatus] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [launching, setLaunching] = useState(false);

  const authorizationCodeRef = useRef(null);
  const onboardingAssetsRef = useRef({ wabaId: null, phoneNumberId: null });
  const onboardingFinishedRef = useRef(false);
  const exchangeSubmittedRef = useRef(false);

  const resetAttempt = useCallback(() => {
    authorizationCodeRef.current = null;
    onboardingAssetsRef.current = { wabaId: null, phoneNumberId: null };
    onboardingFinishedRef.current = false;
    exchangeSubmittedRef.current = false;
    setErrorMessage(null);
    setLaunching(false);
    setStatus("disconnected");
  }, []);

  const attemptCompletion = useCallback(async () => {
    const code = authorizationCodeRef.current;

    if (!code || !onboardingFinishedRef.current || exchangeSubmittedRef.current) {
      return;
    }

    exchangeSubmittedRef.current = true;
    setStatus("finalizing");
    setErrorMessage(null);

    try {
      const result = await exchangeEmbeddedSignupCode({
        code,
        wabaId: onboardingAssetsRef.current.wabaId || undefined,
        phoneNumberId: onboardingAssetsRef.current.phoneNumberId || undefined,
        onboardingType: "whatsapp_business_app"
      });

      authorizationCodeRef.current = null;
      onboardingFinishedRef.current = false;
      onboardingAssetsRef.current = { wabaId: null, phoneNumberId: null };
      setConnection(result.connection || null);
      setHealthStatus(result.connection?.healthStatus || "healthy");
      setStatus("connected");
    } catch (error) {
      console.error(error);
      exchangeSubmittedRef.current = false;
      setStatus("error");
      setErrorMessage(
        error instanceof MetaEmbeddedSignupError
          ? error.message
          : translate("whatsappConnectExchangeFailed")
      );
    } finally {
      setLaunching(false);
    }
  }, [translate]);

  const handleEmbeddedSignupEvent = useCallback(
    (parsed) => {
      if (!parsed) {
        return;
      }

      if (FINISH_EVENTS.has(parsed.event)) {
        onboardingFinishedRef.current = true;
        onboardingAssetsRef.current = mergeEmbeddedSignupIds(onboardingAssetsRef.current, parsed);

        if (authorizationCodeRef.current) {
          attemptCompletion();
        } else {
          setStatus("finalizing");
        }

        return;
      }

      if (parsed.event === "CANCEL") {
        setLaunching(false);
        setStatus("cancelled");
        setErrorMessage(translate("whatsappConnectCancelled"));
        return;
      }

      if (parsed.event === "ERROR") {
        setLaunching(false);
        setStatus("error");
        setErrorMessage(parsed.errorMessage || translate("whatsappConnectEmbeddedError"));

        if (import.meta.env.DEV) {
          console.error("[WA_EMBEDDED_SIGNUP]", parsed.raw);
        }
      }
    },
    [attemptCompletion, translate]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadStatus() {
      try {
        const payload = await getEmbeddedSignupStatus();

        if (cancelled) {
          return;
        }

        if (payload.connected && payload.connection) {
          setConnection(payload.connection);
          setStatus("connected");
          setHealthStatus(payload.connection.healthStatus || null);

          try {
            const health = await getEmbeddedSignupHealth();

            if (!cancelled) {
              setHealthStatus(health.status || payload.connection.healthStatus || null);
            }
          } catch (healthError) {
            console.error(healthError);
          }
        }
      } catch (error) {
        console.error(error);
      }
    }

    loadStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handler(event) {
      if (!isAllowedFacebookOrigin(event.origin)) {
        return;
      }

      handleEmbeddedSignupEvent(parseEmbeddedSignupPostMessage(event.data));
    }

    window.addEventListener("message", handler);

    return () => {
      window.removeEventListener("message", handler);
    };
  }, [handleEmbeddedSignupEvent]);

  const fbLoginCallback = useCallback(
    (response) => {
      const code = response?.authResponse?.code;

      if (!code) {
        setLaunching(false);
        setStatus("cancelled");
        setErrorMessage(translate("whatsappConnectAuthIncomplete"));
        return;
      }

      authorizationCodeRef.current = code;

      if (onboardingFinishedRef.current) {
        attemptCompletion();
      } else {
        setStatus("waiting_for_qr");
      }
    },
    [attemptCompletion, translate]
  );

  const launchWhatsAppSignup = useCallback(() => {
    if (launching || !ready || !window.FB || !configId) {
      return;
    }

    setLaunching(true);
    setStatus("connecting");
    setErrorMessage(null);
    authorizationCodeRef.current = null;
    onboardingAssetsRef.current = { wabaId: null, phoneNumberId: null };
    onboardingFinishedRef.current = false;
    exchangeSubmittedRef.current = false;

    window.FB.login(fbLoginCallback, {
      config_id: configId,
      response_type: "code",
      override_default_response_type: true,
      extras: {
        setup: {},
        featureType: "whatsapp_business_app_onboarding"
      }
    });
  }, [configId, fbLoginCallback, launching, ready]);

  const healthLabelKey = (() => {
    switch (healthStatus || connection?.healthStatus) {
      case "healthy":
        return "whatsappConnectStatusHealthy";
      case "degraded":
        return "whatsappConnectStatusDegraded";
      case "unhealthy":
        return "whatsappConnectStatusUnhealthy";
      case "disconnected":
        return "whatsappConnectStatusDisconnected";
      default:
        return "whatsappConnectStatusUnknown";
    }
  })();
  const isConnectDisabled =
    launching || !ready || !appId || !configId || status === "connecting" || status === "finalizing";

  return (
    <div className="whatsapp-connect">
      <header className="whatsapp-connect__header">
        <Link to="/settings" className="whatsapp-connect__back">
          ← {translate("whatsappConnectBack")}
        </Link>
      </header>

      <section className="whatsapp-connect__card">
        <h1 className="whatsapp-connect__title">{translate("whatsappConnectTitle")}</h1>
        <p className="whatsapp-connect__subtitle">{translate("whatsappConnectSubtitle")}</p>

        {!appId || !configId ? (
          <p className="whatsapp-connect__notice">{translate("whatsappConnectMissingConfig")}</p>
        ) : null}

        {sdkError ? (
          <p className="whatsapp-connect__notice">{translate("whatsappConnectSdkError")}</p>
        ) : null}

        {status === "connected" && connection ? (
          <div className="whatsapp-connect__connected">
            <h2 className="whatsapp-connect__connected-title">{translate("whatsappConnectConnectedTitle")}</h2>
            <dl className="whatsapp-connect__details">
              <div>
                <dt>{translate("whatsappConnectPhoneNumberId")}</dt>
                <dd>{connection.phoneNumberId}</dd>
              </div>
              <div>
                <dt>{translate("whatsappConnectWabaId")}</dt>
                <dd>{connection.wabaId}</dd>
              </div>
              {connection.displayPhoneNumber ? (
                <div>
                  <dt>{translate("whatsappConnectDisplayPhone")}</dt>
                  <dd>{connection.displayPhoneNumber}</dd>
                </div>
              ) : null}
              <div>
                <dt>{translate("whatsappConnectConnectionType")}</dt>
                <dd>{CONNECTION_TYPE_LABEL}</dd>
              </div>
              <div>
                <dt>{translate("whatsappConnectStatusLabel")}</dt>
                <dd>{translate(healthLabelKey)}</dd>
              </div>
            </dl>
          </div>
        ) : (
          <>
            <button
              type="button"
              className="whatsapp-connect__button"
              onClick={launchWhatsAppSignup}
              disabled={isConnectDisabled}
            >
              {launching || status === "connecting" || status === "finalizing"
                ? translate("whatsappConnectButtonLoading")
                : translate("whatsappConnectButton")}
            </button>

            {status === "waiting_for_qr" ? (
              <p className="whatsapp-connect__status">{translate("whatsappConnectWaitingQr")}</p>
            ) : null}

            {status === "finalizing" ? (
              <p className="whatsapp-connect__status">{translate("whatsappConnectFinalizing")}</p>
            ) : null}
          </>
        )}

        {errorMessage ? <p className="whatsapp-connect__error">{errorMessage}</p> : null}

        {status === "cancelled" || status === "error" ? (
          <button type="button" className="whatsapp-connect__retry" onClick={resetAttempt}>
            {translate("whatsappConnectRetry")}
          </button>
        ) : null}

        <p className="whatsapp-connect__hint">
          {translate("whatsappConnectTestNumberHint")}
        </p>
        <p className="whatsapp-connect__meta-version">
          Meta SDK {version} · App ID {appId ? `${String(appId).slice(0, 4)}…` : "—"}
        </p>
      </section>
    </div>
  );
}
