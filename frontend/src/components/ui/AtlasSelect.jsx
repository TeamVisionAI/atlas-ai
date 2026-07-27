import { useCallback, useEffect, useId, useRef, useState } from "react";
import "../../styles/atlas-ui.css";
import "./AtlasSelect.css";

export default function AtlasSelect({
  label,
  value,
  onChange,
  options = [],
  placeholder = "Select…",
  className = "",
  id: idProp
}) {
  const autoId = useId();
  const id = idProp || autoId;
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);

  const selected = options.find((option) => option.value === value);
  const displayLabel = selected?.label || placeholder;

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handlePointerDown(event) {
      if (!rootRef.current?.contains(event.target)) {
        close();
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        close();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [close, open]);

  function selectOption(nextValue) {
    onChange(nextValue);
    close();
  }

  return (
    <div className={`atlas-ui-select ${open ? "atlas-ui-select--open" : ""} ${className}`.trim()} ref={rootRef}>
      {label ? (
        <span className="atlas-ui-select__label" id={`${id}-label`}>
          {label}
        </span>
      ) : null}
      <button
        type="button"
        id={id}
        className="atlas-ui-select__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={label ? `${id}-label` : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="atlas-ui-select__value">{displayLabel}</span>
        <span className="atlas-ui-select__chevron" aria-hidden="true" />
      </button>
      {open ? (
        <ul className="atlas-ui-select__menu" role="listbox" aria-labelledby={label ? `${id}-label` : id}>
          {options.map((option) => (
            <li key={option.value || "__all__"} role="none">
              <button
                type="button"
                role="option"
                aria-selected={value === option.value}
                className={`atlas-ui-select__option${value === option.value ? " atlas-ui-select__option--selected" : ""}`}
                onClick={() => selectOption(option.value)}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
