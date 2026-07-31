import { useCallback, useEffect, useRef } from "react";
import AtlasButton from "../ui/AtlasButton";
import { useModalScrollLock } from "../../hooks/useModalScrollLock";
import "../../styles/atlas-ui.css";

function resolveModalScrollBody(root) {
  return root?.querySelector(".appointment-modal__body") || null;
}

function findScrollableAncestor(element, boundary) {
  let current = element;

  while (current && current !== boundary) {
    const style = window.getComputedStyle(current);
    const overflowY = style.overflowY;
    const canScroll =
      (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
      current.scrollHeight > current.clientHeight + 1;

    if (canScroll) {
      return current;
    }

    current = current.parentElement;
  }

  return boundary;
}

function shouldPreventModalWheel(event, scrollRoot) {
  if (!scrollRoot) {
    return true;
  }

  if (!scrollRoot.contains(event.target)) {
    return true;
  }

  const scrollTarget = findScrollableAncestor(event.target, scrollRoot);
  const { deltaY } = event;
  const { scrollTop, scrollHeight, clientHeight } = scrollTarget;
  const atTop = scrollTop <= 0;
  const atBottom = scrollTop + clientHeight >= scrollHeight - 1;

  return (deltaY < 0 && atTop) || (deltaY > 0 && atBottom);
}

export default function AppointmentModalShell({
  open,
  title,
  children,
  footer,
  onClose,
  wide = false,
  layout = "default"
}) {
  const closeRef = useRef(null);
  const backdropRef = useRef(null);

  useModalScrollLock(open);

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

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const backdrop = backdropRef.current;
    if (!backdrop) {
      return undefined;
    }

    function onWheel(event) {
      const scrollBody = resolveModalScrollBody(backdrop);

      if (shouldPreventModalWheel(event, scrollBody)) {
        event.preventDefault();
      }
    }

    function onTouchMove(event) {
      if (event.target === backdrop) {
        event.preventDefault();
      }
    }

    backdrop.addEventListener("wheel", onWheel, { passive: false });
    backdrop.addEventListener("touchmove", onTouchMove, { passive: false });

    return () => {
      backdrop.removeEventListener("wheel", onWheel);
      backdrop.removeEventListener("touchmove", onTouchMove);
    };
  }, [open]);

  const handleBackdropClick = useCallback(
    (event) => {
      if (event.target === event.currentTarget) {
        onClose?.();
      }
    },
    [onClose]
  );

  if (!open) {
    return null;
  }

  return (
    <div
      ref={backdropRef}
      className="atlas-ui-dialog-backdrop"
      role="presentation"
      onClick={handleBackdropClick}
    >
      <div
        className={[
          "atlas-ui-dialog",
          "appointment-modal",
          wide ? "appointment-modal--wide" : "",
          layout === "scheduling" ? "appointment-modal--scheduling" : ""
        ]
          .filter(Boolean)
          .join(" ")}
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
