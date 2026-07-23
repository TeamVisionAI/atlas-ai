import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import OnboardingLayout, { OnboardingButton, OnboardingError } from "../../components/onboarding/OnboardingLayout";
import { useFacebookSdk } from "../../hooks/useFacebookSdk";
import { useAuth } from "../../contexts/AuthContext";
import { completeMetaOnboarding } from "../../services/onboardingService";
import {
  attachWhatsAppEmbeddedSignupAssets,
  exchangeEmbeddedSignupCode,
  getEmbeddedSignupStatus,
  MetaEmbeddedSignupError
} from "../../services/metaEmbeddedSignupService";
import {
  isAllowedFacebookOrigin,
  mergeEmbeddedSignupIds,
  parseEmbeddedSignupPostMessage
} from "../../utils/metaEmbeddedSignupEvents";

const FINISH_EVENTS = new Set(["FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING", "FINISH"]);
const COMPLETION_TIMEOUT_MS = 20_000;
const META_ONBOARDING_DEBUG = "[META_ONBOARDING]";
const META_LOG_PREFIX = "[META]";

function buildOfficialLoginOptions(configId) {
  return {
    config_id: configId,
    response_type: "code",
    override_default_response_type: true,
    extras: {
      setup: {}
    }
  };
}

async function fingerprintAuthorizationCode(code) {
  const data = new TextEncoder().encode(code);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

function sanitizeAuthResponseForLog(authResponse) {
  if (!authResponse) {
    return null;
  }

  return {
    ...authResponse,
    code: authResponse.code ? `[present len=${authResponse.code.length}]` : undefined,
    accessToken: authResponse.accessToken
      ? `[present len=${authResponse.accessToken.length}]`
      : undefined
  };
}

function sanitizeLoginResponseForLog(response) {
  if (!response) {
    return null;
  }

  return {
    ...response,
    authResponse: sanitizeAuthResponseForLog(response.authResponse)
  };
}

function describeMissingSignals(hasAuthorizationCode) {
  if (!hasAuthorizationCode) {
    return "Meta did not return an authorization code. Please try again.";
  }

  return "Meta connection timed out before Atlas could finish setup. Please try again.";
}

function logMetaChannels(channels = {}) {
  if (channels.facebook === "connected") {
    console.log(META_LOG_PREFIX, "Facebook connected");
  }

  if (channels.messenger === "connected") {
    console.log(META_LOG_PREFIX, "Messenger connected");
  }

  if (channels.whatsapp === "connected") {
    console.log(META_LOG_PREFIX, "WhatsApp connected");
  } else if (channels.whatsapp === "pending") {
    console.log(META_LOG_PREFIX, "WhatsApp pending");
  }
}

export default function ConnectMetaPage() {
  const navigate = useNavigate();
  const { onboarding, refresh } = useAuth();
  const { ready, error: sdkError, appId, configId } = useFacebookSdk();
  const [error, setError] = useState("");
  const [launching, setLaunching] = useState(false);
  const [connected, setConnected] = useState(onboarding?.integrations?.meta?.connected || false);

  const authorizationCodeRef = useRef(null);
  const codeIssuedAtRef = useRef(null);
  const codeFingerprintRef = useRef(null);
  const submittedCodeFingerprintRef = useRef(null);
  const exchangeInFlightRef = useRef(false);
  const connectMetaInProgressRef = useRef(false);
  const onboardingAssetsRef = useRef({ wabaId: null, phoneNumberId: null });
  const onboardingFinishedRef = useRef(false);
  const exchangeSubmittedRef = useRef(false);
  const whatsappAttachedRef = useRef(false);
  const completionTimeoutRef = useRef(null);

  const logCoordinatorState = useCallback((phase) => {
    console.log(META_ONBOARDING_DEBUG, phase, {
      hasAuthorizationCode: Boolean(authorizationCodeRef.current),
      hasFinishEvent: onboardingFinishedRef.current,
      exchangeSubmitted: exchangeSubmittedRef.current,
      whatsappAttached: whatsappAttachedRef.current
    });
  }, []);

  const clearCompletionTimeout = useCallback(() => {
    if (completionTimeoutRef.current != null) {
      clearTimeout(completionTimeoutRef.current);
      completionTimeoutRef.current = null;
    }
  }, []);

  const armCompletionTimeout = useCallback(() => {
    clearCompletionTimeout();

    completionTimeoutRef.current = setTimeout(() => {
      completionTimeoutRef.current = null;

      if (exchangeSubmittedRef.current) {
        return;
      }

      const hasAuthorizationCode = Boolean(authorizationCodeRef.current);

      if (hasAuthorizationCode) {
        return;
      }

      logCoordinatorState("completion timeout");
      setLaunching(false);
      setError(describeMissingSignals(hasAuthorizationCode));
    }, COMPLETION_TIMEOUT_MS);
  }, [clearCompletionTimeout, logCoordinatorState]);

  useEffect(() => {
    return () => {
      clearCompletionTimeout();
    };
  }, [clearCompletionTimeout]);

  useEffect(() => {
    getEmbeddedSignupStatus()
      .then((status) => setConnected(Boolean(status?.connected || status?.platform)))
      .catch(() => {
        // ignore status errors during onboarding
      });
  }, []);

  const finishMetaOnboarding = useCallback(
    async (channels = {}) => {
      await completeMetaOnboarding({
        whatsappStatus: channels.whatsapp || "pending"
      });
      await refresh();
      setConnected(true);
      navigate("/onboarding/calendar");
    },
    [navigate, refresh]
  );

  const attachWhatsAppIfReady = useCallback(async () => {
    const { wabaId, phoneNumberId } = onboardingAssetsRef.current;

    if (!wabaId || !phoneNumberId || whatsappAttachedRef.current) {
      return null;
    }

    whatsappAttachedRef.current = true;

    try {
      const result = await attachWhatsAppEmbeddedSignupAssets({
        wabaId,
        phoneNumberId,
        onboardingType: "whatsapp_business_app"
      });
      logMetaChannels(result.channels);
      return result;
    } catch (attachError) {
      whatsappAttachedRef.current = false;
      throw attachError;
    }
  }, []);

  const attemptCompletion = useCallback(async () => {
    const hasAuthorizationCode = Boolean(authorizationCodeRef.current);
    const activeFingerprint = codeFingerprintRef.current;

    if (
      !hasAuthorizationCode ||
      exchangeSubmittedRef.current ||
      exchangeInFlightRef.current ||
      (activeFingerprint && submittedCodeFingerprintRef.current === activeFingerprint)
    ) {
      console.log(META_ONBOARDING_DEBUG, "attemptCompletion skipped", {
        hasAuthorizationCode,
        hasFinishEvent: onboardingFinishedRef.current,
        exchangeSubmitted: exchangeSubmittedRef.current,
        exchangeInFlight: exchangeInFlightRef.current,
        activeFingerprint,
        submittedCodeFingerprint: submittedCodeFingerprintRef.current
      });
      return;
    }

    exchangeSubmittedRef.current = true;
    exchangeInFlightRef.current = true;
    submittedCodeFingerprintRef.current = activeFingerprint;
    clearCompletionTimeout();
    setLaunching(true);
    setError("");

    console.log(META_ONBOARDING_DEBUG, "attemptCompletion starting exchange", {
      timestamp: new Date().toISOString(),
      codeLength: authorizationCodeRef.current.length,
      codeFingerprint: activeFingerprint,
      codeIssuedAt: codeIssuedAtRef.current
        ? new Date(codeIssuedAtRef.current).toISOString()
        : null,
      elapsedSinceCodeIssuedMs:
        codeIssuedAtRef.current != null ? Date.now() - codeIssuedAtRef.current : null
    });

    try {
      const result = await exchangeEmbeddedSignupCode({
        code: authorizationCodeRef.current,
        codeIssuedAt: codeIssuedAtRef.current || undefined,
        wabaId: onboardingAssetsRef.current.wabaId || undefined,
        phoneNumberId: onboardingAssetsRef.current.phoneNumberId || undefined,
        onboardingType: "whatsapp_business_app"
      });

      logMetaChannels(result.channels);

      if (
        onboardingFinishedRef.current &&
        onboardingAssetsRef.current.wabaId &&
        onboardingAssetsRef.current.phoneNumberId &&
        result.channels?.whatsapp !== "connected"
      ) {
        const attached = await attachWhatsAppIfReady();
        if (attached?.channels) {
          logMetaChannels(attached.channels);
          result.channels = attached.channels;
        }
      }

      await finishMetaOnboarding(result.channels);
    } catch (completionError) {
      console.log(META_ONBOARDING_DEBUG, "attemptCompletion exchange failed", {
        timestamp: new Date().toISOString(),
        codeFingerprint: activeFingerprint,
        message: completionError.message
      });
      setError(
        completionError instanceof MetaEmbeddedSignupError
          ? completionError.message
          : completionError.message || "Unable to connect Meta"
      );
    } finally {
      exchangeInFlightRef.current = false;
      connectMetaInProgressRef.current = false;
      setLaunching(false);
    }
  }, [attachWhatsAppIfReady, clearCompletionTimeout, finishMetaOnboarding]);

  const handleFinishEvent = useCallback(async () => {
    if (exchangeSubmittedRef.current) {
      if (whatsappAttachedRef.current || !onboardingAssetsRef.current.wabaId) {
        return;
      }

      setLaunching(true);
      setError("");

      try {
        const attached = await attachWhatsAppIfReady();
        logMetaChannels(attached?.channels || { whatsapp: "connected" });
      } catch (attachError) {
        setError(
          attachError instanceof MetaEmbeddedSignupError
            ? attachError.message
            : attachError.message || "Unable to attach WhatsApp"
        );
      } finally {
        setLaunching(false);
      }

      return;
    }

    attemptCompletion();
  }, [attachWhatsAppIfReady, attemptCompletion]);

  useEffect(() => {
    function handleMessage(event) {
      console.log("[META_RAW_MESSAGE]", event.origin, event.data);

      if (!isAllowedFacebookOrigin(event.origin)) {
        return;
      }

      const parsed = parseEmbeddedSignupPostMessage(event.data);

      if (!parsed) {
        return;
      }

      if (FINISH_EVENTS.has(parsed.event)) {
        onboardingFinishedRef.current = true;
        onboardingAssetsRef.current = mergeEmbeddedSignupIds(onboardingAssetsRef.current, parsed);
        console.log(META_ONBOARDING_DEBUG, "FINISH event received", {
          event: parsed.event,
          wabaId: parsed.wabaId,
          phoneNumberId: parsed.phoneNumberId
        });
        logCoordinatorState("after FINISH event");
        handleFinishEvent();
        return;
      }

      if (parsed.event === "CANCEL") {
        clearCompletionTimeout();
        setLaunching(false);
        setError("Meta connection was cancelled.");
      }

      if (parsed.event === "ERROR") {
        clearCompletionTimeout();
        setLaunching(false);
        setError(parsed.errorMessage || "Meta connection failed.");
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [clearCompletionTimeout, handleFinishEvent, logCoordinatorState]);

  function handleConnectMeta() {
    if (connectMetaInProgressRef.current || launching) {
      console.log(META_ONBOARDING_DEBUG, "handleConnectMeta ignored duplicate launch", {
        timestamp: new Date().toISOString(),
        connectMetaInProgress: connectMetaInProgressRef.current,
        launching
      });
      return;
    }

    setError("");

    if (!ready || !window.FB) {
      setError("Meta SDK is not ready yet. Please try again in a moment.");
      return;
    }

    if (!appId || !configId) {
      setError("Meta is not configured in this environment.");
      return;
    }

    connectMetaInProgressRef.current = true;
    setLaunching(true);
    authorizationCodeRef.current = null;
    codeIssuedAtRef.current = null;
    codeFingerprintRef.current = null;
    submittedCodeFingerprintRef.current = null;
    exchangeInFlightRef.current = false;
    onboardingAssetsRef.current = { wabaId: null, phoneNumberId: null };
    onboardingFinishedRef.current = false;
    exchangeSubmittedRef.current = false;
    whatsappAttachedRef.current = false;
    logCoordinatorState("FB.login started");
    armCompletionTimeout();

    const loginOptions = buildOfficialLoginOptions(configId);

    console.log(META_ONBOARDING_DEBUG, "FB.login preflight", {
      timestamp: new Date().toISOString(),
      appId,
      configId,
      loginOptions
    });

    window.FB.login(
      (response) => {
        const authResponse = response?.authResponse ?? null;
        const callbackTimestamp = new Date().toISOString();

        console.log(META_ONBOARDING_DEBUG, "FULL FB LOGIN RESPONSE", sanitizeLoginResponseForLog(response));
        console.log(META_ONBOARDING_DEBUG, "AUTH RESPONSE", sanitizeAuthResponseForLog(authResponse));
        console.log(META_ONBOARDING_DEBUG, "FB.login callback summary", {
          timestamp: callbackTimestamp,
          status: response?.status ?? null,
          hasCode: Boolean(authResponse?.code),
          codeLength: authResponse?.code?.length ?? 0,
          hasAccessToken: Boolean(authResponse?.accessToken),
          accessTokenLength: authResponse?.accessToken?.length ?? 0,
          grantedScopes: authResponse?.grantedScopes ?? null
        });

        if (authResponse?.code) {
          authorizationCodeRef.current = authResponse.code;
          codeIssuedAtRef.current = Date.now();

          void fingerprintAuthorizationCode(authResponse.code).then((fingerprint) => {
            codeFingerprintRef.current = fingerprint;
            console.log(META_ONBOARDING_DEBUG, "authorization code received", {
              timestamp: new Date().toISOString(),
              codeLength: authResponse.code.length,
              codeFingerprint: fingerprint,
              codeIssuedAt: new Date(codeIssuedAtRef.current).toISOString()
            });
            logCoordinatorState("after authorization code");
            attemptCompletion();
          });
          return;
        }

        connectMetaInProgressRef.current = false;

        if (!response.authResponse && !onboardingFinishedRef.current) {
          clearCompletionTimeout();
          setLaunching(false);
        }
      },
      loginOptions
    );
  }

  async function handleContinueIfConnected() {
    await completeMetaOnboarding({ whatsappStatus: "pending" });
    await refresh();
    navigate("/onboarding/calendar");
  }

  const metaConfigured = onboarding?.integrations?.meta?.configured;

  return (
    <OnboardingLayout
      step={3}
      title="Connect Meta"
      subtitle="One click connects Facebook, Messenger, and Instagram for Atlas."
    >
      <p className="onboarding-note">
        Atlas prepares Facebook, Messenger, Instagram, and future channels like WhatsApp behind
        this single connection.
      </p>

      <OnboardingError message={sdkError || error} />

      <OnboardingButton onClick={handleConnectMeta} disabled={launching || !metaConfigured}>
        {launching ? "Connecting..." : "Connect Meta"}
      </OnboardingButton>

      {connected ? (
        <OnboardingButton variant="secondary" onClick={handleContinueIfConnected}>
          Continue
        </OnboardingButton>
      ) : null}

      {!metaConfigured ? (
        <p className="onboarding-note">
          Meta credentials are not configured locally. Add Meta environment variables to enable live
          connection.
        </p>
      ) : null}
    </OnboardingLayout>
  );
}
