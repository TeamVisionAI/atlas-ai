import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext";
import { useWorkspace } from "../contexts/WorkspaceContext";
import {
  resolveQuickCaptureCopy,
  resolveQuickCaptureLanguageOptions,
  resolveQuickCaptureSourceOptions
} from "../config/quickCaptureCopy";
import {
  QuickCaptureError,
  saveQuickCaptureProspect
} from "../services/quickCaptureService";
import { navigateToProspectWorkspace } from "../utils/prospectRoutes";
import QuickCaptureSuccess from "../components/quick-capture/QuickCaptureSuccess";
import "./QuickCapture.css";

const EMPTY_FORM = {
  first_name: "",
  last_name: "",
  phone: "",
  preferred_language: "spanish",
  source: "IN_PERSON"
};

function DuplicateDialog({ duplicate, qc, onOpen, onCancel }) {
  if (!duplicate) {
    return null;
  }

  return (
    <div className="quick-capture-overlay" role="dialog" aria-modal="true">
      <div className="quick-capture-dialog">
        <h3>{qc("quickCaptureDuplicateTitle")}</h3>
        <p>{qc("quickCaptureDuplicateMessage")}</p>
        <div className="quick-capture-dialog-actions">
          <button type="button" className="quick-capture-dialog-primary" onClick={onOpen}>
            {qc("quickCaptureOpenExisting")}
          </button>
          <button type="button" className="quick-capture-dialog-secondary" onClick={onCancel}>
            {qc("quickCaptureCancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function QuickCapture() {
  const { translate } = useLanguage();
  const { user, supportMode } = useWorkspace();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [duplicate, setDuplicate] = useState(null);
  const [completion, setCompletion] = useState(null);

  const effectiveOrganizationId =
    supportMode?.active && supportMode?.organizationId
      ? supportMode.organizationId
      : user?.organization_id || user?.organizationId || null;

  const qc = useMemo(
    () => (key) => resolveQuickCaptureCopy(translate, key),
    [translate]
  );

  const sourceOptions = useMemo(
    () => resolveQuickCaptureSourceOptions(translate),
    [translate]
  );

  const languageOptions = useMemo(
    () => resolveQuickCaptureLanguageOptions(translate),
    [translate]
  );

  function updateField(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => ({ ...current, [name]: null }));
    setSubmitError(null);
  }

  function validateClient() {
    const errors = {};

    if (!form.first_name.trim()) {
      errors.first_name = qc("quickCaptureRequired");
    }

    if (!form.last_name.trim()) {
      errors.last_name = qc("quickCaptureRequired");
    }

    if (!form.phone.trim()) {
      errors.phone = qc("quickCaptureRequired");
    }

    if (!form.preferred_language) {
      errors.preferred_language = qc("quickCaptureRequired");
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
      const result = await saveQuickCaptureProspect(form);

      if (result?.prospect?.phone) {
        setCompletion({
          prospect: result.prospect,
          recommendedAction: result.recommendedAction,
          estimatedMinutes: result.estimatedMinutes
        });
        return;
      }

      setSubmitError(qc("quickCaptureError"));
    } catch (error) {
      if (error instanceof QuickCaptureError && error.status === 409) {
        setDuplicate(error.payload?.prospect || null);
        return;
      }

      if (error instanceof QuickCaptureError && error.status === 401) {
        setSubmitError(qc("quickCaptureError"));
        return;
      }

      if (error instanceof QuickCaptureError && error.payload?.fields) {
        setFieldErrors(error.payload.fields);
        return;
      }

      setSubmitError(error.message || qc("quickCaptureError"));
    } finally {
      setLoading(false);
    }
  }

  function handleCaptureAnother() {
    setCompletion(null);
    setForm({ ...EMPTY_FORM });
    setFieldErrors({});
    setSubmitError(null);
    setDuplicate(null);
  }

  function openExistingProspect() {
    if (!duplicate?.phone) {
      setDuplicate(null);
      return;
    }

    // Defense in depth: never open a foreign-org row returned by a stale/global collision.
    if (
      effectiveOrganizationId &&
      duplicate.organization_id &&
      String(duplicate.organization_id) !== String(effectiveOrganizationId)
    ) {
      setDuplicate(null);
      setSubmitError(qc("quickCaptureError"));
      return;
    }

    navigateToProspectWorkspace(navigate, duplicate.phone);
  }

  if (completion) {
    return (
      <div className="quick-capture-page">
        <div className="quick-capture-shell">
          <div className="quick-capture-card">
            <QuickCaptureSuccess
              prospect={completion.prospect}
              recommendedAction={completion.recommendedAction}
              estimatedMinutes={completion.estimatedMinutes}
              onCaptureAnother={handleCaptureAnother}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="quick-capture-page">
      <div className="quick-capture-shell">
        <form className="quick-capture-card" onSubmit={handleSubmit}>
          <h1 className="quick-capture-title">{qc("quickCaptureTitle")}</h1>

          {submitError ? (
            <div className="quick-capture-banner quick-capture-banner--error">{submitError}</div>
          ) : null}

          <label className="quick-capture-field">
            <span className="quick-capture-label">{qc("quickCaptureFirstName")}</span>
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
            <span className="quick-capture-label">{qc("quickCaptureLastName")}</span>
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
            <span className="quick-capture-label">{qc("quickCapturePhone")}</span>
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
            <span className="quick-capture-label">{qc("quickCapturePreferredLanguage")}</span>
            <select
              className={`quick-capture-select${fieldErrors.preferred_language ? " quick-capture-input--error" : ""}`}
              value={form.preferred_language}
              onChange={(event) => updateField("preferred_language", event.target.value)}
            >
              {languageOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {fieldErrors.preferred_language ? (
              <span className="quick-capture-error-text">{fieldErrors.preferred_language}</span>
            ) : null}
          </label>

          <label className="quick-capture-field">
            <span className="quick-capture-label">{qc("quickCaptureHowDidYouMeet")}</span>
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
            {loading ? qc("quickCaptureSaving") : qc("quickCaptureSave")}
          </button>
        </form>
      </div>

      <DuplicateDialog
        duplicate={duplicate}
        qc={qc}
        onOpen={openExistingProspect}
        onCancel={() => setDuplicate(null)}
      />
    </div>
  );
}
