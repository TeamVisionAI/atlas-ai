import AtlasButton from "../ui/AtlasButton";
import { useLanguage } from "../../i18n/LanguageContext";
import "./InterviewWhatsAppTemplateConfirm.css";

/**
 * Outside-24h confirm panel for approved Meta interview templates.
 * Explicit send only — no wa.me, no auto-send.
 */
export default function InterviewWhatsAppTemplateConfirm({
  session,
  busy = false,
  error = null,
  onCancel,
  onConfirm
}) {
  const { translate } = useLanguage();

  if (!session) {
    return null;
  }

  return (
    <section
      className="interview-wa-template-confirm"
      data-testid="interview-whatsapp-template-confirm"
      data-action={session.actionId || ""}
      data-template={session.metaTemplateName || ""}
      data-opens-wa-me="false"
      aria-label={translate("whatsappNativeTemplateConfirm")}
    >
      <header className="interview-wa-template-confirm__header">
        <h3 className="interview-wa-template-confirm__title">
          {translate("whatsappNativeTemplateConfirm")}
        </h3>
        <p className="interview-wa-template-confirm__subtitle">
          {translate("whatsappNativeTemplateSubtitle")}
        </p>
      </header>

      <dl className="interview-wa-template-confirm__meta">
        {session.phone ? (
          <>
            <dt>{translate("conversationsComposerLabel")}</dt>
            <dd data-testid="interview-whatsapp-template-phone">{session.phone}</dd>
          </>
        ) : null}
        {session.metaTemplateName ? (
          <>
            <dt>Template</dt>
            <dd data-testid="interview-whatsapp-template-name">
              {session.metaTemplateName}
            </dd>
          </>
        ) : null}
      </dl>

      {error ? (
        <p className="interview-wa-template-confirm__error" role="alert">
          {error}
        </p>
      ) : null}

      <footer className="interview-wa-template-confirm__actions">
        <AtlasButton
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={busy}
        >
          {translate("commonCancel")}
        </AtlasButton>
        <AtlasButton
          type="button"
          variant="primary"
          busy={busy}
          data-testid="interview-whatsapp-template-send"
          onClick={onConfirm}
        >
          {translate("whatsappNativeTemplateConfirm")}
        </AtlasButton>
      </footer>
    </section>
  );
}
