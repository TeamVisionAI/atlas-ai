import { useEffect, useId, useState } from "react";
import AtlasButton from "../ui/AtlasButton";
import {
  getConversation,
  sendHumanConversationReply,
  ConversationsCenterError
} from "../../services/conversationsCenterService";
import {
  buildHumanWhatsAppSendRequest,
  canSubmitHumanWhatsAppSend,
  isFreeformWhatsAppWindowOpen,
  normalizeCustomerCareWindow,
  resolveHumanWhatsAppComposerEnabled,
  resolveHumanWhatsAppComposerPhone,
  shouldBlockFreeformWhatsAppSend
} from "../../engines/humanWhatsAppComposer";
import { useLanguage } from "../../i18n/LanguageContext";
import "./HumanWhatsAppComposer.css";

function newClientRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function mapSendError(err, translate) {
  const code = err instanceof ConversationsCenterError ? err.code : null;
  if (code === "WHATSAPP_TEMPLATE_REQUIRED_OUTSIDE_WINDOW") {
    return translate("conversationsComposerWindowClosed");
  }
  if (code === "COMPOSER_REQUIRES_HUMAN_OWNERSHIP") {
    return translate("conversationsComposerRequiresHuman");
  }
  // Never surface raw provider / internal payloads.
  return translate("conversationsComposerFailed");
}

/**
 * Shared Human WhatsApp composer — Conversations, Mission Control, Prospect Workspace.
 * Send path: sendHumanConversationReply → /api/conversations/human-reply (BR-075).
 * Opening never mutates ownership.
 */
export default function HumanWhatsAppComposer({
  phone: phoneProp = null,
  workspace = null,
  ownershipState: ownershipProp = null,
  customerCareWindow: windowProp = undefined,
  /** When true, skip getConversation and use parent-provided ownership/window. */
  controlled = false,
  /** Prefill editable freeform body (interview actions inside 24h window). */
  initialMessage = "",
  variant = "inline",
  showHeader = true,
  showPhone = true,
  titleKey = "whatsappActionCustomMessage",
  testId = "human-whatsapp-composer",
  onClose = null,
  onSent = null,
  onSuccessToast = null,
  onErrorToast = null
}) {
  const { translate } = useLanguage();
  const inputId = useId();
  const phone = resolveHumanWhatsAppComposerPhone({
    phone: phoneProp,
    workspacePhone: workspace?.phone,
    prospectPhone: workspace?.prospect?.phone
  });

  const [ownershipState, setOwnershipState] = useState(
    controlled ? ownershipProp ?? null : null
  );
  const [customerCareWindow, setCustomerCareWindow] = useState(() =>
    controlled ? normalizeCustomerCareWindow(windowProp) : null
  );
  const [metaLoading, setMetaLoading] = useState(!controlled && Boolean(phone));
  const [metaError, setMetaError] = useState(null);
  const [message, setMessage] = useState(() => String(initialMessage || ""));
  const [clientRequestId, setClientRequestId] = useState(() => newClientRequestId());
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    setMessage(String(initialMessage || ""));
  }, [initialMessage, phone]);

  useEffect(() => {
    if (!controlled) return;
    setOwnershipState(ownershipProp ?? null);
    setCustomerCareWindow(normalizeCustomerCareWindow(windowProp));
    setMetaLoading(false);
    setMetaError(null);
  }, [controlled, ownershipProp, windowProp]);

  useEffect(() => {
    if (controlled) return undefined;

    if (!phone) {
      setOwnershipState(null);
      setCustomerCareWindow(null);
      setMetaLoading(false);
      setMetaError(null);
      return undefined;
    }

    let cancelled = false;
    setMetaLoading(true);
    setMetaError(null);

    getConversation(phone)
      .then((detail) => {
        if (cancelled) return;
        setOwnershipState(
          detail?.ownershipState || detail?.conversation?.ownershipState || null
        );
        setCustomerCareWindow(
          normalizeCustomerCareWindow(detail?.customerCareWindow)
        );
      })
      .catch(() => {
        if (cancelled) return;
        setOwnershipState(null);
        setCustomerCareWindow(null);
        setMetaError(translate("conversationsComposerFailed"));
      })
      .finally(() => {
        if (!cancelled) setMetaLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [controlled, phone, translate]);

  const composerEnabled = resolveHumanWhatsAppComposerEnabled(ownershipState);
  const windowClosed = shouldBlockFreeformWhatsAppSend(customerCareWindow);
  const windowOpen = isFreeformWhatsAppWindowOpen(customerCareWindow);
  const windowKnown = customerCareWindow != null;

  const canSend = canSubmitHumanWhatsAppSend({
    phone,
    message,
    ownershipState,
    sending,
    customerCareWindow,
    windowKnown
  });

  async function onSubmit(event) {
    event.preventDefault();
    if (!canSend) {
      if (windowClosed) {
        setStatus({
          type: "error",
          message: translate("conversationsComposerWindowClosed")
        });
      }
      return;
    }

    const payload = buildHumanWhatsAppSendRequest({
      phone,
      message,
      clientRequestId
    });

    setSending(true);
    setStatus(null);

    try {
      const result = await sendHumanConversationReply(payload.phone, {
        message: payload.message,
        clientRequestId: payload.clientRequestId
      });
      setMessage("");
      setClientRequestId(newClientRequestId());
      const successMessage = result.duplicateSuppressed
        ? translate("conversationsComposerDuplicateOk")
        : translate("conversationsComposerSent");
      setStatus({ type: "success", message: successMessage });
      onSuccessToast?.(successMessage);
      await onSent?.({ phone: payload.phone, result });
    } catch (err) {
      const errorMessage = mapSendError(err, translate);
      setStatus({ type: "error", message: errorMessage });
      onErrorToast?.(errorMessage);
      if (
        err instanceof ConversationsCenterError &&
        err.code === "WHATSAPP_TEMPLATE_REQUIRED_OUTSIDE_WINDOW"
      ) {
        const openFlag = err.delivery?.windowOpen;
        setCustomerCareWindow(
          normalizeCustomerCareWindow({
            open: typeof openFlag === "boolean" ? openFlag : false,
            reason: "WINDOW_EXPIRED"
          })
        );
      }
    } finally {
      setSending(false);
    }
  }

  if (!phone) {
    return null;
  }

  const hintMessage = (() => {
    if (status?.message) return status.message;
    if (metaError) return metaError;
    if (metaLoading) return translate("conversationsLoading");
    if (windowClosed) return translate("conversationsComposerWindowClosed");
    if (!composerEnabled) return translate("conversationsComposerRequiresHuman");
    if (!windowKnown) return translate("conversationsLoading");
    return translate("conversationsComposerHint");
  })();

  const inputDisabled =
    !composerEnabled || sending || metaLoading || windowClosed || !windowKnown;

  return (
    <section
      className={`human-whatsapp-composer human-whatsapp-composer--${variant}${
        composerEnabled ? " is-human" : " is-disabled"
      }${windowClosed ? " is-window-closed" : ""}`}
      data-testid={testId}
      data-phone={phone}
      data-ownership={ownershipState || "unknown"}
      data-composer-enabled={composerEnabled ? "true" : "false"}
      data-window-open={windowOpen ? "true" : windowClosed ? "false" : "unknown"}
      data-variant={variant}
      aria-label={translate(titleKey)}
    >
      {showHeader ? (
        <header className="human-whatsapp-composer__header">
          <div>
            <h3 className="human-whatsapp-composer__title">{translate(titleKey)}</h3>
            {showPhone ? (
              <p
                className="human-whatsapp-composer__phone"
                data-testid={`${testId}-phone`}
              >
                {phone}
              </p>
            ) : null}
          </div>
          {onClose ? (
            <AtlasButton type="button" variant="ghost" onClick={onClose}>
              {translate("commonCancel")}
            </AtlasButton>
          ) : null}
        </header>
      ) : null}

      {windowClosed ? (
        <p
          className="human-whatsapp-composer__window-warning"
          data-testid={`${testId}-window-warning`}
          role="status"
        >
          {translate("conversationsComposerWindowClosed")}
        </p>
      ) : null}

      <form className="human-whatsapp-composer__form" onSubmit={onSubmit}>
        <label className="human-whatsapp-composer__label" htmlFor={inputId}>
          {translate("conversationsComposerLabel")}
        </label>
        <textarea
          id={inputId}
          className="human-whatsapp-composer__input"
          data-testid={`${testId}-input`}
          rows={3}
          value={message}
          disabled={inputDisabled}
          placeholder={
            metaLoading || !windowKnown
              ? translate("conversationsLoading")
              : windowClosed
                ? translate("conversationsComposerWindowClosedShort")
                : composerEnabled
                  ? translate("conversationsComposerPlaceholder")
                  : translate("conversationsComposerRequiresHuman")
          }
          onChange={(event) => setMessage(event.target.value)}
        />
        <div className="human-whatsapp-composer__footer">
          <p
            className={`human-whatsapp-composer__hint${
              status?.type === "error" || windowClosed
                ? " human-whatsapp-composer__hint--error"
                : status?.type === "success"
                  ? " human-whatsapp-composer__hint--success"
                  : ""
            }`}
            role="status"
          >
            {hintMessage}
          </p>
          <AtlasButton
            type="submit"
            variant="primary"
            data-testid={`${testId}-send`}
            busy={sending}
            disabled={!canSend}
          >
            {sending
              ? translate("conversationsComposerSending")
              : translate("conversationsComposerSend")}
          </AtlasButton>
        </div>
      </form>
    </section>
  );
}
