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
  parseEmbeddedSignupPostMessage
} from "../utils/metaEmbeddedSignupEvents";
import { buildWhatsAppErrorNavigationState } from "../utils/mapWhatsAppUserError";
import {
  COMPLETION_EXTENSION_MS,
  COMPLETION_TIMEOUT_MS,
  applyFinishPayload,
  applyOAuthCode,
  buildExchangePayload,
  createEmbeddedSignupAttempt,
  markExchangeCompleted,
  markExchangeStarted,
  markTimeoutExtended,
  resolveTimeoutAction
} from "../engines/embeddedSignupHandoff";
import {
  errorEmbeddedSignupTelemetry,
  logEmbeddedSignupTelemetry,
  warnEmbeddedSignupTelemetry
} from "../utils/embeddedSignupTelemetry";
import "./WhatsAppConnect.css";

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

  /** Durable per-attempt handoff state (survives React rerenders). */
  const attemptRef = useRef(null);
  const completionTimeoutRef = useRef(null);
  const runExchangeRef = useRef(null);

  const clearCompletionTimeout = useCallback(() => {
    if (completionTimeoutRef.current != null) {
      clearTimeout(completionTimeoutRef.current);
      completionTimeoutRef.current = null;
    }
  }, []);

  const armCompletionTimeout = useCallback(
    (durationMs = COMPLETION_TIMEOUT_MS) => {
      clearCompletionTimeout();
      completionTimeoutRef.current = setTimeout(() => {
        void (async () => {
          const attempt = attemptRef.current;
          const action = resolveTimeoutAction(attempt);

          if (action === "suppress") {
            logEmbeddedSignupTelemetry("timeout_suppressed", attempt);
            return;
          }

          if (action === "exchange") {
            logEmbeddedSignupTelemetry("timeout_race_exchange", attempt);
            await runExchangeRef.current?.();
            return;
          }

          if (action === "extend") {
            attemptRef.current = markTimeoutExtended(attempt);
            warnEmbeddedSignupTelemetry("timeout_extended_partial", attemptRef.current, {
              waitingFor: attempt.oauthCode ? "finish" : "oauth_code"
            });
            armCompletionTimeout(COMPLETION_EXTENSION_MS);
            return;
          }

          try {
            const payload = await getEmbeddedSignupStatus();
            if (payload?.connected && payload.connection) {
              logEmbeddedSignupTelemetry("timeout_reconcile_connected", attempt);
              navigate(appPath("settings/whatsapp/success"), {
                replace: true,
                state: { connection: payload.connection }
              });
              return;
            }
          } catch (error) {
            warnEmbeddedSignupTelemetry("timeout_reconcile_failed", attempt, {
              message: error?.message || "status_failed"
            });
          }

          warnEmbeddedSignupTelemetry("timeout_incomplete", attempt, {
            reason: "missing_required_handoff_events"
          });
          navigateToError(navigate, { errorKey: "TIMEOUT" });
        })();
      }, durationMs);
    },
    [clearCompletionTimeout, navigate]
  );

  const runExchange = useCallback(async () => {
    const attempt = attemptRef.current;
    if (!attempt?.oauthCode || !attempt?.wabaId) {
      return;
    }

    const started = markExchangeStarted(attempt);
    if (!started.started) {
      return;
    }
    attemptRef.current = started.attempt;

    clearCompletionTimeout();
    setStatus("finalizing");
    setLaunching(true);

    const payload = buildExchangePayload(
      attemptRef.current,
      `${window.location.origin}${window.location.pathname}`
    );

    logEmbeddedSignupTelemetry("exchange_triggered", attemptRef.current, {
      hasRedirectUri: Boolean(payload?.redirectUri)
    });

    try {
      const result = await exchangeEmbeddedSignupCode(payload);
      attemptRef.current = markExchangeCompleted(attemptRef.current);
      setLaunching(false);
      logEmbeddedSignupTelemetry("exchange_success", attemptRef.current);
      navigate(appPath("settings/whatsapp/success"), {
        replace: true,
        state: { connection: result.connection || null }
      });
    } catch (error) {
      errorEmbeddedSignupTelemetry("exchange_failure", attemptRef.current, {
        stage:
          error instanceof MetaEmbeddedSignupError
            ? error.payload?.stage || error.payload?.error || "EXCHANGE"
            : "EXCHANGE"
      });
      // Allow a single retry if Meta re-delivers events with a fresh code
      attemptRef.current = {
        ...attemptRef.current,
        exchangeStarted: false
      };
      setLaunching(false);

      const errPayload = error instanceof MetaEmbeddedSignupError ? error.payload || {} : {};
      navigateToError(navigate, {
        message: error instanceof MetaEmbeddedSignupError ? error.message : "",
        stage: errPayload.stage || errPayload.error || "",
        code: errPayload.error || errPayload.publicCode || ""
      });
    }
  }, [clearCompletionTimeout, navigate]);

  runExchangeRef.current = runExchange;

  const maybeExchange = useCallback(
    (shouldExchange, waitingFor) => {
      if (waitingFor) {
        logEmbeddedSignupTelemetry("waiting_for_counterpart", attemptRef.current, {
          waitingFor
        });
        if (waitingFor === "oauth_code") {
          setLaunching(true);
          setStatus("waiting_for_qr");
        }
      }
      if (shouldExchange) {
        void runExchange();
      }
    },
    [runExchange]
  );

  const ingestOAuthCode = useCallback(
    (code) => {
      const attempt = attemptRef.current || createEmbeddedSignupAttempt();
      if (!attemptRef.current) {
        attemptRef.current = attempt;
      }

      const result = applyOAuthCode(attemptRef.current, code);
      attemptRef.current = result.attempt;

      if (result.ignored) {
        return;
      }

      logEmbeddedSignupTelemetry("oauth_code_received", attemptRef.current);
      maybeExchange(result.shouldExchange, result.waitingFor);
    },
    [maybeExchange]
  );

  const ingestFinishEvent = useCallback(
    (parsed) => {
      if (!parsed) {
        return;
      }

      if (parsed.event === "CANCEL") {
        warnEmbeddedSignupTelemetry("meta_cancel", attemptRef.current);
        navigateToError(navigate, { errorKey: "CANCELLED" });
        return;
      }

      if (parsed.event === "ERROR") {
        errorEmbeddedSignupTelemetry("meta_error", attemptRef.current);
        navigateToError(navigate, { errorKey: "EXCHANGE" });
        return;
      }

      const attempt = attemptRef.current || createEmbeddedSignupAttempt();
      if (!attemptRef.current) {
        attemptRef.current = attempt;
      }

      const result = applyFinishPayload(attemptRef.current, parsed);
      attemptRef.current = result.attempt;

      if (result.ignored) {
        return;
      }

      logEmbeddedSignupTelemetry("finish_received", attemptRef.current, {
        event: parsed.event || null
      });
      maybeExchange(result.shouldExchange, result.waitingFor);
    },
    [maybeExchange, navigate]
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
      } catch {
        // Non-fatal preload
      }
    }

    loadStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  // Stable message listener — does not tear down when exchange callbacks change.
  useEffect(() => {
    function handler(event) {
      if (!isAllowedFacebookOrigin(event.origin)) {
        return;
      }

      const parsed = parseEmbeddedSignupPostMessage(event.data);
      if (!parsed) {
        return;
      }

      ingestFinishEvent(parsed);
    }

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [ingestFinishEvent]);

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

      ingestOAuthCode(code);
    },
    [ingestOAuthCode, navigate]
  );

  // Keep latest FB callback on a ref so launch always uses current ingest path.
  const fbLoginCallbackRef = useRef(fbLoginCallback);
  fbLoginCallbackRef.current = fbLoginCallback;

  const launchWhatsAppSignup = useCallback(() => {
    if (launching || !ready || !window.FB || !configId) {
      return;
    }

    clearCompletionTimeout();
    const attempt = createEmbeddedSignupAttempt();
    attemptRef.current = attempt;
    setLaunching(true);
    setStatus("connecting");
    armCompletionTimeout();
    logEmbeddedSignupTelemetry("attempt_started", attempt, {
      origin: typeof window !== "undefined" ? window.location.origin : null
    });

    window.FB.login((response) => fbLoginCallbackRef.current(response), {
      config_id: configId,
      response_type: "code",
      override_default_response_type: true,
      extras: {
        setup: {},
        featureType: "whatsapp_business_app_onboarding",
        sessionInfoVersion: "3"
      }
    });
  }, [armCompletionTimeout, clearCompletionTimeout, configId, launching, ready]);

  const isConnectDisabled =
    launching || !ready || !appId || !configId || status === "connecting" || status === "finalizing";
  const configurationMissing = !appId || !configId;

  return (
    <div className="whatsapp-connect">
      <header className="whatsapp-connect__header">
        <Link to={appPath("settings/integrations")} className="whatsapp-connect__back">
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
            <Link
              className="whatsapp-connect__button whatsapp-connect__button--secondary"
              to={appPath("settings/integrations")}
            >
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
