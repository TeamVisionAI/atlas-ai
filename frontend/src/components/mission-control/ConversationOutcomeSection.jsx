import { useEffect, useState } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import { saveConversationOutcome } from "../../services/missionControlService";

export default function ConversationOutcomeSection({
  phone,
  conversationOutcome,
  disabled = false,
  onSaved,
  /** When set, restrict the selector to these catalog outcomes (e.g. Not Interested only). */
  allowedOutcomes = null,
  title = null,
  description = null,
  defaultOutcome = ""
}) {
  const { translate } = useLanguage();
  const outcomeOptions = Array.isArray(allowedOutcomes)
    ? allowedOutcomes
    : conversationOutcome?.outcomes || [];
  const initialOutcome =
    defaultOutcome || (outcomeOptions.length === 1 ? outcomeOptions[0] : "");
  const [outcome, setOutcome] = useState(initialOutcome);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setOutcome(initialOutcome);
    setError(null);
  }, [phone, conversationOutcome?.canRecordOutcome, initialOutcome]);

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
      <h3 className="conversation-outcome__title">
        {title || translate("conversationOutcomeTitle")}
      </h3>
      {description ? <p className="conversation-outcome__description">{description}</p> : null}

      <form className="conversation-outcome__form" onSubmit={handleSubmit}>
        <label className="conversation-outcome__field conversation-outcome__field--full">
          <span>{translate("conversationOutcomeSelectorLabel")}</span>
          <select
            value={outcome}
            onChange={(event) => setOutcome(event.target.value)}
            disabled={disabled || submitting}
            required
          >
            {outcomeOptions.length !== 1 ? (
              <option value="">{translate("conversationOutcomeSelectOutcome")}</option>
            ) : null}
            {outcomeOptions.map((option) => (
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
