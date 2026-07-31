import { useEffect, useState } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import { validateProspectEmail } from "../../features/prospect-workspace/utils/prospectEditorModel";
import { updateProspectWorkspaceProfile, ProspectWorkspaceError } from "../../services/prospectWorkspaceService";
import { notifyProspectProfileUpdated } from "../../utils/prospectRefreshBus";

export default function MissionControlInlineEmailCapture({
  phone,
  email,
  disabled = false,
  onSaved
}) {
  const { translate } = useLanguage();
  const [draft, setDraft] = useState(email || "");
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(email || "");
    setError(null);
  }, [email, phone]);

  async function persistEmail() {
    const trimmed = draft.trim();
    const validationError = validateProspectEmail(trimmed, translate, { required: true });

    if (validationError) {
      setError(validationError);
      return;
    }

    if (trimmed === String(email || "").trim()) {
      setError(null);
      return;
    }

    if (!phone) {
      setError(translate("prospectEditorSaveFailed"));
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await updateProspectWorkspaceProfile(phone, { email: trimmed });
      notifyProspectProfileUpdated(phone);
      await onSaved?.(trimmed);
    } catch (saveError) {
      const payloadFields = saveError instanceof ProspectWorkspaceError ? saveError.payload?.fields : null;

      if (payloadFields?.email) {
        setError(payloadFields.email);
      } else {
        setError(saveError.message || translate("prospectEditorSaveFailed"));
      }
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(event) {
    if (event.key === "Enter") {
      event.preventDefault();
      void persistEmail();
    }
  }

  return (
    <div className="mc-cockpit__inline-email">
      <input
        type="email"
        className="mc-cockpit__inline-email-input"
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          if (error) {
            setError(null);
          }
        }}
        onBlur={() => {
          void persistEmail();
        }}
        onKeyDown={handleKeyDown}
        placeholder={translate("configurationEmail")}
        aria-label={translate("missionControlRowEmail")}
        autoComplete="email"
        disabled={disabled || saving}
      />
      {saving ? (
        <span className="mc-cockpit__inline-email-status" aria-live="polite">
          {translate("prospectEditorSaving")}
        </span>
      ) : null}
      {error ? (
        <span className="mc-cockpit__inline-email-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
