import { useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import ExecutivePanel from "../design-system/ExecutivePanel";
import { saveRequiredInformation } from "../../services/missionControlService";
import { FIELD_INPUT_CONFIG } from "./fieldInputConfig";
import "./QualificationForm.css";

function buildInitialForm(requiredInputs, conversationOutcome) {
  const fields = conversationOutcome?.fields || {};
  const draft = conversationOutcome?.draft || {};
  const suggested = conversationOutcome?.suggestedDefaults || {};
  const initial = {};

  for (const input of requiredInputs) {
    initial[input.key] =
      draft[input.key] ?? suggested[input.key] ?? fields[input.key] ?? "";
  }

  return initial;
}

function buildFormSessionKey(phone, requiredInputs) {
  const keys = (requiredInputs || []).map((input) => input.key).join("|");
  return `${phone || ""}|${keys}`;
}

function SuggestionHint({ visible, translate }) {
  return (
    <p
      className={`qualification-form__suggested${visible ? "" : " qualification-form__suggested--hidden"}`}
      aria-hidden={!visible}
    >
      {translate("qualificationFormSuggestedByAtlas")}
    </p>
  );
}

function renderField({
  input,
  form,
  disabled,
  submitting,
  translate,
  updateField,
  suggestedDefaults
}) {
  const config = FIELD_INPUT_CONFIG[input.key] || { type: "text" };
  const label = input.label || input.key;
  const suggestedValue = suggestedDefaults?.[input.key];
  const showSuggestion =
    Boolean(suggestedValue) &&
    String(suggestedValue).trim() &&
    String(form[input.key] || "").trim() === String(suggestedValue).trim();

  if (config.type === "radio") {
    return (
      <fieldset key={input.key} className="qualification-form__field qualification-form__field--radio">
        <legend>{label}</legend>
        <div className="qualification-form__radio-group" role="radiogroup" aria-label={label}>
          {(config.options || []).map((option) => {
            const selected = form[input.key] === option.value;

            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`qualification-form__radio${selected ? " qualification-form__radio--selected" : ""}`}
                disabled={disabled || submitting}
                onClick={() => updateField(input.key, option.value)}
              >
                {translate(option.labelKey)}
              </button>
            );
          })}
        </div>
        <SuggestionHint visible={showSuggestion} translate={translate} />
      </fieldset>
    );
  }

  if (config.type === "select") {
    return (
      <label key={input.key} className="qualification-form__field">
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
        <SuggestionHint visible={showSuggestion} translate={translate} />
      </label>
    );
  }

  return (
    <label key={input.key} className="qualification-form__field">
      <span>{label}</span>
      <input
        type={config.type || "text"}
        value={form[input.key] || ""}
        onChange={(event) => updateField(input.key, event.target.value)}
        disabled={disabled || submitting}
      />
      <SuggestionHint visible={showSuggestion} translate={translate} />
    </label>
  );
}

export default function QualificationForm({
  phone,
  conversationOutcome,
  disabled = false,
  onSaved,
  onDraftActiveChange
}) {
  const { translate } = useLanguage();
  const requiredInputs = conversationOutcome?.requiredInputs || [];
  const suggestedDefaults = conversationOutcome?.suggestedDefaults || {};
  const formMeta = conversationOutcome?.qualificationForm || {};
  const formSessionKey = useMemo(
    () => buildFormSessionKey(phone, requiredInputs),
    [phone, requiredInputs]
  );
  const initializedSessionRef = useRef(null);
  const [form, setForm] = useState(() => buildInitialForm(requiredInputs, conversationOutcome));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (initializedSessionRef.current === formSessionKey) {
      return;
    }

    initializedSessionRef.current = formSessionKey;
    setForm(buildInitialForm(requiredInputs, conversationOutcome));
    setError(null);
    setFieldErrors({});
    setIsDirty(false);
  }, [formSessionKey, requiredInputs, conversationOutcome]);

  useEffect(() => {
    onDraftActiveChange?.(isDirty);
  }, [isDirty, onDraftActiveChange]);

  useEffect(() => {
    return () => {
      onDraftActiveChange?.(false);
    };
  }, [onDraftActiveChange]);

  if (!requiredInputs.length) {
    return null;
  }

  function updateField(key, value) {
    setIsDirty(true);
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key]) {
        return current;
      }

      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function validateForm() {
    const nextErrors = {};

    for (const input of requiredInputs) {
      const value = form[input.key];

      if (value === undefined || value === null || String(value).trim() === "") {
        nextErrors[input.key] = translate("qualificationFormFieldRequired");
      }
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!validateForm()) {
      setError(translate("qualificationFormCompleteAllFields"));
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const fields = {};

      for (const input of requiredInputs) {
        fields[input.key] = form[input.key];
      }

      const result = await saveRequiredInformation(phone, { fields });

      if (!result.success) {
        setError(result.message || translate("qualificationFormSaveFailed"));
        if (result.fields) {
          setFieldErrors(result.fields);
        }
        return;
      }

      setIsDirty(false);
      await onSaved?.(result);
    } catch (submitError) {
      console.error(submitError);
      setError(translate("qualificationFormSaveFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ExecutivePanel id="qualification-form" className="qualification-form">
      <header className="qualification-form__header">
        <h3 className="qualification-form__title">
          {formMeta.title || translate("qualificationFormTitle")}
        </h3>
        <p className="qualification-form__description">
          {formMeta.description || translate("qualificationFormDescription")}
        </p>
      </header>

      <form className="qualification-form__body" onSubmit={handleSubmit}>
        <div className="qualification-form__grid">
          {requiredInputs.map((input) => (
            <div key={input.key} className="qualification-form__field-wrap">
              {renderField({
                input,
                form,
                disabled,
                submitting,
                translate,
                updateField,
                suggestedDefaults
              })}
              {fieldErrors[input.key] ? (
                <p className="qualification-form__field-error" role="alert">
                  {fieldErrors[input.key]}
                </p>
              ) : null}
            </div>
          ))}
        </div>

        {error ? (
          <p className="qualification-form__error" role="alert">
            {error}
          </p>
        ) : null}

        <button type="submit" className="qualification-form__submit" disabled={disabled || submitting}>
          {submitting ? translate("qualificationFormSaving") : translate("qualificationFormContinue")}
        </button>
      </form>
    </ExecutivePanel>
  );
}
