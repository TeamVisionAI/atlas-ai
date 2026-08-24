import { useState } from "react";
import { copyMessageToClipboard } from "../../services/whatsappCommunicationService";

/**
 * Prospect contact identity on appointment list cards (phone, @username, or unavailable).
 */
export default function AppointmentCardContactLine({ contact, translate }) {
  const [copyStatus, setCopyStatus] = useState("idle");

  if (!contact) {
    return null;
  }

  async function handleCopy(event) {
    event.preventDefault();
    event.stopPropagation();

    if (!contact.copyValue) {
      return;
    }

    try {
      await copyMessageToClipboard(contact.copyValue);
      setCopyStatus("ok");
      window.setTimeout(() => setCopyStatus("idle"), 1500);
    } catch {
      setCopyStatus("error");
      window.setTimeout(() => setCopyStatus("idle"), 1500);
    }
  }

  function stopPropagation(event) {
    event.stopPropagation();
  }

  return (
    <div
      className="appointments-page__contact"
      data-contact-kind={contact.contactKind}
    >
      {contact.contactKind === "phone" ? (
        <a
          className="appointments-page__contact-link"
          href={contact.telHref}
          onClick={stopPropagation}
        >
          {contact.contactLabel}
        </a>
      ) : contact.contactKind === "username" ? (
        <span className="appointments-page__contact-username">
          <span className="appointments-page__contact-label">{contact.contactLabel}</span>
          <button
            type="button"
            className="appointments-page__contact-copy"
            onClick={handleCopy}
            aria-label={translate("conversationsCopyPhone")}
          >
            {copyStatus === "ok"
              ? translate("conversationsPhoneCopied")
              : copyStatus === "error"
                ? translate("conversationsPhoneCopyFailed")
                : translate("conversationsCopyPhone")}
          </button>
        </span>
      ) : (
        <span className="appointments-page__contact-unavailable">{contact.contactLabel}</span>
      )}
    </div>
  );
}
