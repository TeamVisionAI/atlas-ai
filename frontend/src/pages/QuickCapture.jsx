import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext";
import {
  QuickCaptureError,
  saveQuickCaptureProspect
} from "../services/quickCaptureService";
import { buildProspectWorkspacePath } from "../utils/prospectRoutes";
import "./QuickCapture.css";

const MANUAL_SOURCES = [
  { value: "IN_PERSON", labelKey: "quickCaptureSourceInPerson" },
  { value: "REFERRAL", labelKey: "quickCaptureSourceReferral" },
  { value: "CHURCH", labelKey: "quickCaptureSourceChurch" },
  { value: "NETWORKING", labelKey: "quickCaptureSourceNetworking" },
  { value: "COMMUNITY_EVENT", labelKey: "quickCaptureSourceCommunityEvent" },
  { value: "WARM_MARKET", labelKey: "quickCaptureSourceWarmMarket" },
  { value: "OTHER", labelKey: "quickCaptureSourceOther" }
];

const EMPTY_FORM = {
  first_name: "",
  last_name: "",
  phone: "",
  source: "IN_PERSON"
};

function DuplicateDialog({ duplicate, t, onOpen, onCancel }) {
  if (!duplicate) {
    return null;
  }

  return (
    <div className="quick-capture-overlay" role="dialog" aria-modal="true">
      <div className="quick-capture-dialog">
        <h3>{t.quickCaptureDuplicateTitle}</h3>
        <p>{t.quickCaptureDuplicateMessage}</p>
        <div className="quick-capture-dialog-actions">
          <button type="button" className="quick-capture-dialog-primary" onClick={onOpen}>
            {t.quickCaptureOpenExisting}
          </button>
          <button type="button" className="quick-capture-dialog-secondary" onClick={onCancel}>
            {t.quickCaptureCancel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function QuickCapture() {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [duplicate, setDuplicate] = useState(null);

  const sourceOptions = useMemo(
    () =>
      MANUAL_SOURCES.map((option) => ({
        value: option.value,
        label: t[option.labelKey]
      })),
    [t]
  );

  function updateField(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => ({ ...current, [name]: null }));
    setSubmitError(null);
  }

  function validateClient() {
    const errors = {};

    if (!form.first_name.trim()) {
      errors.first_name = t.quickCaptureRequired;
    }

    if (!form.last_name.trim()) {
      errors.last_name = t.quickCaptureRequired;
    }

    if (!form.phone.trim()) {
      errors.phone = t.quickCaptureRequired;
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!validateClient()) {
      return;
    }

    setLoading(true);
    setSubmitError(null);
    setDuplicate(null);

    try {
      const result = await saveQuickCaptureProspect({
        ...form,
        communication_language: language
      });
      const phone = result?.prospect?.phone;

      if (phone) {
        navigate(buildProspectWorkspacePath({ phone }));
        return;
      }

      setSubmitError(t.quickCaptureError);
    } catch (error) {
      if (error instanceof QuickCaptureError && error.status === 409) {
        setDuplicate(error.payload?.prospect || null);
        return;
      }

      if (error instanceof QuickCaptureError && error.status === 401) {
        setSubmitError(t.quickCaptureError);
        return;
      }

      if (error instanceof QuickCaptureError && error.payload?.fields) {
        setFieldErrors(error.payload.fields);
        return;
      }

      setSubmitError(error.message || t.quickCaptureError);
    } finally {
      setLoading(false);
    }
  }

  function openExistingProspect() {
    if (!duplicate?.phone) {
      setDuplicate(null);
      return;
    }

    navigate(buildProspectWorkspacePath({ phone: duplicate.phone }));
  }

  return (
    <div className="quick-capture-page">
      <div className="quick-capture-shell">
        <form className="quick-capture-card" onSubmit={handleSubmit}>
          <h1 className="quick-capture-title">{t.quickCaptureTitle}</h1>

          {submitError ? (
            <div className="quick-capture-banner quick-capture-banner--error">{submitError}</div>
          ) : null}

          <label className="quick-capture-field">
            <span className="quick-capture-label">{t.quickCaptureFirstName}</span>
            <input
              className={`quick-capture-input${fieldErrors.first_name ? " quick-capture-input--error" : ""}`}
              value={form.first_name}
              autoComplete="given-name"
              onChange={(event) => updateField("first_name", event.target.value)}
            />
            {fieldErrors.first_name ? (
              <span className="quick-capture-error-text">{fieldErrors.first_name}</span>
            ) : null}
          </label>

          <label className="quick-capture-field">
            <span className="quick-capture-label">{t.quickCaptureLastName}</span>
            <input
              className={`quick-capture-input${fieldErrors.last_name ? " quick-capture-input--error" : ""}`}
              value={form.last_name}
              autoComplete="family-name"
              onChange={(event) => updateField("last_name", event.target.value)}
            />
            {fieldErrors.last_name ? (
              <span className="quick-capture-error-text">{fieldErrors.last_name}</span>
            ) : null}
          </label>

          <label className="quick-capture-field">
            <span className="quick-capture-label">{t.quickCapturePhone}</span>
            <input
              className={`quick-capture-input${fieldErrors.phone ? " quick-capture-input--error" : ""}`}
              value={form.phone}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              onChange={(event) => updateField("phone", event.target.value)}
            />
            {fieldErrors.phone ? (
              <span className="quick-capture-error-text">{fieldErrors.phone}</span>
            ) : null}
          </label>

          <label className="quick-capture-field">
            <span className="quick-capture-label">{t.quickCaptureHowDidYouMeet}</span>
            <select
              className="quick-capture-select"
              value={form.source}
              onChange={(event) => updateField("source", event.target.value)}
            >
              {sourceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <button type="submit" className="quick-capture-submit" disabled={loading}>
            {loading ? t.quickCaptureSaving : t.quickCaptureSave}
          </button>
        </form>
      </div>

      <DuplicateDialog
        duplicate={duplicate}
        t={t}
        onOpen={openExistingProspect}
        onCancel={() => setDuplicate(null)}
      />
    </div>
  );
}
