import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext";
import { appPath } from "../config/appRoutes";
import { useFacebookSdk } from "../hooks/useFacebookSdk";
import {
  exchangeEmbeddedSignupCode,
  getEmbeddedSignupStatus,
  MetaEmbeddedSignupError
} from "../services/metaEmbeddedSignupService";
import {
  isAllowedFacebookOrigin,
  mergeEmbeddedSignupIds,
  parseEmbeddedSignupPostMessage
} from "../utils/metaEmbeddedSignupEvents";
import { buildWhatsAppErrorNavigationState } from "../utils/mapWhatsAppUserError";
import { whatsAppConnectDebug } from "../utils/whatsappConnectDebug";
import "./WhatsAppConnect.css";

const FINISH_EVENTS = new Set([
  "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
  "FINISH",
  "FINISH_ONLY_WABA",
  "FINISH_GRANT_ONLY_API_ACCESS"
]);
const COMPLETION_TIMEOUT_MS = 60_000;

function navigateToError(navigate, details) {
  navigate(appPath("settings/whatsapp/error"), {
    replace: true,
    state: buildWhatsAppErrorNavigationState(details)
  });
}

export default function WhatsAppConnect() {
  const { translate } = useLanguage();
  const navigate = useNavigate();
  const { ready, error: sdkError, appId, configId } = useFacebookSdk();

  const [status, setStatus] = useState("disconnected");
  const [alreadyConnected, setAlreadyConnected] = useState(false);
  const [launching, setLaunching] = useState(false);

  const authorizationCodeRef = useRef(null);
  const onboardingAssetsRef = useRef({ wabaId: null, phoneNumberId: null });
  const exchangeSubmittedRef = useRef(false);
  const exchangeInFlightRef = useRef(false);
  const completionTimeoutRef = useRef(null);

  const clearCompletionTimeout = useCallback(() => {
    if (completionTimeoutRef.current != null) {
      clearTimeout(completionTimeoutRef.current);
      completionTimeoutRef.current = null;
    }
  }, []);

  const resetAttempt = useCallback(() => {
    clearCompletionTimeout();
    authorizationCodeRef.current = null;
    onboardingAssetsRef.current = { wabaId: null, phoneNumberId: null };
    exchangeSubmittedRef.current = false;
    exchangeInFlightRef.current = false;
    setLaunching(false);
    setStatus("disconnected");
  }, [clearCompletionTimeout]);

  const armCompletionTimeout = useCallback(() => {
    clearCompletionTimeout();
    completionTimeoutRef.current = setTimeout(() => {
      if (exchangeSubmittedRef.current || exchangeInFlightRef.current) {
        return;
      }

      whatsAppConnectDebug("completion timeout");
      navigateToError(navigate, { errorKey: "TIMEOUT" });
    }, COMPLETION_TIMEOUT_MS);
  }, [clearCompletionTimeout, navigate]);

  const attemptCompletion = useCallback(async () => {
    const code = authorizationCodeRef.current;

    if (!code || exchangeSubmittedRef.current || exchangeInFlightRef.current) {
      return;
    }

    exchangeSubmittedRef.current = true;
    exchangeInFlightRef.current = true;
    clearCompletionTimeout();
    setStatus("finalizing");
    setLaunching(true);

    const payload = {
      code,
      wabaId: onboardingAssetsRef.current.wabaId || undefined,
      phoneNumberId: onboardingAssetsRef.current.phoneNumberId || undefined,
      onboardingType: "whatsapp_business_app"
    };

    try {
      const result = await exchangeEmbeddedSignupCode(payload);

      authorizationCodeRef.current = null;
      onboardingAssetsRef.current = { wabaId: null, phoneNumberId: null };
      exchangeInFlightRef.current = false;
      setLaunching(false);

      navigate(appPath("settings/whatsapp/success"), {
        replace: true,
        state: { connection: result.connection || null }
      });
    } catch (error) {
      whatsAppConnectDebug("exchange failed", error);
      exchangeSubmittedRef.current = false;
      exchangeInFlightRef.current = false;
      setLaunching(false);

      const payload = error instanceof MetaEmbeddedSignupError ? error.payload || {} : {};
      navigateToError(navigate, {
        message: error instanceof MetaEmbeddedSignupError ? error.message : "",
        stage: payload.stage || payload.error || "",
        code: payload.error || payload.publicCode || ""
      });
    }
  }, [clearCompletionTimeout, navigate]);

  const handleEmbeddedSignupEvent = useCallback(
    (parsed) => {
      if (!parsed) {
        return;
      }

      whatsAppConnectDebug("embedded signup event", parsed.event);

      if (FINISH_EVENTS.has(parsed.event)) {
        onboardingAssetsRef.current = mergeEmbeddedSignupIds(onboardingAssetsRef.current, parsed);

        if (authorizationCodeRef.current) {
          void attemptCompletion();
        } else {
          setLaunching(true);
          setStatus("waiting_for_qr");
        }

        return;
      }

      if (parsed.event === "CANCEL") {
        navigateToError(navigate, { errorKey: "CANCELLED" });
        return;
      }

      if (parsed.event === "ERROR") {
        navigateToError(navigate, { errorKey: "EXCHANGE" });
      }
    },
    [attemptCompletion, navigate]
  );

  useEffect(() => {
    return () => {
      clearCompletionTimeout();
    };
  }, [clearCompletionTimeout]);

  useEffect(() => {
    let cancelled = false;

    async function loadStatus() {
      try {
        const payload = await getEmbeddedSignupStatus();

        if (!cancelled && payload.connected && payload.connection) {
          setAlreadyConnected(true);
          setStatus("connected");
        }
      } catch (error) {
        whatsAppConnectDebug("status load failed", error);
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
    return () => window.removeEventListener("message", handler);
  }, [handleEmbeddedSignupEvent]);

  const fbLoginCallback = useCallback(
    (response) => {
      const code = response?.authResponse?.code;

      if (!code) {
        if (response?.status === "unknown") {
          navigateToError(navigate, { errorKey: "CANCELLED" });
          return;
        }

        navigateToError(navigate, { errorKey: "PERMISSIONS" });
        return;
      }

      authorizationCodeRef.current = code;
      void attemptCompletion();
    },
    [attemptCompletion, navigate]
  );

  const launchWhatsAppSignup = useCallback(() => {
    if (launching || !ready || !window.FB || !configId) {
      return;
    }

    resetAttempt();
    setLaunching(true);
    setStatus("connecting");
    armCompletionTimeout();

    window.FB.login(fbLoginCallback, {
      config_id: configId,
      response_type: "code",
      override_default_response_type: true,
      extras: {
        setup: {},
        featureType: "whatsapp_business_app_onboarding",
        sessionInfoVersion: "3"
      }
    });
  }, [armCompletionTimeout, configId, fbLoginCallback, launching, ready, resetAttempt]);

  const isConnectDisabled =
    launching || !ready || !appId || !configId || status === "connecting" || status === "finalizing";
  const configurationMissing = !appId || !configId;

  return (
    <div className="whatsapp-connect">
      <header className="whatsapp-connect__header">
        <Link to={appPath("settings/organization")} className="whatsapp-connect__back">
          ← {translate("whatsappConnectBackIntegrations")}
        </Link>
      </header>

      <section className="whatsapp-connect__card">
        <h1 className="whatsapp-connect__title">{translate("whatsappConnectTitle")}</h1>
        <p className="whatsapp-connect__subtitle">{translate("whatsappConnectSubtitle")}</p>

        {configurationMissing ? (
          <p className="whatsapp-connect__notice">{translate("whatsappConnectUnavailable")}</p>
        ) : null}

        {sdkError ? (
          <p className="whatsapp-connect__notice">{translate("whatsappConnectUnavailable")}</p>
        ) : null}

        {alreadyConnected ? (
          <div className="whatsapp-connect__connected-banner">
            <p>{translate("whatsappConnectAlreadyConnected")}</p>
            <Link className="whatsapp-connect__button whatsapp-connect__button--secondary" to={appPath("settings/organization")}>
              {translate("whatsappErrorReturnIntegrations")}
            </Link>
          </div>
        ) : null}

        {!alreadyConnected && !configurationMissing && !sdkError ? (
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
        ) : null}

        {!alreadyConnected && !configurationMissing && !sdkError ? (
          <p className="whatsapp-connect__hint">{translate("whatsappConnectHint")}</p>
        ) : null}
      </section>
    </div>
  );
}
