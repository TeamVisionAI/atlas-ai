import { useEffect, useRef, useState } from "react";
import AtlasButton from "./AtlasButton";
import "../../styles/atlas-ui.css";

export default function PromptDialog({
  open,
  title,
  label,
  placeholder,
  confirmLabel,
  cancelLabel,
  multiline = false,
  onConfirm,
  onCancel
}) {
  const inputRef = useRef(null);
  const [value, setValue] = useState("");

  useEffect(() => {
    if (open) {
      setValue("");
      inputRef.current?.focus();
    }
  }, [open]);

  if (!open) {
    return null;
  }

  function handleSubmit(event) {
    event.preventDefault();
    onConfirm?.(value);
  }

  const InputTag = multiline ? "textarea" : "input";

  return (
    <div className="atlas-ui-dialog-backdrop" role="presentation" onClick={onCancel}>
      <form
        className="atlas-ui-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="atlas-prompt-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h3 id="atlas-prompt-title" className="atlas-ui-dialog__title">
          {title}
        </h3>
        <label className="atlas-ui-dialog__field">
          {label ? <span className="atlas-ui-dialog__label">{label}</span> : null}
          <InputTag
            ref={inputRef}
            className="atlas-ui-dialog__input"
            value={value}
            placeholder={placeholder}
            rows={multiline ? 4 : undefined}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
        <div className="atlas-ui-dialog__actions">
          <AtlasButton type="button" variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </AtlasButton>
          <AtlasButton type="submit" variant="primary" disabled={!value.trim()}>
            {confirmLabel}
          </AtlasButton>
        </div>
      </form>
    </div>
  );
}
