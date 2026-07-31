import { useEffect } from "react";

const LOCK_CLASS = "atlas-modal-scroll-locked";

/**
 * Locks page scrolling while a modal is open and restores it on close.
 */
export function useModalScrollLock(active) {
  useEffect(() => {
    if (!active) {
      return undefined;
    }

    const { body, documentElement } = document;
    const scrollbarWidth = window.innerWidth - documentElement.clientWidth;
    const previousPaddingRight = body.style.paddingRight;

    body.classList.add(LOCK_CLASS);
    documentElement.classList.add(LOCK_CLASS);

    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      body.classList.remove(LOCK_CLASS);
      documentElement.classList.remove(LOCK_CLASS);
      body.style.paddingRight = previousPaddingRight;
    };
  }, [active]);
}
