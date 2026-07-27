import { useEffect, useRef } from "react";
import AtlasButton from "../ui/AtlasButton";
import "../../styles/atlas-ui.css";

export default function AppointmentModalShell({
  open,
  title,
  children,
  footer,
  onClose,
  wide = false
}) {
  const closeRef = useRef(null);

  useEffect(() => {
    if (open) {
      closeRef.current?.focus();
    }
  }, [open]);

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

  return (
    <div className="atlas-ui-dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className={`atlas-ui-dialog appointment-modal${wide ? " appointment-modal--wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="appointment-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="appointment-modal__header">
          <h3 id="appointment-modal-title" className="atlas-ui-dialog__title">
            {title}
          </h3>
          <button
            ref={closeRef}
            type="button"
            className="appointment-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>
        <div className="appointment-modal__body">{children}</div>
        {footer ? <div className="appointment-modal__footer">{footer}</div> : null}
      </div>
    </div>
  );
}

export function AppointmentModalActions({ onCancel, cancelLabel, onConfirm, confirmLabel, confirmDisabled, loading }) {
  return (
    <div className="atlas-ui-dialog__actions">
      <AtlasButton variant="ghost" onClick={onCancel} disabled={loading}>
        {cancelLabel}
      </AtlasButton>
      <AtlasButton variant="primary" onClick={onConfirm} disabled={confirmDisabled || loading}>
        {loading ? "…" : confirmLabel}
      </AtlasButton>
    </div>
  );
}
