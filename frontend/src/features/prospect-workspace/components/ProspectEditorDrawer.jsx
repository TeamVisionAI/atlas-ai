import { useEffect, useMemo, useState } from "react";
import AtlasButton from "../../../components/ui/AtlasButton";
import { FIELD_INPUT_CONFIG } from "../../../components/mission-control/fieldInputConfig";
import { resolveQuickCaptureSourceOptions } from "../../../config/quickCaptureCopy";
import { updateProspectWorkspaceProfile } from "../services/prospectWorkspaceApi";
import {
  buildProspectEditorInitialValues,
  validateProspectEditorValues
} from "../utils/prospectEditorModel";
import "./ProspectEditorDrawer.css";

function FormSection({ title, children }) {
  return (
    <section className="prospect-editor-form__section">
      <h3 className="prospect-editor-form__section-title">{title}</h3>
      {children}
    </section>
  );
}

function FieldError({ message }) {
  if (!message) {
    return null;
  }

  return (
    <p className="prospect-editor-form__field-error" role="alert">
      {message}
    </p>
  );
}

function TextField({ label, value, onChange, disabled = false, type = "text", error }) {
  return (
    <label className="prospect-editor-form__field">
      <span>{label}</span>
      <input type={type} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
      <FieldError message={error} />
    </label>
  );
}

function SelectField({ label, value, onChange, options, placeholder, error }) {
  return (
    <label className="prospect-editor-form__field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <FieldError message={error} />
    </label>
  );
}

function RadioField({ label, value, onChange, options, error }) {
  return (
    <div className="prospect-editor-form__field prospect-editor-form__field--full">
      <span>{label}</span>
      <div className="prospect-editor-form__radio-group" role="radiogroup" aria-label={label}>
        {options.map((option) => {
          const selected = value === option.value;

          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`prospect-editor-form__radio${selected ? " prospect-editor-form__radio--selected" : ""}`}
              onClick={() => onChange(option.value)}
            >
              {option.icon ? `${option.icon} ` : ""}
              {option.label}
            </button>
          );
        })}
      </div>
      <FieldError message={error} />
    </div>
  );
}

export default function ProspectEditorDrawer({
  open,
  workspace,
  translate,
  onClose,
  onSaved
}) {
  const initialValues = useMemo(
    () => buildProspectEditorInitialValues(workspace),
    [workspace, open]
  );
  const [form, setForm] = useState(initialValues);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(buildProspectEditorInitialValues(workspace));
      setFieldErrors({});
      setSubmitError(null);
    }
  }, [open, workspace]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function onKeyDown(event) {
      if (event.key === "Escape") {
        onClose?.();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  function updateField(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => ({ ...current, [name]: null }));
    setSubmitError(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const nextErrors = validateProspectEditorValues(form, translate);

    if (Object.keys(nextErrors).length) {
      setFieldErrors(nextErrors);
      return;
    }

    if (!workspace?.phone) {
      setSubmitError(translate("prospectEditorSaveFailed"));
      return;
    }

    setSaving(true);
    setSubmitError(null);

    try {
      await updateProspectWorkspaceProfile(workspace.phone, form);
      await onSaved?.();
      onClose?.();
    } catch (error) {
      const payloadFields = error?.payload?.fields;

      if (payloadFields && typeof payloadFields === "object") {
        setFieldErrors(payloadFields);
      }

      setSubmitError(error.message || translate("prospectEditorSaveFailed"));
    } finally {
      setSaving(false);
    }
  }

  const languageOptions = (FIELD_INPUT_CONFIG.preferred_language?.options || []).map((option) => ({
    value: option.value,
    label: translate(option.labelKey)
  }));

  const workAuthorizationOptions = (FIELD_INPUT_CONFIG.work_authorization_status?.options || []).map(
    (option) => ({
      value: option.value,
      label: translate(option.labelKey)
    })
  );

  const interviewTypeOptions = (FIELD_INPUT_CONFIG.interview_type?.options || []).map((option) => ({
    value: option.value,
    label: translate(option.labelKey),
    icon: option.icon
  }));

  const leadSourceOptions = resolveQuickCaptureSourceOptions(translate);

  return (
    <>
      <div className="prospect-editor-drawer__backdrop" role="presentation" onClick={onClose} />
      <aside className="prospect-editor-drawer" role="dialog" aria-modal="true" aria-labelledby="prospect-editor-title">
        <header className="prospect-editor-drawer__header">
          <div>
            <h2 id="prospect-editor-title" className="prospect-editor-drawer__title">
              {translate("prospectEditorTitle")}
            </h2>
            <p className="prospect-editor-drawer__subtitle">{translate("prospectEditorSubtitle")}</p>
          </div>
          <button type="button" className="prospect-editor-drawer__close" onClick={onClose} aria-label={translate("workspaceCancel")}>
            ×
          </button>
        </header>

        <form className="prospect-editor-drawer__body prospect-editor-form" onSubmit={handleSubmit}>
          <FormSection title={translate("prospectEditorSectionBasic")}>
            <div className="prospect-editor-form__grid">
              <TextField
                label={translate("conversationOutcomeFieldFirstName")}
                value={form.first_name}
                onChange={(value) => updateField("first_name", value)}
                error={fieldErrors.first_name}
              />
              <TextField
                label={translate("conversationOutcomeFieldLastName")}
                value={form.last_name}
                onChange={(value) => updateField("last_name", value)}
                error={fieldErrors.last_name}
              />
              <TextField
                label={translate("prospectEditorFieldPhone")}
                value={form.phone}
                disabled
                onChange={() => {}}
              />
              <TextField
                label={translate("conversationOutcomeFieldEmail")}
                value={form.email}
                type="email"
                onChange={(value) => updateField("email", value)}
                error={fieldErrors.email}
              />
              <RadioField
                label={translate("conversationOutcomeFieldLanguage")}
                value={form.preferred_language}
                onChange={(value) => updateField("preferred_language", value)}
                options={languageOptions}
                error={fieldErrors.preferred_language}
              />
            </div>
          </FormSection>

          <FormSection title={translate("prospectEditorSectionQualification")}>
            <div className="prospect-editor-form__grid">
              <TextField
                label={translate("conversationOutcomeFieldCity")}
                value={form.city}
                onChange={(value) => updateField("city", value)}
                error={fieldErrors.city}
              />
              <TextField
                label={translate("conversationOutcomeFieldState")}
                value={form.state}
                onChange={(value) => updateField("state", value)}
                error={fieldErrors.state}
              />
              <SelectField
                label={translate("conversationOutcomeFieldWorkAuthorization")}
                value={form.work_authorization_status}
                onChange={(value) => updateField("work_authorization_status", value)}
                placeholder={translate("conversationOutcomeSelectWorkAuthorization")}
                options={workAuthorizationOptions}
                error={fieldErrors.work_authorization_status}
              />
            </div>
          </FormSection>

          <FormSection title={translate("prospectEditorSectionRecruiting")}>
            <div className="prospect-editor-form__grid">
              <SelectField
                label={translate("quickCaptureHowDidYouMeet")}
                value={form.source}
                onChange={(value) => updateField("source", value)}
                placeholder={translate("prospectEditorSelectLeadSource")}
                options={leadSourceOptions}
                error={fieldErrors.source}
              />
              <RadioField
                label={translate("missionExecutionInterviewType")}
                value={form.interview_type}
                onChange={(value) => updateField("interview_type", value)}
                options={interviewTypeOptions}
                error={fieldErrors.interview_type}
              />
            </div>
          </FormSection>

          <FormSection title={translate("prospectEditorSectionNotes")}>
            <label className="prospect-editor-form__field prospect-editor-form__field--full">
              <span>{translate("prospectEditorFieldInternalNotes")}</span>
              <textarea
                value={form.internal_notes}
                onChange={(event) => updateField("internal_notes", event.target.value)}
                placeholder={translate("prospectEditorInternalNotesPlaceholder")}
              />
            </label>
          </FormSection>

          {submitError ? (
            <p className="prospect-editor-form__error" role="alert">
              {submitError}
            </p>
          ) : null}
        </form>

        <footer className="prospect-editor-drawer__footer">
          <AtlasButton variant="ghost" onClick={onClose} disabled={saving}>
            {translate("workspaceCancel")}
          </AtlasButton>
          <AtlasButton variant="primary" onClick={handleSubmit} busy={saving}>
            {saving ? translate("prospectEditorSaving") : translate("prospectEditorSaveChanges")}
          </AtlasButton>
        </footer>
      </aside>
    </>
  );
}
