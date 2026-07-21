import OnboardingLayout, { OnboardingButton } from "../../components/onboarding/OnboardingLayout";

export default function WelcomePage() {
  return (
    <OnboardingLayout
      title="Welcome to Atlas"
      subtitle="Conversations into Appointments."
    >
      <OnboardingButton to="/onboarding/signup">Create Account</OnboardingButton>
      <OnboardingButton to="/onboarding/login" variant="secondary">
        Login
      </OnboardingButton>
    </OnboardingLayout>
  );
}
