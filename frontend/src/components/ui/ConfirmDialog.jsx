import { useEffect, useRef } from "react";
import AtlasButton from "./AtlasButton";
import "../../styles/atlas-ui.css";

export default function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel
}) {
  const confirmRef = useRef(null);

  useEffect(() => {
    if (open) {
      confirmRef.current?.focus();
    }
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div className="atlas-ui-dialog-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="atlas-ui-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="atlas-confirm-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="atlas-confirm-title" className="atlas-ui-dialog__title">
          {title}
        </h3>
        {body ? <p className="atlas-ui-dialog__body">{body}</p> : null}
        <div className="atlas-ui-dialog__actions">
          <AtlasButton variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </AtlasButton>
          <AtlasButton ref={confirmRef} variant="primary" onClick={onConfirm}>
            {confirmLabel}
          </AtlasButton>
        </div>
      </div>
    </div>
  );
}
