import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import OnboardingLayout, { OnboardingButton, OnboardingError } from "../../components/onboarding/OnboardingLayout";
import { useAuth } from "../../contexts/AuthContext";
import { startCalendarConnect } from "../../services/onboardingService";

export default function ConnectCalendarPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { onboarding, refresh } = useAuth();
  const [error, setError] = useState(searchParams.get("error") ? "Calendar connection failed." : "");
  const [loading, setLoading] = useState(false);

  const connected =
    searchParams.get("connected") === "1" || onboarding?.integrations?.calendar?.connected;

  useEffect(() => {
    if (searchParams.get("connected") === "1") {
      refresh().catch(() => {
        // ignore refresh errors
      });
    }
  }, [refresh, searchParams]);

  async function handleConnectCalendar() {
    setLoading(true);
    setError("");

    try {
      const result = await startCalendarConnect();
      window.location.href = result.url;
    } catch (connectError) {
      setError(connectError.message);
      setLoading(false);
    }
  }

  return (
    <OnboardingLayout
      step={4}
      title="Connect Google Calendar"
      subtitle="OAuth only. Atlas uses your calendar to schedule meetings."
    >
      <OnboardingError message={error} />

      {connected ? (
        <>
          <p className="onboarding-note">Google Calendar is connected.</p>
          <OnboardingButton onClick={() => navigate("/onboarding/meeting-preferences")}>
            Continue
          </OnboardingButton>
        </>
      ) : (
        <OnboardingButton
          onClick={handleConnectCalendar}
          disabled={loading || !onboarding?.integrations?.calendar?.configured}
        >
          {loading ? "Opening Google..." : "Connect Calendar"}
        </OnboardingButton>
      )}

      {!onboarding?.integrations?.calendar?.configured ? (
        <p className="onboarding-note">
          Add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_OAUTH_REDIRECT_URI` to enable
          calendar OAuth in this environment.
        </p>
      ) : null}
    </OnboardingLayout>
  );
}
