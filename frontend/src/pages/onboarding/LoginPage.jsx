import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import OnboardingLayout, {
  OnboardingButton,
  OnboardingError,
  OnboardingField,
  OnboardingInput
} from "../../components/onboarding/OnboardingLayout";
import { useAuth } from "../../contexts/AuthContext";

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const result = await login({ email, password });
      navigate(result.status?.nextRoute || "/onboarding/organization");
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <OnboardingLayout step={1} title="Welcome back" subtitle="Sign in to continue onboarding.">
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

        <OnboardingField label="Password">
          <OnboardingInput
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Your password"
            required
          />
        </OnboardingField>

        <OnboardingError message={error} />

        <OnboardingButton type="submit" disabled={submitting}>
          {submitting ? "Signing in..." : "Login"}
        </OnboardingButton>
      </form>

      <div className="onboarding-link-row">
        <span>New to Atlas?</span>
        <Link to="/onboarding/signup">Create account</Link>
      </div>
    </OnboardingLayout>
  );
}
