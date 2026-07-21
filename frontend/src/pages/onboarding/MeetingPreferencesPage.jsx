import { useState } from "react";
import { useNavigate } from "react-router-dom";
import OnboardingLayout, {
  OnboardingButton,
  OnboardingCheckbox,
  OnboardingError,
  OnboardingField,
  OnboardingInput
} from "../../components/onboarding/OnboardingLayout";
import { saveMeetingPreferences } from "../../services/onboardingService";
import { useAuth } from "../../contexts/AuthContext";

export default function MeetingPreferencesPage() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [office, setOffice] = useState(true);
  const [zoom, setZoom] = useState(true);
  const [starbucks, setStarbucks] = useState(false);
  const [custom, setCustom] = useState(false);
  const [officeAddress, setOfficeAddress] = useState("");
  const [starbucksPreference, setStarbucksPreference] = useState("");
  const [customLocationName, setCustomLocationName] = useState("");
  const [customLocationAddress, setCustomLocationAddress] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      await saveMeetingPreferences({
        office,
        zoom,
        starbucks,
        custom,
        officeAddress: office ? officeAddress : "",
        starbucksPreference: starbucks ? starbucksPreference : "",
        customLocationName: custom ? customLocationName : "",
        customLocationAddress: custom ? customLocationAddress : ""
      });
      await refresh();
      navigate("/onboarding/activate");
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <OnboardingLayout
      step={5}
      title="Meeting preferences"
      subtitle="Where do you usually meet?"
    >
      <form className="onboarding-content" onSubmit={handleSubmit}>
        <OnboardingCheckbox label="Office" checked={office} onChange={() => setOffice((value) => !value)} />
        {office ? (
          <OnboardingField label="Office address">
            <OnboardingInput
              value={officeAddress}
              onChange={(event) => setOfficeAddress(event.target.value)}
              placeholder="123 Main St, Tampa, FL"
              required
            />
          </OnboardingField>
        ) : null}

        <OnboardingCheckbox label="Zoom" checked={zoom} onChange={() => setZoom((value) => !value)} />

        <OnboardingCheckbox
          label="Starbucks"
          checked={starbucks}
          onChange={() => setStarbucks((value) => !value)}
        />
        {starbucks ? (
          <OnboardingField label="Preferred Starbucks">
            <OnboardingInput
              value={starbucksPreference}
              onChange={(event) => setStarbucksPreference(event.target.value)}
              placeholder="Starbucks on Kennedy Blvd"
              required
            />
          </OnboardingField>
        ) : null}

        <OnboardingCheckbox
          label="Custom Location"
          checked={custom}
          onChange={() => setCustom((value) => !value)}
        />
        {custom ? (
          <>
            <OnboardingField label="Location name">
              <OnboardingInput
                value={customLocationName}
                onChange={(event) => setCustomLocationName(event.target.value)}
                placeholder="Downtown coworking space"
                required
              />
            </OnboardingField>
            <OnboardingField label="Location address">
              <OnboardingInput
                value={customLocationAddress}
                onChange={(event) => setCustomLocationAddress(event.target.value)}
                placeholder="Address"
                required
              />
            </OnboardingField>
          </>
        ) : null}

        <OnboardingError message={error} />

        <OnboardingButton type="submit" disabled={submitting || (!office && !zoom && !starbucks && !custom)}>
          {submitting ? "Saving..." : "Continue"}
        </OnboardingButton>
      </form>
    </OnboardingLayout>
  );
}
