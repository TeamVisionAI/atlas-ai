import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { appPath } from "../config/appRoutes";
import { useFacebookSdk } from "../hooks/useFacebookSdk";
import {
  exchangeEmbeddedSignupCode,
  getEmbeddedSignupStatus,
  MetaEmbeddedSignupError,
  verifyEmbeddedSignupConnected
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
  armHandoffTimeoutDeadline,
  buildExchangePayload,
  clearPersistedHandoffAttempt,
  createEmbeddedSignupAttempt,
  describePartialHandoffTimeout,
  isHandoffAttemptExpired,
  isPartialHandoffTimeout,
  markExchangeCompleted,
  markExchangeStarted,
  markTimeoutExtended,
  persistHandoffAttempt,
  restoreHandoffAttempt,
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
  const { user } = useWorkspace();
  const navigate = useNavigate();
  const { ready, error: sdkError, appId, configId } = useFacebookSdk();

  const personalWhatsAppEnabled =
    user?.capabilities?.personalWhatsAppEnabled === true ||
    user?.agent_capabilities?.personalWhatsAppEnabled === true;

  useEffect(() => {
    if (user && !personalWhatsAppEnabled) {
      navigate(appPath("settings/integrations"), { replace: true });
    }
  }, [user, personalWhatsAppEnabled, navigate]);

  const [status, setStatus] = useState("disconnected");
  const [alreadyConnected, setAlreadyConnected] = useState(false);
  const [launching, setLaunching] = useState(false);

  const attemptRef = useRef(null);
  const completionTimeoutRef = useRef(null);
  const runExchangeRef = useRef(null);
  const armCompletionTimeoutRef = useRef(null);
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  const commitAttempt = useCallback((attempt) => {
    attemptRef.current = attempt;
    if (attempt && !attempt.exchangeCompleted) {
      persistHandoffAttempt(attempt);
    }
    return attempt;
  }, []);

  const clearCompletionTimeout = useCallback(() => {
    if (completionTimeoutRef.current != null) {
      clearTimeout(completionTimeoutRef.current);
      completionTimeoutRef.current = null;
    }
  }, []);

  const finalizeHandoffFailure = useCallback(
    (attempt, errorKey, extra = {}) => {
      clearCompletionTimeout();
      clearPersistedHandoffAttempt();
      attemptRef.current = null;
      setLaunching(false);
      setStatus("disconnected");
      navigateToError(navigateRef.current, { errorKey, ...extra });
    },
    [clearCompletionTimeout]
  );

  const handleHandoffTimeout = useCallback(async () => {
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
      attemptRef.current = commitAttempt(markTimeoutExtended(attempt));
      warnEmbeddedSignupTelemetry("timeout_extended_partial", attemptRef.current, {
        waitingFor: attempt.oauthCode ? "finish" : "oauth_code"
      });
      armCompletionTimeoutRef.current?.(COMPLETION_EXTENSION_MS);
      return;
    }

    if (isPartialHandoffTimeout(attempt)) {
      warnEmbeddedSignupTelemetry("timeout_incomplete", attempt, {
        reason: describePartialHandoffTimeout(attempt)
      });
      finalizeHandoffFailure(attempt, "PARTIAL_HANDOFF");
      return;
    }

    warnEmbeddedSignupTelemetry("timeout_incomplete", attempt, {
      reason: "missing_required_handoff_events"
    });
    finalizeHandoffFailure(attempt, "TIMEOUT");
  }, [commitAttempt, finalizeHandoffFailure]);

  const armCompletionTimeout = useCallback(
    (durationMs = COMPLETION_TIMEOUT_MS) => {
      clearCompletionTimeout();
      if (attemptRef.current) {
        attemptRef.current = commitAttempt(
          armHandoffTimeoutDeadline(attemptRef.current, durationMs)
        );
      }
      completionTimeoutRef.current = setTimeout(() => {
        void handleHandoffTimeout();
      }, durationMs);
    },
    [clearCompletionTimeout, commitAttempt, handleHandoffTimeout]
  );

  armCompletionTimeoutRef.current = armCompletionTimeout;

  const runExchange = useCallback(async () => {
    const attempt = attemptRef.current;
    if (!attempt?.oauthCode || !attempt?.wabaId) {
      return;
    }

    const started = markExchangeStarted(attempt);
    if (!started.started) {
      return;
    }
    attemptRef.current = commitAttempt(started.attempt);

    clearCompletionTimeout();
    setStatus("finalizing");
    setLaunching(true);

    const payload = buildExchangePayload(
      attemptRef.current,
      `${window.location.origin}${window.location.pathname}`
    );

    if (!payload) {
      finalizeHandoffFailure(attemptRef.current, "PARTIAL_HANDOFF");
      return;
    }

    logEmbeddedSignupTelemetry("exchange_triggered", attemptRef.current, {
      hasRedirectUri: Boolean(payload?.redirectUri)
    });

    try {
      await exchangeEmbeddedSignupCode(payload);
      const verified = await verifyEmbeddedSignupConnected();

      if (!verified.verified) {
        errorEmbeddedSignupTelemetry("status_verify_failed", attemptRef.current, {
          reason: verified.reason || "status_disconnected"
        });
        attemptRef.current = commitAttempt({
          ...attemptRef.current,
          exchangeStarted: false
        });
        finalizeHandoffFailure(attemptRef.current, "STATUS_VERIFY_FAILED");
        return;
      }

      attemptRef.current = commitAttempt(markExchangeCompleted(attemptRef.current));
      clearPersistedHandoffAttempt();
      setLaunching(false);
      logEmbeddedSignupTelemetry("status_verified", attemptRef.current);
      navigate(appPath("settings/whatsapp/success"), {
        replace: true,
        state: { connection: verified.connection }
      });
    } catch (error) {
      errorEmbeddedSignupTelemetry("exchange_failure", attemptRef.current, {
        stage:
          error instanceof MetaEmbeddedSignupError
            ? error.payload?.stage || error.payload?.error || "EXCHANGE"
            : "EXCHANGE"
      });
      attemptRef.current = commitAttempt({
        ...attemptRef.current,
        exchangeStarted: false
      });
      setLaunching(false);

      const errPayload = error instanceof MetaEmbeddedSignupError ? error.payload || {} : {};
      finalizeHandoffFailure(attemptRef.current, undefined, {
        message: error instanceof MetaEmbeddedSignupError ? error.message : "",
        stage: errPayload.stage || errPayload.error || "",
        code: errPayload.error || errPayload.publicCode || ""
      });
    }
  }, [clearCompletionTimeout, commitAttempt, finalizeHandoffFailure, navigate]);

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
        if (waitingFor === "finish") {
          setLaunching(true);
          setStatus("connecting");
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
        attemptRef.current = commitAttempt(attempt);
      }

      const result = applyOAuthCode(attemptRef.current, code);
      attemptRef.current = commitAttempt(result.attempt);

      if (result.ignored) {
        return;
      }

      logEmbeddedSignupTelemetry("oauth_code_received", attemptRef.current);
      maybeExchange(result.shouldExchange, result.waitingFor);
    },
    [commitAttempt, maybeExchange]
  );

  const ingestFinishEvent = useCallback(
    (parsed) => {
      if (!parsed) {
        return;
      }

      if (parsed.event === "CANCEL") {
        warnEmbeddedSignupTelemetry("meta_cancel", attemptRef.current);
        finalizeHandoffFailure(attemptRef.current, "CANCELLED");
        return;
      }

      if (parsed.event === "ERROR") {
        errorEmbeddedSignupTelemetry("meta_error", attemptRef.current);
        finalizeHandoffFailure(attemptRef.current, "EXCHANGE");
        return;
      }

      const attempt = attemptRef.current || createEmbeddedSignupAttempt();
      if (!attemptRef.current) {
        attemptRef.current = commitAttempt(attempt);
      }

      const result = applyFinishPayload(attemptRef.current, parsed);
      attemptRef.current = commitAttempt(result.attempt);

      if (result.ignored) {
        return;
      }

      logEmbeddedSignupTelemetry("finish_received", attemptRef.current, {
        event: parsed.event || null
      });
      maybeExchange(result.shouldExchange, result.waitingFor);
    },
    [commitAttempt, finalizeHandoffFailure, maybeExchange]
  );

  const resumePersistedHandoff = useCallback(() => {
    const restored = restoreHandoffAttempt();
    if (!restored) {
      return;
    }

    if (isHandoffAttemptExpired(restored)) {
      clearPersistedHandoffAttempt();
      if (isPartialHandoffTimeout(restored)) {
        warnEmbeddedSignupTelemetry("timeout_incomplete", restored, {
          reason: describePartialHandoffTimeout(restored)
        });
        finalizeHandoffFailure(restored, "PARTIAL_HANDOFF");
      }
      return;
    }

    attemptRef.current = commitAttempt(restored);
    setLaunching(true);
    setStatus(restored.oauthCode && !restored.wabaId ? "waiting_for_qr" : "connecting");

    const remaining = restored.timeoutDeadlineAt
      ? Math.max(restored.timeoutDeadlineAt - Date.now(), 0)
      : COMPLETION_TIMEOUT_MS;

    if (restored.oauthCode && restored.wabaId && !restored.exchangeStarted) {
      armCompletionTimeout(Math.max(remaining, 5_000));
      void runExchange();
      return;
    }

    armCompletionTimeout(Math.max(remaining, 1_000));
  }, [armCompletionTimeout, commitAttempt, finalizeHandoffFailure, runExchange]);

  useEffect(() => {
    resumePersistedHandoff();
  }, [resumePersistedHandoff]);

  useEffect(() => {
    function onPageShow() {
      resumePersistedHandoff();
    }

    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [resumePersistedHandoff]);

  useEffect(() => {
    let cancelled = false;

    async function loadStatus() {
      try {
        const payload = await getEmbeddedSignupStatus();

        if (!cancelled && payload.connected && payload.connection) {
          setAlreadyConnected(true);
          setStatus("connected");
          clearPersistedHandoffAttempt();
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
          finalizeHandoffFailure(attemptRef.current, "CANCELLED");
          return;
        }

        finalizeHandoffFailure(attemptRef.current, "PERMISSIONS");
        return;
      }

      ingestOAuthCode(code);
    },
    [finalizeHandoffFailure, ingestOAuthCode]
  );

  const fbLoginCallbackRef = useRef(fbLoginCallback);
  fbLoginCallbackRef.current = fbLoginCallback;

  const launchWhatsAppSignup = useCallback(() => {
    if (launching || !ready || !window.FB || !configId) {
      return;
    }

    clearCompletionTimeout();
    const attempt = armHandoffTimeoutDeadline(createEmbeddedSignupAttempt());
    attemptRef.current = commitAttempt(attempt);
    setLaunching(true);
    setStatus("connecting");
    armCompletionTimeout();
    logEmbeddedSignupTelemetry("attempt_started", attemptRef.current, {
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
  }, [
    armCompletionTimeout,
    clearCompletionTimeout,
    commitAttempt,
    configId,
    launching,
    ready
  ]);

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
