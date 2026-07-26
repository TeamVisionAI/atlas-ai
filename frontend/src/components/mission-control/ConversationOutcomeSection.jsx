import { useEffect, useState } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import { saveConversationOutcome } from "../../services/missionControlService";

export default function ConversationOutcomeSection({
  phone,
  conversationOutcome,
  disabled = false,
  onSaved
}) {
  const { translate } = useLanguage();
  const [outcome, setOutcome] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setOutcome("");
    setError(null);
  }, [phone, conversationOutcome]);

  async function handleSubmit(event) {
    event.preventDefault();

    if (!outcome) {
      setError(translate("conversationOutcomeRequired"));
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const result = await saveConversationOutcome(phone, { outcome });

      if (!result.success) {
        setError(result.message || translate("conversationOutcomeSaveFailed"));
        return;
      }

      await onSaved?.(result);
    } catch (submitError) {
      console.error(submitError);
      setError(translate("conversationOutcomeSaveFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="conversation-outcome conversation-outcome--outcome">
      <h3 className="conversation-outcome__title">{translate("conversationOutcomeTitle")}</h3>

      <form className="conversation-outcome__form" onSubmit={handleSubmit}>
        <label className="conversation-outcome__field conversation-outcome__field--full">
          <span>{translate("conversationOutcomeSelectorLabel")}</span>
          <select
            value={outcome}
            onChange={(event) => setOutcome(event.target.value)}
            disabled={disabled || submitting}
            required
          >
            <option value="">{translate("conversationOutcomeSelectOutcome")}</option>
            {(conversationOutcome.outcomes || []).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        {error ? (
          <p className="conversation-outcome__error" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          className="conversation-outcome__submit"
          disabled={disabled || submitting}
        >
          {submitting
            ? translate("conversationOutcomeSaving")
            : translate("conversationOutcomeSaveOutcomeContinue")}
        </button>
      </form>
    </section>
  );
}
