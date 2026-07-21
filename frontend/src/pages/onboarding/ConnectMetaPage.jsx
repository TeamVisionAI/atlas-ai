import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import OnboardingLayout, { OnboardingButton, OnboardingError } from "../../components/onboarding/OnboardingLayout";
import { useFacebookSdk } from "../../hooks/useFacebookSdk";
import { useAuth } from "../../contexts/AuthContext";
import { completeMetaOnboarding } from "../../services/onboardingService";
import {
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

export default function ConnectMetaPage() {
  const navigate = useNavigate();
  const { onboarding, refresh } = useAuth();
  const { ready, error: sdkError, appId, configId } = useFacebookSdk();
  const [error, setError] = useState("");
  const [launching, setLaunching] = useState(false);
  const [connected, setConnected] = useState(onboarding?.integrations?.meta?.connected || false);

  const authorizationCodeRef = useRef(null);
  const onboardingAssetsRef = useRef({ wabaId: null, phoneNumberId: null });
  const onboardingFinishedRef = useRef(false);
  const exchangeSubmittedRef = useRef(false);

  useEffect(() => {
    getEmbeddedSignupStatus()
      .then((status) => setConnected(Boolean(status?.connected)))
      .catch(() => {
        // ignore status errors during onboarding
      });
  }, []);

  const attemptCompletion = useCallback(async () => {
    if (
      !authorizationCodeRef.current ||
      !onboardingFinishedRef.current ||
      exchangeSubmittedRef.current
    ) {
      return;
    }

    exchangeSubmittedRef.current = true;
    setLaunching(true);
    setError("");

    try {
      await exchangeEmbeddedSignupCode({
        code: authorizationCodeRef.current,
        wabaId: onboardingAssetsRef.current.wabaId || undefined,
        phoneNumberId: onboardingAssetsRef.current.phoneNumberId || undefined,
        onboardingType: "whatsapp_business_app"
      });
      await completeMetaOnboarding();
      await refresh();
      setConnected(true);
      navigate("/onboarding/calendar");
    } catch (completionError) {
      exchangeSubmittedRef.current = false;
      setError(
        completionError instanceof MetaEmbeddedSignupError
          ? completionError.message
          : completionError.message || "Unable to connect Meta"
      );
    } finally {
      setLaunching(false);
    }
  }, [navigate, refresh]);

  useEffect(() => {
    function handleMessage(event) {
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
        attemptCompletion();
        return;
      }

      if (parsed.event === "CANCEL") {
        setLaunching(false);
        setError("Meta connection was cancelled.");
      }

      if (parsed.event === "ERROR") {
        setLaunching(false);
        setError(parsed.errorMessage || "Meta connection failed.");
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [attemptCompletion]);

  function handleConnectMeta() {
    setError("");

    if (!ready || !window.FB) {
      setError("Meta SDK is not ready yet. Please try again in a moment.");
      return;
    }

    if (!appId || !configId) {
      setError("Meta is not configured in this environment.");
      return;
    }

    setLaunching(true);
    authorizationCodeRef.current = null;
    onboardingAssetsRef.current = { wabaId: null, phoneNumberId: null };
    onboardingFinishedRef.current = false;
    exchangeSubmittedRef.current = false;

    window.FB.login(
      (response) => {
        if (response.authResponse?.code) {
          authorizationCodeRef.current = response.authResponse.code;
          attemptCompletion();
          return;
        }

        if (!response.authResponse && !onboardingFinishedRef.current) {
          setLaunching(false);
        }
      },
      {
        config_id: configId,
        response_type: "code",
        override_default_response_type: true,
        extras: {
          setup: {},
          featureType: "whatsapp_business_app_onboarding",
          sessionInfoVersion: "3"
        }
      }
    );
  }

  async function handleContinueIfConnected() {
    await completeMetaOnboarding();
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
