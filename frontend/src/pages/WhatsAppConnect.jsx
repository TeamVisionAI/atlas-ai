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
const WA_EMBEDDED_SIGNUP_DEBUG = "[WA_EMBEDDED_SIGNUP_DEBUG]";

function debugPretty(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function debugStringify(label, value) {
  try {
    console.log(WA_EMBEDDED_SIGNUP_DEBUG, `${label} JSON.stringify`, JSON.stringify(value, null, 2));
  } catch (error) {
    console.error(WA_EMBEDDED_SIGNUP_DEBUG, `${label} JSON.stringify failed`, error);
  }
}

function logFacebookPostMessageTrace(messageNumber, data) {
  console.log(WA_EMBEDDED_SIGNUP_DEBUG, `Message #${messageNumber} raw event.data`, data);

  const dataType = typeof data;
  console.log(WA_EMBEDDED_SIGNUP_DEBUG, `Message #${messageNumber} typeof event.data`, dataType);

  if (dataType === "string") {
    try {
      const parsed = JSON.parse(data);
      console.log(WA_EMBEDDED_SIGNUP_DEBUG, `Message #${messageNumber} JSON.parse success`, parsed);
      debugStringify(`Message #${messageNumber} JSON.parse result`, parsed);
    } catch (error) {
      console.error(WA_EMBEDDED_SIGNUP_DEBUG, `Message #${messageNumber} JSON.parse failed`, error);
    }
    return;
  }

  if (dataType === "object" && data !== null) {
    console.log(WA_EMBEDDED_SIGNUP_DEBUG, `Message #${messageNumber} Object.keys(event.data)`, Object.keys(data));
    debugStringify(`Message #${messageNumber} event.data object`, data);
  }
}

const FACEBOOK_POST_MESSAGE_VERBOSE_MS = 30_000;

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
  const prevStatusRef = useRef(status);
  const facebookPostMessageCountRef = useRef(0);
  const facebookPostMessageVerboseUntilRef = useRef(0);

  const logCoordinatorState = useCallback((phase) => {
    console.log(WA_EMBEDDED_SIGNUP_DEBUG, `Coordinator snapshot [${phase}]`, {
      uiStatus: status,
      authorizationCodePresent: Boolean(authorizationCodeRef.current),
      authorizationCodeLength: authorizationCodeRef.current?.length ?? 0,
      onboardingFinished: onboardingFinishedRef.current,
      onboardingAssets: { ...onboardingAssetsRef.current },
      exchangeSubmitted: exchangeSubmittedRef.current,
      completionGate: {
        hasAuthorizationCode: Boolean(authorizationCodeRef.current),
        hasOnboardingFinished: onboardingFinishedRef.current,
        notExchangeSubmitted: !exchangeSubmittedRef.current,
        wouldAttemptCompletion:
          Boolean(authorizationCodeRef.current) &&
          onboardingFinishedRef.current &&
          !exchangeSubmittedRef.current
      }
    });
  }, [status]);

  useEffect(() => {
    if (prevStatusRef.current !== status) {
      console.log(WA_EMBEDDED_SIGNUP_DEBUG, "State transition", {
        from: prevStatusRef.current,
        to: status
      });
      prevStatusRef.current = status;
    }
  }, [status]);

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
      console.log(WA_EMBEDDED_SIGNUP_DEBUG, "attemptCompletion skipped (gate not satisfied)", {
        hasAuthorizationCode: Boolean(code),
        onboardingFinished: onboardingFinishedRef.current,
        exchangeSubmitted: exchangeSubmittedRef.current
      });
      logCoordinatorState("attemptCompletion skipped");
      return;
    }

    console.log(WA_EMBEDDED_SIGNUP_DEBUG, "attemptCompletion proceeding");
    logCoordinatorState("attemptCompletion start");

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
      console.error(WA_EMBEDDED_SIGNUP_DEBUG, "attemptCompletion catch block", error);
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
  }, [translate, logCoordinatorState]);

  const handleEmbeddedSignupEvent = useCallback(
    (parsed, rawData) => {
      if (!parsed) {
        console.log(WA_EMBEDDED_SIGNUP_DEBUG, "handleEmbeddedSignupEvent ignored (parse returned null)", {
          rawDataPretty: debugPretty(rawData)
        });
        return;
      }

      console.log(WA_EMBEDDED_SIGNUP_DEBUG, "handleEmbeddedSignupEvent", {
        event: parsed.event,
        wabaId: parsed.wabaId,
        phoneNumberId: parsed.phoneNumberId,
        rawPretty: debugPretty(parsed.raw)
      });

      if (FINISH_EVENTS.has(parsed.event)) {
        console.log(WA_EMBEDDED_SIGNUP_DEBUG, "FINISH event received", parsed.event);
        onboardingFinishedRef.current = true;
        onboardingAssetsRef.current = mergeEmbeddedSignupIds(onboardingAssetsRef.current, parsed);
        logCoordinatorState("after FINISH event");

        if (authorizationCodeRef.current) {
          attemptCompletion();
        } else {
          console.log(WA_EMBEDDED_SIGNUP_DEBUG, "FINISH received but authorization code not yet stored");
          setStatus("finalizing");
        }

        return;
      }

      if (parsed.event === "CANCEL") {
        console.log(WA_EMBEDDED_SIGNUP_DEBUG, "CANCEL event received");
        setLaunching(false);
        setStatus("cancelled");
        setErrorMessage(translate("whatsappConnectCancelled"));
        return;
      }

      if (parsed.event === "ERROR") {
        console.log(WA_EMBEDDED_SIGNUP_DEBUG, "ERROR event received", {
          errorMessage: parsed.errorMessage,
          rawPretty: debugPretty(parsed.raw)
        });
        setLaunching(false);
        setStatus("error");
        setErrorMessage(parsed.errorMessage || translate("whatsappConnectEmbeddedError"));

        if (import.meta.env.DEV) {
          console.error("[WA_EMBEDDED_SIGNUP]", parsed.raw);
        }
        return;
      }

      console.log(WA_EMBEDDED_SIGNUP_DEBUG, "handleEmbeddedSignupEvent unhandled event type", parsed.event);
    },
    [attemptCompletion, translate, logCoordinatorState]
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
            console.error(WA_EMBEDDED_SIGNUP_DEBUG, "loadStatus health catch block", healthError);
          }
        }
      } catch (error) {
        console.error(WA_EMBEDDED_SIGNUP_DEBUG, "loadStatus catch block", error);
      }
    }

    loadStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handler(event) {
      if (isAllowedFacebookOrigin(event.origin)) {
        const withinVerboseWindow = Date.now() <= facebookPostMessageVerboseUntilRef.current;

        if (withinVerboseWindow) {
          facebookPostMessageCountRef.current += 1;
          const messageNumber = facebookPostMessageCountRef.current;

          console.log(WA_EMBEDDED_SIGNUP_DEBUG, `Facebook postMessage Message #${messageNumber}`, {
            origin: event.origin,
            verboseWindowEndsAt: new Date(facebookPostMessageVerboseUntilRef.current).toISOString()
          });
          logFacebookPostMessageTrace(messageNumber, event.data);
        }
      }

      if (!isAllowedFacebookOrigin(event.origin)) {
        return;
      }

      const parsed = parseEmbeddedSignupPostMessage(event.data);
      console.log(WA_EMBEDDED_SIGNUP_DEBUG, "parseEmbeddedSignupPostMessage result", parsed);
      debugStringify("parsedEvent", parsed);

      handleEmbeddedSignupEvent(parsed, event.data);
    }

    window.addEventListener("message", handler);

    return () => {
      window.removeEventListener("message", handler);
    };
  }, [handleEmbeddedSignupEvent]);

  const fbLoginCallback = useCallback(
    (response) => {
      console.log(WA_EMBEDDED_SIGNUP_DEBUG, "FB.login callback (full response)", response);
      console.log(WA_EMBEDDED_SIGNUP_DEBUG, "FB.login callback (pretty)", debugPretty(response));
      debugStringify("response", response);
      console.log(WA_EMBEDDED_SIGNUP_DEBUG, "FB.login authResponse (full)", response?.authResponse ?? null);
      console.log(WA_EMBEDDED_SIGNUP_DEBUG, "FB.login authResponse (pretty)", debugPretty(response?.authResponse ?? null));
      debugStringify("authResponse", response?.authResponse ?? null);
      console.log(
        WA_EMBEDDED_SIGNUP_DEBUG,
        "FB.login authResponse keys",
        response?.authResponse ? Object.keys(response.authResponse) : null
      );

      const code = response?.authResponse?.code;

      console.log(WA_EMBEDDED_SIGNUP_DEBUG, "Authorization code extracted from authResponse", {
        codePresent: Boolean(code),
        codeLength: code?.length ?? 0,
        fbLoginStatus: response?.status ?? null
      });

      if (!code) {
        console.log(WA_EMBEDDED_SIGNUP_DEBUG, "No authorization code in authResponse — treating as auth incomplete");
        logCoordinatorState("FB.login without code");
        setLaunching(false);
        setStatus("cancelled");
        setErrorMessage(translate("whatsappConnectAuthIncomplete"));
        return;
      }

      authorizationCodeRef.current = code;
      logCoordinatorState("after authorization code stored");

      if (onboardingFinishedRef.current) {
        console.log(WA_EMBEDDED_SIGNUP_DEBUG, "Authorization code stored and FINISH already received — calling attemptCompletion");
        attemptCompletion();
      } else {
        console.log(
          WA_EMBEDDED_SIGNUP_DEBUG,
          "Authorization code stored — waiting for FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING or FINISH postMessage"
        );
        setStatus("waiting_for_qr");
        logCoordinatorState("waiting for FINISH event");
      }
    },
    [attemptCompletion, translate, logCoordinatorState]
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

    console.log(WA_EMBEDDED_SIGNUP_DEBUG, "launchWhatsAppSignup reset coordinator state");
    logCoordinatorState("launchWhatsAppSignup start");

    const loginOptions = {
      config_id: configId,
      response_type: "code",
      override_default_response_type: true,
      extras: {
        setup: {},
        featureType: "whatsapp_business_app_onboarding",
        sessionInfoVersion: "3"
      }
    };

    console.log(WA_EMBEDDED_SIGNUP_DEBUG, "Immediately before FB.login()", loginOptions);

    facebookPostMessageCountRef.current = 0;
    facebookPostMessageVerboseUntilRef.current = Date.now() + FACEBOOK_POST_MESSAGE_VERBOSE_MS;
    console.log(WA_EMBEDDED_SIGNUP_DEBUG, "Facebook postMessage trace armed for 30s after FB.login", {
      verboseUntil: new Date(facebookPostMessageVerboseUntilRef.current).toISOString()
    });

    window.FB.login(fbLoginCallback, loginOptions);
  }, [configId, fbLoginCallback, launching, ready, logCoordinatorState]);

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
