import { useState } from "react";
import { useNavigate } from "react-router-dom";
import OnboardingLayout, {
  OnboardingButton,
  OnboardingError,
  OnboardingField,
  OnboardingInput
} from "../../components/onboarding/OnboardingLayout";
import { createOrganization } from "../../services/onboardingService";
import { useAuth } from "../../contexts/AuthContext";

export default function OrganizationPage() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      await createOrganization(name.trim());
      await refresh();
      navigate("/onboarding/meta");
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <OnboardingLayout
      step={2}
      title="Create your organization"
      subtitle="One question. That is all we need to get started."
    >
      <form className="onboarding-content" onSubmit={handleSubmit}>
        <OnboardingField label="Organization Name" hint="Example: Team Vision">
          <OnboardingInput
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Team Vision"
            required
          />
        </OnboardingField>

        <OnboardingError message={error} />

        <OnboardingButton type="submit" disabled={submitting || !name.trim()}>
          {submitting ? "Creating..." : "Continue"}
        </OnboardingButton>
      </form>
    </OnboardingLayout>
  );
}
