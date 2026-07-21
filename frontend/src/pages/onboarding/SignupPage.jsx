import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import OnboardingLayout, {
  OnboardingButton,
  OnboardingError,
  OnboardingField,
  OnboardingInput
} from "../../components/onboarding/OnboardingLayout";
import { useAuth } from "../../contexts/AuthContext";

export default function SignupPage() {
  const navigate = useNavigate();
  const { signup } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      await signup({ email, password });
      navigate("/onboarding/organization");
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <OnboardingLayout
      step={1}
      title="Create your account"
      subtitle="Start with email and password. Google Sign-In is coming soon."
    >
      <form className="onboarding-content" onSubmit={handleSubmit}>
        <OnboardingField label="Email">
          <OnboardingInput
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@company.com"
            required
          />
        </OnboardingField>

        <OnboardingField label="Password" hint="At least 8 characters">
          <OnboardingInput
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Create a password"
            minLength={8}
            required
          />
        </OnboardingField>

        <OnboardingError message={error} />

        <OnboardingButton type="submit" disabled={submitting}>
          {submitting ? "Creating account..." : "Continue"}
        </OnboardingButton>
      </form>

      <div className="onboarding-link-row">
        <span>Already have an account?</span>
        <Link to="/onboarding/login">Login</Link>
      </div>
    </OnboardingLayout>
  );
}
