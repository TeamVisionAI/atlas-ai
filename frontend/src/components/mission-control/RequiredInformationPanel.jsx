import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import { saveRequiredInformation } from "../../services/missionControlService";
import { FIELD_INPUT_CONFIG } from "./fieldInputConfig";

function buildInitialDraft(requiredInputs, conversationOutcome) {
  const fields = conversationOutcome?.fields || {};
  const draft = conversationOutcome?.draft || {};
  const initial = {};

  for (const input of requiredInputs) {
    initial[input.key] = draft[input.key] ?? fields[input.key] ?? "";
  }

  return initial;
}

function renderInputField({ input, form, disabled, submitting, translate, updateField }) {
  const config = FIELD_INPUT_CONFIG[input.key] || { type: "text" };
  const label = input.label || input.key;

  if (config.type === "select") {
    return (
      <label key={input.key} className="conversation-outcome__field">
        <span>{label}</span>
        <select
          value={form[input.key] || ""}
          onChange={(event) => updateField(input.key, event.target.value)}
          disabled={disabled || submitting}
        >
          {config.placeholderKey ? (
            <option value="">{translate(config.placeholderKey)}</option>
          ) : null}
          {(config.options || []).map((option) => (
            <option key={option.value} value={option.value}>
              {translate(option.labelKey)}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <label key={input.key} className="conversation-outcome__field">
      <span>{label}</span>
      <input
        type={config.type || "text"}
        value={form[input.key] || ""}
        onChange={(event) => updateField(input.key, event.target.value)}
        disabled={disabled || submitting}
      />
    </label>
  );
}

export default function RequiredInformationPanel({
  phone,
  requiredInputs = [],
  conversationOutcome,
  disabled = false,
  onSaved
}) {
  const { translate } = useLanguage();
  const inputKeys = useMemo(
    () => requiredInputs.map((input) => input.key).join("|"),
    [requiredInputs]
  );
  const [form, setForm] = useState(() =>
    buildInitialDraft(requiredInputs, conversationOutcome)
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setForm((current) => {
      const next = { ...current };

      for (const input of requiredInputs) {
        if (next[input.key] === undefined) {
          const fields = conversationOutcome?.fields || {};
          const draft = conversationOutcome?.draft || {};
          next[input.key] = draft[input.key] ?? fields[input.key] ?? "";
        }
      }

      return next;
    });
    setError(null);
  }, [phone, inputKeys, conversationOutcome]);

  if (!requiredInputs.length) {
    return null;
  }

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const fields = {};

      for (const input of requiredInputs) {
        const value = form[input.key];

        if (value !== undefined && value !== "") {
          fields[input.key] = value;
        }
      }

      const result = await saveRequiredInformation(phone, { fields });

      if (!result.success) {
        setError(result.message || translate("conversationOutcomeSaveInformationFailed"));
        return;
      }

      await onSaved?.(result);
    } catch (submitError) {
      console.error(submitError);
      setError(translate("conversationOutcomeSaveInformationFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="conversation-outcome conversation-outcome--required">
      <h3 className="conversation-outcome__title">
        {translate("conversationOutcomeRequiredInformation")}
      </h3>

      <form className="conversation-outcome__form" onSubmit={handleSubmit}>
        <div className="conversation-outcome__grid">
          {requiredInputs.map((input) =>
            renderInputField({
              input,
              form,
              disabled,
              submitting,
              translate,
              updateField
            })
          )}
        </div>

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
            : translate("conversationOutcomeSaveInformation")}
        </button>
      </form>
    </section>
  );
}
