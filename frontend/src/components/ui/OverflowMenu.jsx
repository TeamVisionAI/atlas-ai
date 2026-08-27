import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./OverflowMenu.css";

function menuPosition(trigger, panelHeight) {
  const rect = trigger.getBoundingClientRect();
  const width = 188;
  const estimatedHeight = panelHeight || 220;
  const spaceBelow = window.innerHeight - rect.bottom;
  const openUp = spaceBelow < estimatedHeight + 12;
  const top = openUp ? rect.top - estimatedHeight - 4 : rect.bottom + 4;
  const left = Math.min(rect.right - width, window.innerWidth - width - 8);

  return {
    top: Math.max(8, top),
    left: Math.max(8, left),
    openUp
  };
}

export default function OverflowMenu({
  actions = [],
  onAction,
  ariaLabel = "More actions",
  children = null
}) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState({ top: 0, left: 0, openUp: false });
  const triggerRef = useRef(null);
  const panelRef = useRef(null);

  const hasContent = actions.length > 0 || Boolean(children);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      return undefined;
    }

    function reposition() {
      setPlacement(menuPosition(triggerRef.current, panelRef.current?.offsetHeight));
    }

    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, actions.length, children]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function onPointerDown(event) {
      const target = event.target;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    }

    function onKeyDown(event) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!hasContent) {
    return null;
  }

  return (
    <div className="overflow-menu">
      <button
        ref={triggerRef}
        type="button"
        className="overflow-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((current) => !current)}
      >
        •••
      </button>
      {open
        ? createPortal(
            <div
              ref={panelRef}
              className={`overflow-menu__panel${
                placement.openUp ? " overflow-menu__panel--up" : ""
              }`}
              role="menu"
              style={{ top: placement.top, left: placement.left }}
            >
              {actions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  role="menuitem"
                  className="overflow-menu__item"
                  disabled={action.disabled}
                  onClick={() => {
                    setOpen(false);
                    onAction?.(action.id);
                  }}
                >
                  {action.label}
                </button>
              ))}
              {children ? <div className="overflow-menu__extra">{children}</div> : null}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
