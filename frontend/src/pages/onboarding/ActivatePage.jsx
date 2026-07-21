import { useState } from "react";
import { useNavigate } from "react-router-dom";
import OnboardingLayout, { OnboardingButton, OnboardingError } from "../../components/onboarding/OnboardingLayout";
import { activateAtlas } from "../../services/onboardingService";
import { useAuth } from "../../contexts/AuthContext";

export default function ActivatePage() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleActivate() {
    setSubmitting(true);
    setError("");

    try {
      await activateAtlas();
      await refresh();
      navigate("/app");
    } catch (activateError) {
      setError(activateError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <OnboardingLayout step={5} title="You're Ready!" subtitle="Atlas will now handle the work for you.">
      <ul className="onboarding-checklist">
        <li>Respond to new prospects</li>
        <li>Qualify prospects</li>
        <li>Answer common questions</li>
        <li>Schedule meetings</li>
        <li>Send reminders</li>
      </ul>

      <OnboardingError message={error} />

      <OnboardingButton onClick={handleActivate} disabled={submitting}>
        {submitting ? "Activating..." : "Activate Atlas"}
      </OnboardingButton>
    </OnboardingLayout>
  );
}
